import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Message } from './UI';
import { Icon } from './Icons';
import { formatUtr } from '../../functions/lib/tournament.js';
import { MATCHES, encounterWinner, playoffSpots } from '../../functions/lib/league.js';

export const teamName = team => (team ? `${team.captainFirstName}’s team` : 'Unknown team');
// Every public team across all tiers, by ID (a team listed in two tiers appears once).
export const teamIndex = data => new Map(Object.values(data?.tiers || {}).flatMap(tier => Object.values(tier.teams || {})).map(t => [t.teamId, t]));
const matchScore = matches => [matches.filter(m => m.winner === 'home').length, matches.filter(m => m.winner === 'away').length];

function TeamLink({ team, winner }) {
  return <Link className={`fixture-team${winner ? ' winner' : ''}`} to={`/team/${team?.teamId}`}>{teamName(team)}</Link>;
}

function ScoreForm({ fixture, teams, admin, onSubmit }) {
  const start = (fixture.submission || fixture.result)?.matches;
  const [matches, setMatches] = useState(() => MATCHES.map(({ key }, i) => ({ key, winner: start?.[i]?.winner || '', score: start?.[i]?.score || '' })));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (i, field, value) => setMatches(old => old.map((m, k) => (k === i ? { ...m, [field]: value } : m)));
  const complete = matches.every(m => m.winner);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit(matches); } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <form className="score-form" onSubmit={submit} aria-label={`Score for ${teamName(teams.get(fixture.home))} v ${teamName(teams.get(fixture.away))}`}>
      {MATCHES.map(({ key, label }, i) => (
        <fieldset key={key} className="score-row" disabled={busy}>
          <legend>{label}</legend>
          <div className="segmented wide" role="group" aria-label={`${label} winner`}>
            {['home', 'away'].map(side => <button key={side} type="button" aria-pressed={matches[i].winner === side} onClick={() => set(i, 'winner', side)}>{teamName(teams.get(fixture[side]))}</button>)}
          </div>
          <input type="text" inputMode="numeric" aria-label={`${label} score`} placeholder="e.g. 6-4 3-6 10-8" maxLength={40} value={matches[i].score} onChange={e => set(i, 'score', e.target.value)} />
        </fieldset>
      ))}
      {complete && <p className="score-preview">Encounter: <strong>{teamName(teams.get(fixture[encounterWinner(matches)]))}</strong> win {Math.max(...matchScore(matches))}–{Math.min(...matchScore(matches))}</p>}
      <Message error>{error}</Message>
      <button className="button small" disabled={busy || !complete}>{busy ? 'Saving…' : admin ? 'Save final result' : 'Submit score for approval'}</button>
    </form>
  );
}

const STATUS = { scheduled: 'Scheduled', submitted: 'Awaiting approval', final: 'Final' };

export function FixtureCard({ fixture, teams, mine = false, admin = false, onSubmit, onReview }) {
  const [open, setOpen] = useState(false);
  const shown = fixture.result || fixture.submission, [h, a] = shown ? matchScore(shown.matches) : [null, null];
  const canEnter = admin || (mine && fixture.status !== 'final');
  return (
    <article className={`fixture-card ${fixture.status}${mine ? ' mine' : ''}`}>
      <div className="fixture-top"><span className="pill">Round {fixture.round}</span><span className={`status ${fixture.status}`}>{STATUS[fixture.status]}</span></div>
      <div className="fixture-main">
        <TeamLink team={teams.get(fixture.home)} winner={fixture.result?.winner === 'home'} />
        <span className="fixture-score">{shown ? <><b>{h}</b>–<b>{a}</b></> : 'v'}</span>
        <TeamLink team={teams.get(fixture.away)} winner={fixture.result?.winner === 'away'} />
      </div>
      {shown && (
        <ul className="fixture-matches">
          {shown.matches.map((m, i) => <li key={m.key}><span>{MATCHES[i].label}</span><b>{teamName(teams.get(fixture[m.winner]))}</b><em>{m.score}</em></li>)}
        </ul>
      )}
      {fixture.status === 'submitted' && <p className="small">Submitted by the {fixture.submission.side === 'home' ? teamName(teams.get(fixture.home)) : teamName(teams.get(fixture.away))} captain.</p>}
      {onReview && fixture.status === 'submitted' && (
        <div className="fixture-actions">
          <button type="button" className="button small" onClick={() => onReview(true)}>Approve</button>
          <button type="button" className="danger" onClick={() => onReview(false)}>Reject</button>
        </div>
      )}
      {canEnter && onSubmit && (
        <>
          <button type="button" className="text-link" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name={open ? 'back' : 'register'} size={16} />{open ? 'Close' : admin ? (fixture.status === 'final' ? 'Correct result' : 'Enter result') : fixture.status === 'submitted' ? 'Change submitted score' : 'Submit score'}
          </button>
          {open && <ScoreForm fixture={fixture} teams={teams} admin={admin} onSubmit={async matches => { await onSubmit(matches); setOpen(false); }} />}
        </>
      )}
    </article>
  );
}

export function StandingsTable({ rows, highlight = new Set() }) {
  const spots = playoffSpots(rows.length);
  return (
    <div className="table-wrap">
      <table className="standings league-table">
        <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" className="num">P</th><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num matches-col">Matches</th><th scope="col" className="num">Pts</th><th scope="col" className="form-col">Form</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team.teamId} className={`${row.position <= spots ? 'qualify' : ''}${row.position === spots ? ' cutoff' : ''}${highlight.has(row.team.teamId) ? ' mine' : ''}`}>
              <td className="rank-cell">{row.position}</td>
              <td><Link to={`/team/${row.team.teamId}`}><b>{teamName(row.team)}</b></Link><span className="muted team-utr"> · {formatUtr(row.team.combinedUtr)}</span></td>
              <td className="num">{row.played}</td>
              <td className="num">{row.won}</td>
              <td className="num">{row.lost}</td>
              <td className="num matches-col">{row.matchesWon}–{row.matchesLost}</td>
              <td className="num strong">{row.points}</td>
              <td className="form-col"><span className="form">{row.form.map((r, i) => <i key={i} className={r === 'W' ? 'win' : 'loss'}>{r}</i>)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">Top {spots} qualify for the playoffs · 2 points per encounter win · ties: match difference, then matches won.</p>
    </div>
  );
}
