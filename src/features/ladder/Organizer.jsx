// Organizer dashboard. Every button here is a request to the backend, which checks the admin role again, applies the
// change atomically and writes the audit entry. Hiding this page from players is a convenience, not the protection.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Message } from '../../components/UI';
import PprcLookup from '../../components/PprcLookup';
import { useLadder, useLadderAdmin, useAction } from './LadderContext';
import { standings, entries, isActive, exportCsv, STATUS_LABELS } from './selectors';
import { Chip, Form, Input, Select, When, endOfDay } from './ui';
import RulesSettings from './RulesSettings';

const TABS = [['season', 'Season'], ['players', 'Players'], ['matches', 'Matches'], ['requests', 'Requests'], ['rules', 'Rules settings'], ['audit', 'Audit'], ['export', 'Export']];
const Reason = ({ id, value, onChange }) => <Input label="Reason (kept in the audit log)" id={id} required minLength={3} maxLength={500} value={value} onChange={e => onChange(e.target.value)} />;
const ok = reason => reason.trim().length >= 3;

function SeasonTab() {
  const { seasons, seasonId, meta, act, demo, season } = useLadder(), { busy, error, run } = useAction();
  const [name, setName] = useState(''), [copy, setCopy] = useState(''), [reason, setReason] = useState(''), [note, setNote] = useState('');
  const status = to => run(async () => { await act({ action: 'setStatus', status: to, reason }); setReason(''); });
  return (
    <>
      {meta && <div className="lcard">
        <h3>{meta.name}</h3>
        <p className="lmeta">Created <When at={meta.createdAt} />{meta.activatedAt && <> · opened <When at={meta.activatedAt} /></>}{meta.closedAt && <> · closed <When at={meta.closedAt} /></>} · {Object.keys(season?.players || {}).length} players · rules version {season?.rules.version}</p>
        {meta.status !== 'closed' && <>
          <Reason id="status-reason" value={reason} onChange={setReason} />
          <div className="lactions">
            {meta.status === 'draft' && <button className="button small" disabled={busy || !ok(reason)} onClick={() => status('active')}>Open season</button>}
            {meta.status === 'active' && <button className="secondary small" disabled={busy || !ok(reason)} onClick={() => status('frozen')}>Freeze season</button>}
            {meta.status === 'frozen' && <button className="button small" disabled={busy || !ok(reason)} onClick={() => status('active')}>Unfreeze season</button>}
            {meta.status !== 'draft' && <button className="danger small" disabled={busy || !ok(reason)} onClick={() => window.confirm('Close this season for good? Its records can never change again.') && status('closed')}>Close season</button>}
            {meta.status === 'active' && <button className="secondary small" disabled={busy} onClick={() => run(async () => { await act({ action: 'sweep' }); setNote('Unanswered challenges and inactivity were checked.'); })}>Run time-based checks now</button>}
          </div>
          <p className="lmeta">Frozen: players cannot challenge, answer or report, and automatic penalties stop; organizers can still settle disputes. Closed is permanent.</p>
        </>}
      </div>}
      <Form label="Create a season" className="lcard" onSubmit={() => run(async () => { await act({ action: 'createSeason', name, ...(copy ? { copyRulesFrom: copy } : {}) }); setName(''); setNote('Season created as a draft. Enroll players, check the rules, then open it.'); })}>
        <h3>Create a season</h3>
        <Input label="Season name" id="season-name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
        <Select label="Starting rules" id="season-copy" value={copy} onChange={e => setCopy(e.target.value)}><option value="">Initial defaults</option>{Object.entries(seasons).map(([id, s]) => <option key={id} value={id}>Copy from {s.name}</option>)}</Select>
        <button className="button small" disabled={busy || name.trim().length < 2}>Create draft season</button>
      </Form>
      {demo && <div className="lcard demo-tools"><h3>Local demo tools</h3><p className="lmeta">Only in the local demo. Creates a made-up roster through the real rules engine; never available on the live site.</p>
        <div className="lactions">{!seasonId && <button className="secondary small" disabled={busy} onClick={() => run(() => demo.seed())}>Create demo season</button>}
          {seasonId && standings(season).slice(0, 12).map(p => p.id.startsWith('ladder_demo_') && <button key={p.id} className="secondary small" disabled={busy} onClick={() => run(() => demo.loginAs(p.id))}>Sign in as {p.name}</button>)}</div></div>}
      <Message error>{error}</Message><Message>{note}</Message>
    </>
  );
}

