import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Message } from '../../components/UI';
import { useLadder, useAction } from './LadderContext';
import { entries, pointsBreakdown, POINT_LABELS } from './selectors';
import { Chip, Form, Input, When, endOfDay, CategorySelect } from './ui';
import { REQUEST_CATEGORIES } from '../../../functions/lib/singlesLadder/config.js';

const REQUEST_TONE = { pending: 'warn', approved: 'good', denied: 'muted' };
export default function Activity() {
  const { season, playerId, me, signedIn, requests, notifications, rules, meta, act } = useLadder(), { busy, error, run } = useAction();
  const [until, setUntil] = useState(''), [reason, setReason] = useState(''), [category, setCategory] = useState('');
  if (!me) return <EmptyState icon="user" title="Your ladder activity">{signedIn ? 'This sign-in is not linked to a ladder player yet. Ask an organizer.' : <>Sign in to see your points, notifications and requests. <Link className="button small" to="/captain">Sign in</Link></>}</EmptyState>;
  const points = pointsBreakdown(season, playerId), notes = entries(notifications).sort((a, b) => b.at - a.at), mine = entries(requests).sort((a, b) => b.createdAt - a.createdAt);
  const name = id => season.players?.[id]?.name || 'a player';
  return (
    <>
      <h2 className="lsection">Points breakdown</h2>
      <div className="lcard">
        <p className="points-total"><b>{me.points}</b> points</p>
        {points.totals.length ? <ul className="points-totals">{points.totals.map(t => <li key={t.type}><span>{t.label}</span><b>{t.amount > 0 ? '+' : ''}{t.amount}</b></li>)}</ul> : <p className="lmeta">You have not earned any points yet.</p>}
        {points.lines.length > 0 && <details><summary>Every entry ({points.lines.length})</summary><ul className="points-lines">{points.lines.map(e => <li key={e.id}><When at={e.at} /><span>{POINT_LABELS[e.type] || e.type}{e.challengeId && season.challenges?.[e.challengeId] ? ` · ${name(season.challenges[e.challengeId].challengerId)} v ${name(season.challenges[e.challengeId].opponentId)}` : ''}{e.note ? ` · ${e.note}` : ''}</span><b>{e.amount > 0 ? '+' : ''}{e.amount}</b></li>)}</ul></details>}
      </div>
      <h2 className="lsection">Notifications</h2>
      {notes.length ? <ul className="note-list">{notes.slice(0, 30).map(n => <li key={n.id}><span>{n.text}</span><When at={n.at} /></li>)}</ul> : <p className="lmeta">Nothing yet. Challenges, results and organizer decisions will show up here.</p>}
      <h2 className="lsection">Exemptions and extensions</h2>
      <div className="lcard">
        <p>Going to be away or injured? Ask for an exemption so the {rules.inactivity.enabled ? `${rules.inactivity.days}-day inactivity rule` : 'ladder'} does not count against you. Extensions for a match are requested from the match itself.</p>
        <Form label="Request an exemption" onSubmit={() => run(async () => { await act({ action: 'request', type: 'exemption', category, until: endOfDay(until, rules.deadline.timezone), reason }); setUntil(''); setReason(''); setCategory(''); })}>
          <CategorySelect id="exempt-category" value={category} onChange={setCategory} />
          <Input label="Exempt until (end of day, season time)" id="exempt-until" type="date" required value={until} onChange={e => setUntil(e.target.value)} />
          <Input label="Reason (organizers only)" id="exempt-reason" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          <button className="button small" disabled={busy || !until || !category || reason.trim().length < 3 || meta.status !== 'active'}>Request exemption</button>
        </Form>
        <Message error>{error}</Message>
        {mine.length > 0 && <ul className="request-list">{mine.map(r => <li key={r.id}><span><b>{r.type === 'exemption' ? 'Exemption' : 'Extension'}</b>{r.category ? ` (${REQUEST_CATEGORIES[r.category] || r.category})` : ''} until <When at={r.until} />{r.note ? ` · ${r.note}` : ''}</span><Chip tone={REQUEST_TONE[r.status]}>{r.status}</Chip></li>)}</ul>}
      </div>
    </>
  );
}
