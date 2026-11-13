// Small shared pieces for the Singles Ladder screens.
import { useState } from 'react';
import { Message } from '../../components/UI';
import { formatInZone, zonedTime } from '../../../functions/lib/singlesLadder/time.js';
import { REQUEST_CATEGORIES } from '../../../functions/lib/singlesLadder/config.js';
import { useLadder, useAction } from './LadderContext';
import { nextStep, opponentOf, STATUS_LABELS, dueAt } from './selectors';

export const Chip = ({ tone = 'muted', children }) => <span className={`lchip ${tone}`}>{children}</span>;
// A time shown in the season timezone (stored in UTC).
export function When({ at }) { const { rules } = useLadder(); return <time dateTime={at ? new Date(at).toISOString() : undefined}>{formatInZone(at, rules?.deadline.timezone || 'America/Chicago')}</time>; }
// "2026-11-20" from a date field -> the last millisecond of that day in the season timezone.
export const endOfDay = (date, timezone) => { const [y, m, d] = date.split('-').map(Number); return zonedTime(y, m, d, 23, 59, timezone) + 59999; };
export const Form = ({ label, onSubmit, children, className = '' }) => <form className={`lform ${className}`} aria-label={label} onSubmit={e => { e.preventDefault(); onSubmit(); }}>{children}</form>;
export function Input({ label, hint, id, ...props }) {
  return <label className="lfield" htmlFor={id}><span>{label}</span><input id={id} {...props} />{hint && <small>{hint}</small>}</label>;
}
// Why an exemption or extension is being asked for (the list the server accepts).
export function CategorySelect({ id, value, onChange }) { return <Select label="What is it for?" id={id} required value={value} onChange={e => onChange(e.target.value)}><option value="">Choose…</option>{Object.entries(REQUEST_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>; }
export function Select({ label, id, children, ...props }) { return <label className="lfield" htmlFor={id}><span>{label}</span><select id={id} {...props}>{children}</select></label>; }

const TONES = { pending: 'warn', accepted: 'sky', submitted: 'warn', disputed: 'danger', completed: 'good' };
// One challenge with everything the signed-in player may do about it. The server re-checks every action.
export function ChallengeCard({ challenge: c, compact = false }) {
  const { season, playerId, rules, act } = useLadder(), { busy, error, run } = useAction();
  const [panel, setPanel] = useState(null), [winnerId, setWinner] = useState(c.challengerId), [score, setScore] = useState(''), [until, setUntil] = useState(''), [reason, setReason] = useState(''), [category, setCategory] = useState('');
  const name = id => season.players?.[id]?.name || 'Unknown player', step = nextStep(c, playerId), mine = !!step || c.challengerId === playerId || c.opponentId === playerId;
  const send = (payload, done) => run(async () => { await act({ challengeId: c.id, ...payload }); setPanel(null); done?.(); });
  const v = c.rules?.values, due = dueAt(c), tz = rules?.deadline.timezone || 'America/Chicago';
  return (
    <article className={`lcard challenge ${c.status}`} data-testid="challenge-card">
      <header>
        <h3><span>{name(c.challengerId)}</span> <i>vs</i> <span>{name(c.opponentId)}</span></h3>
        <Chip tone={TONES[c.status]}>{STATUS_LABELS[c.status]}</Chip>
      </header>
      <p className="lmeta">
        #{c.ranks.challenger} challenged #{c.ranks.opponent}
        {c.status === 'pending' && <> · answer by <When at={c.respondBy} /></>}
        {c.status === 'accepted' && <> · play by <When at={due} />{c.extensionUntil ? ' (extended)' : ''}</>}
        {c.result?.score && <> · <b>{c.result.score}</b></>}
        {c.result && c.status !== 'accepted' && <> · {c.result.kind === 'played' ? 'won by' : c.result.kind === 'noShow' ? 'no-show, win to' : 'walkover to'} {name(c.result.winnerId)}</>}
      </p>
      {c.outcome && !compact && <p className="lmeta">
        {Object.entries(c.outcome.points || {}).map(([id, n]) => `${name(id)} ${n >= 0 ? '+' : ''}${n}`).join(' · ')}
        {c.outcome.late && ' · late result: no bonuses or position change'}{c.outcome.moved && ' · positions changed'}
      </p>}
      {c.status === 'disputed' && <p className="lmeta">{c.review === 'noShow' ? 'A no-show was reported. An organizer will decide.' : 'The result is disputed. An organizer will decide.'}</p>}
      {mine && !compact && <>
        <div className="lactions">
          {step === 'respond' && <><button className="button small" disabled={busy} onClick={() => send({ action: 'respond', accept: true })}>Accept</button><button className="secondary small" disabled={busy} onClick={() => setPanel(panel === 'decline' ? null : 'decline')}>Decline</button></>}
          {step === 'waiting' && c.status === 'pending' && <button className="secondary small" disabled={busy} onClick={() => send({ action: 'withdraw' })}>Withdraw challenge</button>}
          {step === 'waiting' && c.status === 'submitted' && <span className="lmeta">Waiting for {name(opponentOf(c, playerId))} to confirm.</span>}
          {step === 'report' && <><button className="button small" disabled={busy} onClick={() => setPanel(panel === 'score' ? null : 'score')}>Report score</button>
            {v?.extension.enabled && <button className="secondary small" disabled={busy} onClick={() => setPanel(panel === 'extend' ? null : 'extend')}>Request extension</button>}
            {v?.noShow.enabled && <button className="secondary small" disabled={busy} onClick={() => setPanel(panel === 'noShow' ? null : 'noShow')}>Report no-show</button>}</>}
          {step === 'confirm' && <><button className="button small" disabled={busy} onClick={() => send({ action: 'confirm' })}>Confirm result</button><button className="secondary small" disabled={busy} onClick={() => send({ action: 'dispute' })}>Dispute</button></>}
        </div>
        {panel === 'decline' && <div className="lpanel"><p>{v?.decline.enabled ? `Valid declines count: ${v.decline.free} free, then −${v.decline.penaltyPoints} points each${v.decline.dropThreshold ? `; ${v.decline.dropThreshold} can trigger a ${v.decline.dropPositions}-position drop` : ''}.` : 'Declining carries no penalty this season.'}</p><button className="secondary small" disabled={busy} onClick={() => send({ action: 'respond', accept: false })}>Yes, decline</button></div>}
        {panel === 'score' && <Form label="Report score" className="lpanel" onSubmit={() => send({ action: 'submit', winnerId, score })}>
          <Select label="Winner" id={`w-${c.id}`} value={winnerId} onChange={e => setWinner(e.target.value)}>{[c.challengerId, c.opponentId].map(id => <option key={id} value={id}>{name(id)}</option>)}</Select>
          <Input label={`Score (${name(c.challengerId)}’s games first)`} id={`s-${c.id}`} required placeholder="6-4 3-6 10-8" inputMode="text" autoComplete="off" value={score} onChange={e => setScore(e.target.value)} />
          <button className="button small" disabled={busy || !score.trim()}>Send for confirmation</button>
        </Form>}
        {panel === 'extend' && <Form label="Request extension" className="lpanel" onSubmit={() => send({ action: 'request', type: 'extension', category, until: endOfDay(until, tz), reason })}>
          <CategorySelect id={`c-${c.id}`} value={category} onChange={setCategory} />
          <Input label="New deadline (end of day, season time)" id={`u-${c.id}`} type="date" required value={until} onChange={e => setUntil(e.target.value)} hint={`At most ${v.extension.maxDays} days after the current deadline. An organizer decides.`} />
          <Input label="Reason (organizers only)" id={`r-${c.id}`} required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          <button className="button small" disabled={busy || !until || !category || reason.trim().length < 3}>Send request</button>
        </Form>}
        {panel === 'noShow' && <div className="lpanel"><p>Report a no-show only if {name(opponentOf(c, playerId))} had not arrived {v.noShow.graceMinutes} minutes after the agreed time and gave no notice. {v.noShow.requireOrganizer ? 'An organizer will decide.' : 'They can confirm or dispute it.'}</p><button className="secondary small" disabled={busy} onClick={() => send({ action: 'submit', kind: 'noShow' })}>Report no-show</button></div>}
        <Message error>{error}</Message>
      </>}
    </article>
  );
}
