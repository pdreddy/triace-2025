import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSinglesLadder } from '../hooks/useSinglesLadder';
import { canChallenge } from '../../functions/lib/singlesLadder';
import { Message } from '../components/UI';
const date = t => t ? new Date(t).toLocaleString('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' }) : '—';
function Match({ id, match: c, entries, playerId, admin, busy, act }) {
  const [score, setScore] = useState(''), [winnerId, setWinner] = useState(c.result?.winnerId || c.challengerId), [until, setUntil] = useState(''), [reason, setReason] = useState('');
  const participant = [c.challengerId, c.opponentId].includes(playerId);
  const send = (action, extra = {}) => act({ action, challengeId: id, ...extra });
  return <article className="format-card"><h3>{entries[c.challengerId]?.name} vs {entries[c.opponentId]?.name}</h3><p>{c.status} · Respond by {date(c.respondBy)}</p><p>Play and submit by {date(c.extensionUntil || c.deadline)}</p>
    {c.result && <p>Score: {c.result.score} · Winner: {entries[c.result.winnerId]?.name}</p>}
    <div className="ladder-actions">
    {c.status === 'pending' && c.opponentId === playerId && <><button disabled={busy} onClick={() => send('respond', { accept: true })}>Accept</button><button disabled={busy} onClick={() => send('respond', { accept: false })}>Decline</button></>}
    {c.status === 'pending' && Date.now() > c.respondBy && (participant || admin) && <button disabled={busy} onClick={() => send('expire')}>Expire overdue challenge</button>}
    {c.status === 'accepted' && participant && <form onSubmit={e => { e.preventDefault(); send('submit', { score, winnerId }); }}><label>Winner<select value={winnerId} onChange={e => setWinner(e.target.value)}>{[c.challengerId, c.opponentId].map(p => <option key={p} value={p}>{entries[p]?.name}</option>)}</select></label><label>Score (challenger first)<input required placeholder="6-4 6-3" value={score} onChange={e => setScore(e.target.value)} /></label><button disabled={busy}>Submit result</button><button type="button" disabled={busy || c.extensionRequested} onClick={() => send('extension')}>Request extension</button></form>}
    {c.status === 'submitted' && participant && c.result.submittedBy !== playerId && <><button disabled={busy} onClick={() => send('confirm')}>Confirm result</button><button disabled={busy} onClick={() => send('dispute')}>Dispute result</button></>}
    {admin && c.extensionRequested && c.status === 'accepted' && <form onSubmit={e => { e.preventDefault(); send('approveExtension', { until: Date.parse(until) }); }}><label>Extension deadline (include UTC offset)<input required placeholder="2026-11-22T23:59:00-06:00" value={until} onChange={e => setUntil(e.target.value)} /></label><button disabled={busy}>Approve extension</button></form>}
    {admin && c.status === 'disputed' && <><label>Resolved winner<select value={winnerId} onChange={e => setWinner(e.target.value)}>{[c.challengerId, c.opponentId].map(p => <option key={p} value={p}>{entries[p]?.name}</option>)}</select></label><label>Resolution reason<input value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || reason.trim().length < 3} onClick={() => send('resolve', { winnerId, reason })}>Resolve dispute</button></>}
    {admin && ['pending', 'accepted', 'submitted', 'disputed'].includes(c.status) && <button disabled={busy} onClick={() => send('cancel')}>Cancel challenge</button>}
    </div></article>;
}
export default function SinglesLadder() {
  const { ladder, playerId, error, loading, busy, act, user } = useSinglesLadder();
  const [canonicalId, setCanonicalId] = useState(''), [uid, setUid] = useState(''), [rank, setRank] = useState(''), [reason, setReason] = useState(''), [exemptUntil, setExemptUntil] = useState('');
  const entries = ladder?.entries || {}, challenges = ladder?.challenges || {}, me = entries[playerId];
  const rows = Object.entries(entries).sort((a, b) => a[1].rank - b[1].rank);
  const matches = Object.entries(challenges).sort((a, b) => b[1].createdAt - a[1].createdAt);
  return <section className="page"><Link to="/home">← All Formats</Link><p className="eyebrow">PPRC Singles</p><h1>Singles Ladder</h1><Message error>{error}</Message>
    {loading ? <p role="status">Loading ladder…</p> : <>
    <p>Season: {ladder?.status || 'Not created'} · Times shown in America/Chicago.</p>
    {!user || user.anonymous ? <p><Link to="/captain">Sign in</Link> to play. Your organizer must verify and link your PPRC player ID.</p> : <p>{me ? `Your rank: #${me.rank} · ${me.points} points · ${me.wins} consecutive wins` : 'Ask your organizer to enroll and verify your canonical PPRC player ID for this account.'}</p>}
    {user && !user.anonymous && <p>Your account UID: <code>{user.uid}</code></p>}
    <details><summary>Ladder rules</summary><p>Ranks 1–3 may challenge within three places in either direction. Other players may challenge up three places; two consecutive wins unlock any higher rank. One active challenge per player. Rematches require 14 days. Respond within 48 hours; submit scores by Sunday at 11:59 PM Chicago time. The opponent must confirm results; organizers resolve disputes and approve extensions. Winners earn 3 points plus a challenge/defense bonus and an upset bonus; late results lose bonuses. Losers earn 1 point. The first decline is free; further declines cost 2 points and drop one place.</p></details>
    <div className="ladder-table"><table><thead><tr><th>Rank</th><th>Player</th><th>Points</th><th>Form</th><th>Challenge</th></tr></thead><tbody>{rows.map(([id, e]) => <tr key={id}><td>{e.rank}</td><td>{e.name}{id === playerId ? ' (you)' : ''}{e.exemptUntil > Date.now() ? ` · Exempt through ${date(e.exemptUntil)}` : ''}</td><td>{e.points}</td><td>{e.wins} wins{!e.lastPlayedAt || Date.now() - e.lastPlayedAt >= 14 * 86400000 ? ' · Inactive' : ''}</td><td>{me && ladder?.status === 'active' && canChallenge(me.rank, e.rank, me.wins, rows.length) && <button disabled={busy} onClick={() => act({ action: 'challenge', opponentId: id })}>Challenge</button>}</td></tr>)}</tbody></table></div>
    {!rows.length && <p>No players enrolled yet.</p>}
    <h2>Your matches</h2>{matches.filter(([, c]) => [c.challengerId, c.opponentId].includes(playerId)).map(([id, c]) => <Match key={id} id={id} match={c} entries={entries} playerId={playerId} busy={busy} act={act} />)}
    {user?.admin && <section><h2>Organizer dashboard</h2><p>Verify account ownership before linking. Canonical IDs come from the existing <Link to="/pprc">PPRC directory</Link>. Account UID: {user.uid}</p>
    <form className="format-card" onSubmit={e => { e.preventDefault(); act({ action: 'enroll', playerId: canonicalId }); }}><label>Canonical PPRC player ID<input required value={canonicalId} onChange={e => setCanonicalId(e.target.value)} /></label><button disabled={busy}>Enroll player</button><label>Verified Firebase account UID<input value={uid} onChange={e => setUid(e.target.value)} /></label><button type="button" disabled={busy || !uid || !canonicalId} onClick={() => act({ action: 'link', playerId: canonicalId, uid })}>Link verified account</button></form>
    <form className="format-card" onSubmit={e => { e.preventDefault(); act({ action: 'adjustRank', playerId: canonicalId, rank: Number(rank), reason }); }}><p>Organizer decisions for the player ID above</p><label>Reason<input required value={reason} onChange={e => setReason(e.target.value)} /></label><label>New rank<input type="number" min="1" max={rows.length} value={rank} onChange={e => setRank(e.target.value)} /></label><button disabled={busy || !rank || !canonicalId}>Adjust rank</button><label>Exempt until (include UTC offset)<input placeholder="2026-11-22T23:59:00-06:00" value={exemptUntil} onChange={e => setExemptUntil(e.target.value)} /></label><button type="button" disabled={busy || !exemptUntil || !canonicalId || !reason.trim()} onClick={() => act({ action: 'exempt', playerId: canonicalId, until: Date.parse(exemptUntil), reason })}>Approve exemption</button></form>
    <div className="ladder-actions"><button disabled={busy || ladder?.status === 'active' || ladder?.status === 'closed'} onClick={() => act({ action: 'open' })}>Open season</button><button disabled={busy || ladder?.status !== 'active'} onClick={() => act({ action: 'close' })}>Close season</button><button onClick={() => { const blob = new Blob([JSON.stringify(ladder, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'singles-ladder.json'; a.click(); URL.revokeObjectURL(url); }}>Export season and audit</button></div>
    <h3>All matches and disputes</h3>{matches.map(([id, c]) => <Match key={id} id={id} match={c} entries={entries} playerId={playerId} admin busy={busy} act={act} />)}
    <h3>Audit history</h3><ul>{Object.entries(ladder?.audit || {}).reverse().map(([id, e]) => <li key={id}>{date(e.at)} · {e.action} · {e.actor}</li>)}</ul></section>}
    </>}
  </section>;
}