function PlayerRow({ player, uid }) {
  const { act, season } = useLadder(), { busy, error, run } = useAction();
  const [open, setOpen] = useState(false), [rank, setRank] = useState(''), [delta, setDelta] = useState(''), [reason, setReason] = useState(''), [account, setAccount] = useState(''), [until, setUntil] = useState('');
  const tz = season.rules.values.deadline.timezone;
  const adjust = extra => run(async () => { await act({ action: 'adjust', playerId: player.id, reason, ...extra }); setRank(''); setDelta(''); });
  return (
    <li className="org-player">
      <button type="button" className="org-player-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="lrank">{player.rank}</span><strong>{player.name}</strong><span>{player.points} pts · UTR {player.utr ?? '—'}</span><Chip tone={player.status.tone}>{player.status.label}</Chip><Chip tone={uid ? 'good' : 'warn'}>{uid ? 'Linked' : 'No sign-in'}</Chip>
      </button>
      {open && <div className="lpanel">
        <p className="lmeta">Player ID <code>{player.id}</code>{uid && <> · account <code>{uid}</code></>} · last active {player.lastActiveAt ? <When at={player.lastActiveAt} /> : 'never'}{player.exemptUntil > Date.now() && <> · exempt until <When at={player.exemptUntil} /></>}</p>
        <Reason id={`reason-${player.id}`} value={reason} onChange={setReason} />
        <div className="org-grid">
          <Form label="Move position" onSubmit={() => adjust({ rank: Number(rank) })}><Input label="New position" id={`rank-${player.id}`} type="number" min="1" max={Object.keys(season.players).length} required value={rank} onChange={e => setRank(e.target.value)} /><button className="secondary small" disabled={busy || !rank || !ok(reason)}>Move</button></Form>
          <Form label="Adjust points" onSubmit={() => adjust({ pointsDelta: Number(delta) })}><Input label="Points to add (negative removes)" id={`points-${player.id}`} type="number" min="-100" max="100" required value={delta} onChange={e => setDelta(e.target.value)} /><button className="secondary small" disabled={busy || !Number(delta) || !ok(reason)}>Adjust</button></Form>
          <Form label="Grant exemption" onSubmit={() => run(async () => { await act({ action: 'grant', type: 'exemption', playerId: player.id, until: endOfDay(until, tz), reason }); setUntil(''); })}><Input label="Exempt until" id={`exempt-${player.id}`} type="date" required value={until} onChange={e => setUntil(e.target.value)} /><button className="secondary small" disabled={busy || !until || !ok(reason)}>Grant exemption</button></Form>
        </div>
        <div className="lactions">
          <button className="secondary small" disabled={busy || !ok(reason)} onClick={() => adjust({ eligible: !player.eligible })}>{player.eligible ? 'Mark not eligible' : 'Mark eligible'}</button>
          <button className="secondary small" disabled={busy || !ok(reason)} onClick={() => adjust({ markActive: true })}>Record activity today</button>
          {uid && <button className="secondary small" disabled={busy || !ok(reason)} onClick={() => run(() => act({ action: 'unlink', uid, reason }))}>Unlink sign-in</button>}
        </div>
        {!uid && <Form label="Link sign-in" onSubmit={() => run(async () => { await act({ action: 'link', uid: account.trim(), playerId: player.id }); setAccount(''); })}>
          <Input label="Verified account ID" id={`uid-${player.id}`} required autoCapitalize="none" spellCheck="false" value={account} onChange={e => setAccount(e.target.value)} hint="The player reads this ID on their Ladder page after signing in. Confirm with them in person that the account is theirs; a matching name is not proof." />
          <button className="button small" disabled={busy || !account.trim()}>Link verified sign-in</button>
        </Form>}
        <Message error>{error}</Message>
      </div>}
    </li>
  );
}
function PlayersTab() {
  const { season, act, meta } = useLadder(), { accounts } = useLadderAdmin(), { busy, error, run } = useAction();
  const [query, setQuery] = useState(''), [picked, setPicked] = useState(null), [manual, setManual] = useState(''), [reason, setReason] = useState(''), [note, setNote] = useState('');
  const uidOf = Object.fromEntries(Object.entries(accounts).map(([uid, playerId]) => [playerId, uid])), rows = standings(season), playerId = picked?.id || manual.trim();
  const canSeed = meta.status === 'draft' || !Object.keys(season.challenges || {}).length;
  return (
    <>
      <Form label="Enroll a player" className="lcard" onSubmit={() => run(async () => { await act({ action: 'enroll', playerId }); setQuery(''); setPicked(null); setManual(''); setNote('Player enrolled at the bottom of the ladder. The name and UTR come from the PPRC list.'); })}>
        <h3>Enroll a player</h3>
        <Input label="Find a PPRC player by name" id="enroll-name" autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setPicked(null); }} />
        <PprcLookup query={query} linked={picked} onPick={setPicked} onUnlink={() => setPicked(null)} />
        {!picked && <Input label="or enter the PPRC player ID" id="enroll-id" autoCapitalize="none" spellCheck="false" value={manual} onChange={e => setManual(e.target.value)} hint="Players are always existing PPRC records; the ladder never creates a player from a typed name." />}
        <button className="button small" disabled={busy || !playerId || meta.status === 'closed'}>Enroll</button>
      </Form>
      <div className="lcard">
        <h3>Seeding and PPRC data</h3>
        <Reason id="seed-reason" value={reason} onChange={setReason} />
        <div className="lactions">
          <button className="secondary small" disabled={busy || !canSeed || !ok(reason)} title={canSeed ? '' : 'Only before the first challenge'} onClick={() => run(async () => { await act({ action: 'seed', reason }); setNote('Positions set from UTR, highest first.'); })}>Seed positions from UTR</button>
          <button className="secondary small" disabled={busy} onClick={() => run(async () => { const result = await act({ action: 'syncPlayers' }); setNote(`${result.updated} player record${result.updated === 1 ? '' : 's'} refreshed from the PPRC list. Positions and points did not change.`); })}>Refresh names and UTRs from PPRC</button>
        </div>
        {!canSeed && <p className="lmeta">Seeding from UTR is only possible before the first challenge. After that, move players one at a time so each change has its own reason.</p>}
      </div>
      <Message error>{error}</Message><Message>{note}</Message>
      {rows.length ? <ul className="org-list">{rows.map(p => <PlayerRow key={p.id} player={p} uid={uidOf[p.id]} />)}</ul> : <EmptyState icon="users" title="No players enrolled">Enroll players above, then seed positions from UTR.</EmptyState>}
    </>
  );
}

