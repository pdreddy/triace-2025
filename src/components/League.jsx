import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Message } from './UI';
import { Icon } from './Icons';
import { formatUtr } from '../../functions/lib/tournament.js';
import { FORMATS, ROLE_LABELS, deriveLineup, encounterWinner, matchPlayers, playoffSpots } from '../../functions/lib/league.js';

export const teamName = team => (team ? `${team.captainFirstName}’s team` : 'To be decided');
// Every public team across all tiers, by ID (a team listed in two tiers appears once).
export const teamIndex = data => new Map(Object.values(data?.tiers || {}).flatMap(tier => Object.values(tier.teams || {})).map(t => [t.teamId, t]));
export function playerName(team, role) {
  if (!team) return ROLE_LABELS[role];
  if (role === 'captain') return team.captainFirstName;
  return team[`${role}Name`] || `${ROLE_LABELS[role]} (masked)`;
}
const tally = matches => [matches.filter(m => m.winner === 'home').length, matches.filter(m => m.winner === 'away').length];
const PAIRS = [['captain', 'ace1'], ['captain', 'ace2'], ['ace1', 'ace2']];

function TeamLink({ team, winner, archived }) {
  if (!team) return <span className="fixture-team tbd">To be decided</span>;
  if (archived) return <span className={`fixture-team${winner ? ' winner' : ''}`}>{teamName(team)}</span>;
  return <Link className={`fixture-team${winner ? ' winner' : ''}`} to={`/team/${team.teamId}`}>{teamName(team)}</Link>;
}

function LineupPicker({ team, value, onChange, format }) {
  const lineup = value.d1 ? deriveLineup(value) : null, label = teamName(team);
  return (
    <fieldset className="lineup">
      <legend>{label} lineup</legend>
      <label>Doubles 1 pair
        <select aria-label={`${label} Doubles 1 pair`} value={value.d1 ? value.d1.join('+') : ''} onChange={e => onChange({ d1: e.target.value.split('+'), d2Partner: '' })}>
          <option value="" disabled>Choose…</option>
          {PAIRS.map(pair => <option key={pair.join('+')} value={pair.join('+')}>{pair.map(r => playerName(team, r)).join(' + ')}</option>)}
        </select>
      </label>
      <label>Doubles 2 partner for {lineup ? playerName(team, lineup.third) : 'the third player'}
        <select aria-label={`${label} Doubles 2 partner`} value={value.d2Partner || ''} disabled={!value.d1} onChange={e => onChange({ ...value, d2Partner: e.target.value })}>
          <option value="" disabled>Choose…</option>
          {(value.d1 || []).map(r => <option key={r} value={r}>{playerName(team, r)}</option>)}
        </select>
      </label>
      {lineup && value.d2Partner && (
        <p className="lineup-summary">{format.map(m => <span key={m.key}><b>{m.label}</b> {m.players(deriveLineup(value)).map(r => playerName(team, r)).join(' + ')}</span>)}</p>
      )}
    </fieldset>
  );
}

function ScoreForm({ fixture, teams, admin, onSubmit }) {
  const format = FORMATS[fixture.format || 'rr'], playoff = fixture.format === 'po';
  const start = fixture.submission || fixture.result;
  const [matches, setMatches] = useState(() => format.map(({ key }, i) => ({ key, winner: start?.matches?.[i]?.winner || '', score: start?.matches?.[i]?.score || '' })));
  const [lineups, setLineups] = useState(() => ({ home: start?.lineups?.home || {}, away: start?.lineups?.away || {} }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const home = teams.get(fixture.home), away = teams.get(fixture.away);
  const set = (i, field, value) => setMatches(old => old.map((m, k) => (k === i ? { ...m, [field]: value } : m)));
  // In playoffs, matches after a team reaches three wins are not played; the super tiebreak only at 2–2.
  const open = [], wins = { home: 0, away: 0 };
  for (const m of matches) {
    const live = !(playoff && (wins.home === 3 || wins.away === 3)) && !(playoff && m.key === 'stb' && !(wins.home === 2 && wins.away === 2));
    open.push(live);
    if (live && m.winner) wins[m.winner]++;
  }
  const played = matches.map((m, i) => (open[i] ? m : { ...m, winner: '', score: '' }));
  const lineupsDone = ['home', 'away'].every(side => lineups[side].d1 && lineups[side].d2Partner);
  const decided = playoff ? wins.home === 3 || wins.away === 3 : played.every(m => m.winner);
  const complete = lineupsDone && decided && played.every((m, i) => !open[i] || m.winner);
  const [h, a] = tally(played);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit({ matches: played, lineups }); } catch (e) { setError(e.message); setBusy(false); }
  }
  const sidePlayers = side => (lineups[side].d1 && lineups[side].d2Partner ? Object.fromEntries(format.map(m => [m.key, m.players(deriveLineup(lineups[side]))])) : null);
  const names = (side, key) => { const p = sidePlayers(side); return p ? p[key].map(r => playerName(side === 'home' ? home : away, r)).join(' + ') : null; };

  return (
    <form className="score-form" onSubmit={submit} aria-label={`Score for ${teamName(home)} v ${teamName(away)}`}>
      <div className="lineups">
        {['home', 'away'].map(side => <LineupPicker key={side} team={side === 'home' ? home : away} format={format} value={lineups[side]} onChange={value => setLineups(old => ({ ...old, [side]: value }))} />)}
      </div>
      <p className="small">Write each score from the winner’s side, e.g. 6-4 3-6 10-8.</p>
      {format.map(({ key, label }, i) => (
        <fieldset key={key} className={`score-row${open[i] ? '' : ' unplayed'}`} disabled={busy || !open[i]}>
          <legend>{label}</legend>
          <div className="segmented wide" role="group" aria-label={`${label} winner`}>
            {['home', 'away'].map(side => <button key={side} type="button" aria-pressed={played[i].winner === side} onClick={() => set(i, 'winner', side)}>{names(side, key) || teamName(side === 'home' ? home : away)}</button>)}
          </div>
          <input type="text" inputMode="numeric" aria-label={`${label} score`} placeholder={open[i] ? 'e.g. 6-4 3-6 10-8' : 'Not played'} maxLength={40} value={played[i].score} onChange={e => set(i, 'score', e.target.value)} />
        </fieldset>
      ))}
      {decided && <p className="score-preview">Encounter: <strong>{teamName(encounterWinner(played) === 'home' ? home : away)}</strong> win {Math.max(h, a)}–{Math.min(h, a)}</p>}
      {!lineupsDone && <p className="small">Choose both lineups to submit.</p>}
      <Message error>{error}</Message>
      <button className="button small" disabled={busy || !complete}>{busy ? 'Saving…' : admin ? 'Save final result' : 'Submit score for approval'}</button>
    </form>
  );
}