function MatchRow({ challenge: c }) {
  const { season, act } = useLadder(), { busy, error, run } = useAction();
  const [open, setOpen] = useState(false), [winnerId, setWinner] = useState(c.result?.winnerId || c.challengerId), [kind, setKind] = useState(c.result?.kind || 'played'), [score, setScore] = useState(c.result?.score || ''), [reason, setReason] = useState(''), [until, setUntil] = useState('');
  const name = id => season.players?.[id]?.name || id, tz = season.rules.values.deadline.timezone, decidable = ['accepted', 'submitted', 'disputed'].includes(c.status);
  const send = payload => run(async () => { await act({ challengeId: c.id, reason, ...payload }); setOpen(false); });
  return (
    <li className="org-player">
      <button type="button" className="org-player-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong>{name(c.challengerId)} v {name(c.opponentId)}</strong><span>{c.result?.score || ''}</span><Chip tone={c.status === 'disputed' ? 'danger' : isActive(c) ? 'warn' : 'muted'}>{STATUS_LABELS[c.status]}</Chip>
      </button>
      {open && <div className="lpanel">
        <p className="lmeta">Sent <When at={c.createdAt} />{c.deadline && <> · due <When at={c.extensionUntil || c.deadline} /></>}{c.result && <> · reported <When at={c.result.submittedAt} /> ({c.result.kind}, winner {name(c.result.winnerId)})</>} · rules version {c.rules.version}{c.review === 'noShow' && ' · no-show reported'}</p>
        {(isActive(c) || c.status === 'completed') && <Reason id={`mr-${c.id}`} value={reason} onChange={setReason} />}
        {decidable && <Form label="Decide result" onSubmit={() => send({ action: 'resolve', winnerId, kind, ...(kind === 'played' ? { score } : {}) })}>
          <div className="org-grid">
            <Select label="Winner" id={`mw-${c.id}`} value={winnerId} onChange={e => setWinner(e.target.value)}>{[c.challengerId, c.opponentId].map(id => <option key={id} value={id}>{name(id)}</option>)}</Select>
            <Select label="Result type" id={`mk-${c.id}`} value={kind} onChange={e => setKind(e.target.value)}><option value="played">Played match</option><option value="walkover">Walkover (with notice)</option><option value="noShow">No-show</option></Select>
            {kind === 'played' && <Input label="Score (challenger’s games first)" id={`ms-${c.id}`} required placeholder="6-4 6-3" value={score} onChange={e => setScore(e.target.value)} />}
          </div>
          <button className="button small" disabled={busy || !ok(reason)}>Record final decision</button>
        </Form>}
        {c.status === 'accepted' && <Form label="Extend deadline" onSubmit={() => run(() => act({ action: 'grant', type: 'extension', challengeId: c.id, until: endOfDay(until, tz), reason }))}><Input label="Extend deadline to (end of day)" id={`me-${c.id}`} type="date" required value={until} onChange={e => setUntil(e.target.value)} /><button className="secondary small" disabled={busy || !until || !ok(reason)}>Grant extension</button></Form>}
        <div className="lactions">
          {isActive(c) && <button className="danger small" disabled={busy || !ok(reason)} onClick={() => send({ action: 'cancel' })}>Cancel challenge</button>}
          {c.status === 'completed' && <button className="danger small" disabled={busy || !ok(reason)} onClick={() => send({ action: 'voidResult' })}>Void result and reverse its points</button>}
        </div>
        {c.status === 'completed' && <p className="lmeta">Voiding reverses the points with new ledger entries. Positions are not moved back automatically: adjust them under Players so each move has its own reason.</p>}
        <Message error>{error}</Message>
      </div>}
    </li>
  );
}
function MatchesTab() {
  const { season } = useLadder(), all = entries(season.challenges).sort((a, b) => b.createdAt - a.createdAt), open = all.filter(isActive), done = all.filter(c => !isActive(c));
  if (!all.length) return <EmptyState icon="ball" title="No challenges yet">Challenges appear here as players send them.</EmptyState>;
  return <><h3 className="lsection">Needs attention or in play ({open.length})</h3><ul className="org-list">{open.map(c => <MatchRow key={c.id} challenge={c} />)}</ul><h3 className="lsection">Finished ({done.length})</h3><ul className="org-list">{done.slice(0, 100).map(c => <MatchRow key={c.id} challenge={c} />)}</ul></>;
}