const STATUS = { scheduled: 'Scheduled', submitted: 'Awaiting approval', final: 'Final', pending: 'Waiting for opponents' };

export function FixtureCard({ fixture, teams, mine = false, admin = false, onSubmit, onReview, archived = false }) {
  const [open, setOpen] = useState(false);
  const shown = fixture.result || fixture.submission, [h, a] = shown ? tally(shown.matches) : [null, null];
  const format = FORMATS[fixture.format || 'rr'];
  const players = { home: matchPlayers(fixture, 'home'), away: matchPlayers(fixture, 'away') };
  const canEnter = fixture.home && fixture.away && (admin || (mine && fixture.status !== 'final'));
  const sideName = side => teamName(teams.get(fixture[side]));
  const who = (side, key) => (players[side] ? players[side][key].map(r => playerName(teams.get(fixture[side]), r)).join(' + ') : sideName(side));
  return (
    <article className={`fixture-card ${fixture.status}${mine ? ' mine' : ''}${fixture.stage === 'final' ? ' grand' : ''}`}>
      <div className="fixture-top"><span className="pill">{fixture.label || `Round ${fixture.round}`}</span><span className={`status ${fixture.status}`}>{STATUS[fixture.status]}</span></div>
      <div className="fixture-main">
        <TeamLink team={teams.get(fixture.home)} winner={fixture.result?.winner === 'home'} archived={archived} />
        <span className="fixture-score">{shown ? <><b>{h}</b>–<b>{a}</b></> : 'v'}</span>
        <TeamLink team={teams.get(fixture.away)} winner={fixture.result?.winner === 'away'} archived={archived} />
      </div>
      {shown && (
        <ul className="fixture-matches">
          {shown.matches.map((m, i) => m.winner && (
            <li key={m.key}>
              <span>{format[i].label}</span>
              <b>{who(m.winner, m.key)}</b>
              <em>{m.score}</em>
              {players.home && <small>def. {who(m.winner === 'home' ? 'away' : 'home', m.key)}</small>}
            </li>
          ))}
        </ul>
      )}
      {fixture.status === 'submitted' && <p className="small">Submitted by the {sideName(fixture.submission.side)} captain.</p>}
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
          {open && <ScoreForm fixture={fixture} teams={teams} admin={admin} onSubmit={async entry => { await onSubmit(entry); setOpen(false); }} />}
        </>
      )}
    </article>
  );
}

export function Bracket({ fixtures, teams, mine = new Set(), admin = false, onSubmit, archived = false }) {
  const stages = fixtures.filter(f => f.stage).sort((a, b) => a.order - b.order);
  const early = stages.filter(f => f.stage !== 'final'), final = stages.find(f => f.stage === 'final');
  return (
    <div className="bracket-view">
      <div className="bracket-col">{early.map(f => <FixtureCard key={f.id} fixture={f} teams={teams} mine={mine.has(f.home) || mine.has(f.away)} admin={admin} archived={archived} onSubmit={onSubmit && (entry => onSubmit(f, entry))} />)}</div>
      <span className="bracket-arrow" aria-hidden="true"><Icon name="arrow" size={28} /></span>
      <div className="bracket-col">{final && <FixtureCard fixture={final} teams={teams} mine={mine.has(final.home) || mine.has(final.away)} admin={admin} archived={archived} onSubmit={onSubmit && (entry => onSubmit(final, entry))} />}</div>
    </div>
  );
}

export function StandingsTable({ rows, highlight = new Set(), rules, archived = false }) {
  const spots = playoffSpots(rows.length, rules);
  return (
    <div className="table-wrap">
      <table className="standings league-table">
        <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" className="num">P</th><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num matches-col">Matches</th><th scope="col" className="num">Pts</th><th scope="col" className="form-col">Form</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team.teamId} className={`${row.position <= spots ? 'qualify' : ''}${row.position === spots ? ' cutoff' : ''}${highlight.has(row.team.teamId) ? ' mine' : ''}`}>
              <td className="rank-cell">{row.position}</td>
              <td>{archived ? <b>{teamName(row.team)}</b> : <Link to={`/team/${row.team.teamId}`}><b>{teamName(row.team)}</b></Link>}<span className="muted team-utr"> · {formatUtr(row.team.combinedUtr)}</span></td>
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
      <p className="table-note">Top {spots} qualify for the playoffs · {rules?.pointsPerWin ?? 2} points per encounter win · ties: match difference, then matches won.</p>
    </div>
  );
}