function RequestsTab() {
  const { season, act } = useLadder(), { requests } = useLadderAdmin(), { busy, error, run } = useAction(), [reason, setReason] = useState('');
  const name = id => season.players?.[id]?.name || id;
  const pending = Object.entries(requests).flatMap(([playerId, list]) => Object.entries(list || {}).map(([id, r]) => ({ id, playerId, ...r }))).filter(r => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const penalties = entries(season.penalties).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <>
      <div className="lcard"><Reason id="decision-reason" value={reason} onChange={setReason} /><p className="lmeta">Used for every decision below. Player reasons on this page are private to organizers.</p></div>
      <h3 className="lsection">Exemption and extension requests ({pending.length})</h3>
      {pending.length ? <ul className="org-list">{pending.map(r => (
        <li key={r.id} className="lcard"><p><b>{name(r.playerId)}</b> asks for {r.type === 'exemption' ? 'an exemption' : `an extension for ${name(season.challenges?.[r.challengeId]?.challengerId)} v ${name(season.challenges?.[r.challengeId]?.opponentId)}`} until <When at={r.until} /></p><p className="lmeta">“{r.reason}” · asked <When at={r.createdAt} /></p>
          <div className="lactions"><button className="button small" disabled={busy} onClick={() => run(() => act({ action: 'decideRequest', playerId: r.playerId, requestId: r.id, approve: true, reason }))}>Approve</button><button className="secondary small" disabled={busy} onClick={() => run(() => act({ action: 'decideRequest', playerId: r.playerId, requestId: r.id, approve: false, reason }))}>Deny</button></div></li>
      ))}</ul> : <p className="lmeta">No requests are waiting.</p>}
      <h3 className="lsection">Penalties</h3>
      {penalties.length ? <ul className="org-list">{penalties.map(p => (
        <li key={p.id} className="lcard"><p><b>{name(p.playerId)}</b>: {p.positions}-position drop for {p.type === 'decline' ? 'declined challenges' : 'inactivity'} <Chip tone={p.status === 'pending' ? 'warn' : p.status === 'applied' ? 'danger' : 'muted'}>{p.status}</Chip></p>
          <p className="lmeta">Raised <When at={p.createdAt} /> under rules version {p.rulesVersion}{p.decidedAt && <> · decided <When at={p.decidedAt} /> {p.decidedBy === 'system' ? 'automatically' : 'by an organizer'}</>}</p>
          {p.status === 'pending' && <div className="lactions"><button className="danger small" disabled={busy || !ok(reason)} onClick={() => run(() => act({ action: 'decidePenalty', penaltyId: p.id, apply: true, reason }))}>Apply drop</button><button className="secondary small" disabled={busy || !ok(reason)} onClick={() => run(() => act({ action: 'decidePenalty', penaltyId: p.id, apply: false, reason }))}>Waive</button></div>}</li>
      ))}</ul> : <p className="lmeta">No penalties have been raised this season.</p>}
      <Message error>{error}</Message>
    </>
  );
}

function AuditTab() {
  const { seasonId, season } = useLadder(), { audit, error } = useLadderAdmin();
  const rows = entries(audit).filter(a => !a.seasonId || a.seasonId === seasonId).sort((a, b) => b.at - a.at).slice(0, 300), name = id => season?.players?.[id]?.name || id;
  if (error) return <Message error>{error}</Message>;
  if (!rows.length) return <EmptyState icon="list" title="Nothing recorded yet">Every organizer action and every position change is listed here.</EmptyState>;
  return (
    <ul className="audit-list">{rows.map(a => (
      <li key={a.id}>
        <p><b>{a.action}</b> · {a.actor.role === 'system' ? 'automatic' : `${a.actor.role}${a.actor.playerId ? ` ${name(a.actor.playerId)}` : ''}`} · <time dateTime={new Date(a.at).toISOString()}>{new Date(a.at).toISOString().replace('T', ' ').slice(0, 19)} UTC</time></p>
        {a.reason && <p className="lmeta">Reason: {a.reason}</p>}
        {a.rankChanges?.length > 0 && <p className="lmeta">Positions: {a.rankChanges.map(c => `${name(c.playerId)} ${c.from}→${c.to}`).join(', ')}</p>}
        {(a.before || a.after || a.target) && <details><summary>Details</summary><pre>{JSON.stringify({ target: a.target, before: a.before, after: a.after }, null, 1)}</pre></details>}
      </li>
    ))}</ul>
  );
}

function ExportTab() {
  const { season, meta } = useLadder();
  function download(kind) {
    const url = URL.createObjectURL(new Blob([exportCsv(kind, season)], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `ladder-${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kind}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="lcard"><h3>Export to CSV</h3><p className="lmeta">Times are in UTC. Private request reasons and account IDs are never exported.</p><div className="lactions">{['standings', 'players', 'matches', 'points'].map(kind => <button key={kind} className="secondary small" onClick={() => download(kind)}>Download {kind}</button>)}</div></div>;
}

export default function Organizer() {
  const { admin, seasonId, signedIn } = useLadder(), [tab, setTab] = useState('season');
  if (!admin) return <EmptyState icon="shield" title="Organizers only">{signedIn ? 'This account is not a ladder organizer.' : <>Sign in with an organizer account. <Link className="button small" to="/admin/login">Organizer sign in</Link></>}</EmptyState>;
  const shown = seasonId ? tab : 'season';
  return (
    <>
      <div className="org-tabs" role="tablist" aria-label="Organizer sections">{TABS.map(([id, label]) => <button key={id} role="tab" type="button" aria-selected={shown === id} disabled={!seasonId && id !== 'season'} className={shown === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {shown === 'season' && <SeasonTab />}{shown === 'players' && <PlayersTab />}{shown === 'matches' && <MatchesTab />}{shown === 'requests' && <RequestsTab />}{shown === 'rules' && <RulesSettings />}{shown === 'audit' && <AuditTab />}{shown === 'export' && <ExportTab />}
    </>
  );
}
