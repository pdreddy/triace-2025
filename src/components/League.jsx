import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Message } from './UI';
import { Icon } from './Icons';
import { formatUtr } from '../../functions/lib/tournament.js';
import { validateCourt, validateDoublesSet, validateMatchScore, matchResult, SCORE_ERRORS } from '../../functions/lib/scoring.js';
import { FORMATS, ROLE_LABELS, deriveLineup, matchPlayers, playoffSpots, isOverdue, onTime } from '../../functions/lib/league.js';

export const teamName = team => (team ? `${team.captainFirstName}’s team` : 'To be decided');
// Every public team across all tiers, by ID (a team listed in two tiers appears once).
export const teamIndex = data => new Map(Object.values(data?.tiers || {}).flatMap(tier => Object.values(tier.teams || {})).map(t => [t.teamId, t]));
export function playerName(team, role) {
  if (!team) return ROLE_LABELS[role];
  if (role === 'captain') return team.captainFirstName;
  return team[`${role}Name`] || `${ROLE_LABELS[role]} (masked)`;
}
// Calendar dates (YYYY-MM-DD) shown in the viewer's language, e.g. "Sat 11 Jan".
export const shortDate = date => (date ? new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
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

// ---------- Score entry ----------
// Each court is typed as numbers for the home and away side; scoring.js decides what is valid.
const blankSet = () => ({ a: '', b: '', ta: '', tb: '' });
const blankCourt = type => (type === 'singles' ? blankSet() : type === 'super' ? { a: '', b: '' } : { sets: [blankSet(), blankSet()], third: { format: '', ...blankSet() } });
const num = v => (v === '' || v == null ? null : Number(v));
const toSet = x => ({ home: num(x.a), away: num(x.b), ...(x.ta !== '' || x.tb !== '' ? { tiebreak: { home: num(x.ta), away: num(x.tb) } } : {}) });
const fromSet = x => (x ? { a: String(x.home), b: String(x.away), ta: x.tiebreak ? String(x.tiebreak.home) : '', tb: x.tiebreak ? String(x.tiebreak.away) : '' } : blankSet());
function fromCourt(type, c) {
  if (!c) return blankCourt(type);
  if (type === 'singles') return fromSet(c.set);
  if (type === 'super') return { a: String(c.home), b: String(c.away) };
  const third = c.third?.format === 'matchTiebreak' ? { format: 'matchTiebreak', ...blankSet(), a: String(c.third.home), b: String(c.third.away) } : c.third?.format === 'fullSet' ? { format: 'fullSet', ...fromSet(c.third.set) } : { format: '', ...blankSet() };
  return { sets: c.sets.map(fromSet), third };
}
const splitSets = sets => { const [x, y] = sets.map(set => validateDoublesSet(toSet(set)).winner); return !!x && !!y && x !== y; };
function toCourt(type, v) {
  if (type === 'singles') return { type, set: toSet(v) };
  if (type === 'super') return { type, home: num(v.a), away: num(v.b) };
  const split = splitSets(v.sets), t = v.third;
  const third = !split ? null : t.format === 'matchTiebreak' ? { format: 'matchTiebreak', home: num(t.a), away: num(t.b) } : t.format === 'fullSet' ? { format: 'fullSet', set: toSet(t) } : { format: '' };
  return { type, sets: v.sets.map(toSet), ...(third ? { third } : {}) };
}

function Points({ label, a, b, onA, onB, homeName, awayName, max = 99 }) {
  return (
    <span className="score-pair">
      <input type="number" inputMode="numeric" min="0" max={max} aria-label={`${label} ${homeName}`} value={a} onChange={e => onA(e.target.value)} />
      <span aria-hidden="true">–</span>
      <input type="number" inputMode="numeric" min="0" max={max} aria-label={`${label} ${awayName}`} value={b} onChange={e => onB(e.target.value)} />
    </span>
  );
}

// One set (or pro set): the games, plus tiebreak points when the score needs them.
function SetRow({ label, value, onChange, tbAt, games, homeName, awayName }) {
  const hi = Math.max(Number(value.a), Number(value.b)), lo = Math.min(Number(value.a), Number(value.b));
  const needsTiebreak = value.a !== '' && value.b !== '' && hi === games && lo === tbAt;
  const set = patch => onChange({ ...value, ...patch });
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <Points label={label} a={value.a} b={value.b} onA={a => set({ a })} onB={b => set({ b })} homeName={homeName} awayName={awayName} max={games} />
      {needsTiebreak && <span className="tiebreak-entry">tiebreak <Points label={`${label} tiebreak`} a={value.ta} b={value.tb} onA={ta => set({ ta })} onB={tb => set({ tb })} homeName={homeName} awayName={awayName} /></span>}
    </div>
  );
}

function CourtEntry({ court, value, onChange, homeName, awayName }) {
  const names = { homeName, awayName };
  if (court.type === 'singles') return <SetRow label="Pro set" value={value} onChange={onChange} tbAt={7} games={8} {...names} />;
  if (court.type === 'super') return <div className="set-row"><span className="set-label">10-point tiebreak</span><Points label="Tiebreak" a={value.a} b={value.b} onA={a => onChange({ ...value, a })} onB={b => onChange({ ...value, b })} {...names} /></div>;
  const setAt = (i, v) => onChange({ ...value, sets: value.sets.map((x, k) => (k === i ? v : x)) });
  const t = value.third, split = splitSets(value.sets);
  return (
    <>
      {value.sets.map((set, i) => <SetRow key={i} label={`Set ${i + 1}`} value={set} onChange={v => setAt(i, v)} tbAt={3} games={4} {...names} />)}
      {split && (
        <div className="set-row">
          <label className="set-label">Third set
            <select aria-label={`${court.label} third-set format`} value={t.format} onChange={e => onChange({ ...value, third: { ...t, format: e.target.value } })}>
              <option value="">Choose format…</option>
              <option value="matchTiebreak">10-point match tiebreak</option>
              <option value="fullSet">Full set</option>
            </select>
          </label>
          {t.format === 'matchTiebreak' && <Points label="Match tiebreak" a={t.a} b={t.b} onA={a => onChange({ ...value, third: { ...t, a } })} onB={b => onChange({ ...value, third: { ...t, b } })} {...names} />}
          {t.format === 'fullSet' && <SetRow label="Third set" value={t} onChange={v => onChange({ ...value, third: { format: 'fullSet', ...v } })} tbAt={3} games={4} {...names} />}
        </div>
      )}
    </>
  );
}

function ScoreForm({ fixture, teams, admin, onSubmit }) {
  const format = FORMATS[fixture.format || 'rr'];
  const start = fixture.submission || fixture.result;
  const [courts, setCourts] = useState(() => Object.fromEntries(format.map(({ key, type }) => [key, fromCourt(type, start?.courts?.[key])])));
  const [lineups, setLineups] = useState(() => ({ home: start?.lineups?.home || {}, away: start?.lineups?.away || {} }));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const home = teams.get(fixture.home), away = teams.get(fixture.away);
  const homeName = teamName(home), awayName = teamName(away);
  const entered = Object.fromEntries(format.map(({ key, type }) => [key, toCourt(type, courts[key])]));
  const checks = Object.fromEntries(format.map(({ key }) => [key, validateCourt(entered[key])]));
  const lineupsDone = ['home', 'away'].every(side => lineups[side].d1 && lineups[side].d2Partner);
  const scored = validateMatchScore(fixture.format || 'rr', entered).valid;
  const total = scored ? matchResult(fixture.format || 'rr', entered) : null;
  const complete = lineupsDone && scored;

  async function submit(event) {
    event.preventDefault();
    if (!scored) { setError(SCORE_ERRORS.incomplete); return; }
    setBusy(true); setError('');
    try { await onSubmit({ courts: entered, lineups }); } catch (e) { setError(e.message); setBusy(false); }
  }
  const sidePlayers = side => (lineups[side].d1 && lineups[side].d2Partner ? Object.fromEntries(format.map(m => [m.key, m.players(deriveLineup(lineups[side]))])) : null);
  const names = (side, key) => { const p = sidePlayers(side); return p ? p[key].map(r => playerName(side === 'home' ? home : away, r)).join(' + ') : null; };

  return (
    <form className="score-form" onSubmit={submit} aria-label={`Score for ${homeName} v ${awayName}`}>
      <div className="lineups">
        {['home', 'away'].map(side => <LineupPicker key={side} team={side === 'home' ? home : away} format={format} value={lineups[side]} onChange={value => setLineups(old => ({ ...old, [side]: value }))} />)}
      </div>
      <p className="small">Enter each score with {homeName} first, then {awayName}.</p>
      {format.map(court => {
        const shown = checks[court.key].errors.filter(e => e !== SCORE_ERRORS.incomplete);
        return (
          <fieldset key={court.key} className="score-row" disabled={busy}>
            <legend>{court.label}</legend>
            <p className="small court-players">{names('home', court.key) || homeName} <span className="muted">v</span> {names('away', court.key) || awayName}</p>
            <CourtEntry court={court} value={courts[court.key]} onChange={v => setCourts(old => ({ ...old, [court.key]: v }))} homeName={homeName} awayName={awayName} />
            {shown.map(message => <p key={message} className="small warn-text" role="alert">{message}</p>)}
          </fieldset>
        );
      })}
      {total && <p className="score-preview">Encounter: <strong>{teamName(total.winner === 'home' ? home : away)}</strong> win {total.score} on courts · games {total.gamesHome}–{total.gamesAway}</p>}
      {!lineupsDone && <p className="small">Choose both lineups to submit.</p>}
      <Message error>{error}</Message>
      <button className="button small" disabled={busy || !complete}>{busy ? 'Saving…' : admin ? 'Save final result' : 'Submit score for approval'}</button>
    </form>
  );
}

const STATUS = { scheduled: 'Scheduled', submitted: 'Awaiting approval', final: 'Final', pending: 'Waiting for opponents' };

export function FixtureCard({ fixture, teams, mine = false, admin = false, onSubmit, onReview, onMove, archived = false }) {
  const [open, setOpen] = useState(false), [due, setDue] = useState(fixture.dueBy || '');
  const overdue = !archived && isOverdue(fixture), late = fixture.status === 'final' && fixture.dueBy && !onTime(fixture);
  const shown = fixture.result || fixture.submission, [h, a] = shown ? tally(shown.matches) : [null, null];
  const format = FORMATS[fixture.format || 'rr'];
  const players = { home: matchPlayers(fixture, 'home'), away: matchPlayers(fixture, 'away') };
  const canEnter = fixture.home && fixture.away && (admin || (mine && fixture.status !== 'final'));
  const sideName = side => teamName(teams.get(fixture[side]));
  const who = (side, key) => (players[side]?.[key] ? players[side][key].map(r => playerName(teams.get(fixture[side]), r)).join(' + ') : sideName(side));
  return (
    <article className={`fixture-card ${fixture.status}${mine ? ' mine' : ''}${fixture.stage === 'final' ? ' grand' : ''}${overdue ? ' overdue' : ''}`}>
      <div className="fixture-top">
        <span className={`pill${fixture.challenge ? ' warn' : ''}`}>{fixture.label || `Round ${fixture.round}`}</span>
        {fixture.dueBy && <span className={`due${overdue ? ' overdue' : ''}`}>{overdue ? 'Overdue · ' : 'Due '}{shortDate(fixture.dueBy)}</span>}
        <span className={`status ${fixture.status}`}>{STATUS[fixture.status]}{late ? ' · late' : ''}</span>
      </div>
      <div className="fixture-main">
        <TeamLink team={teams.get(fixture.home)} winner={fixture.result?.winner === 'home'} archived={archived} />
        <span className="fixture-score">{shown ? <><b>{h}</b>–<b>{a}</b></> : 'v'}</span>
        <TeamLink team={teams.get(fixture.away)} winner={fixture.result?.winner === 'away'} archived={archived} />
      </div>
      {shown && (
        <ul className="fixture-matches">
          {shown.matches.map(m => m.winner && (
            <li key={m.key}>
              <span>{format.find(c => c.key === m.key)?.label || 'Super tiebreak'}</span>
              <b>{who(m.winner, m.key)}</b>
              <em>{m.score}</em>
              {players.home && players.home[m.key] && <small>def. {who(m.winner === 'home' ? 'away' : 'home', m.key)}</small>}
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
      {admin && onMove && !archived && fixture.status !== 'final' && (
        <details className="move-due">
          <summary>Change deadline</summary>
          <div className="inline-form">
            <div className="field"><label htmlFor={`due-${fixture.tierId}-${fixture.id}`}>New deadline</label><input id={`due-${fixture.tierId}-${fixture.id}`} type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
            <button type="button" className="secondary small" disabled={!due || due === fixture.dueBy} onClick={() => onMove(due)}>Save</button>
          </div>
        </details>
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
        <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" className="num">P</th><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num matches-col">Courts</th><th scope="col" className="num matches-col">Games</th><th scope="col" className="num">Pts</th><th scope="col" className="form-col">Form</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team.teamId} className={`${row.position <= spots ? 'qualify' : ''}${row.position === spots ? ' cutoff' : ''}${highlight.has(row.team.teamId) ? ' mine' : ''}`}>
              <td className="rank-cell">{row.position}</td>
              <td>{row.swappedBy && <span className="swap" title="Place changed by a challenge" aria-label="Place changed by a challenge">⇅ </span>}{archived ? <b>{teamName(row.team)}</b> : <Link to={`/team/${row.team.teamId}`}><b>{teamName(row.team)}</b></Link>}<span className="muted team-utr"> · {formatUtr(row.team.combinedUtr)}</span></td>
              <td className="num">{row.played}</td>
              <td className="num">{row.won}</td>
              <td className="num">{row.lost}</td>
              <td className="num matches-col">{row.courtsWon ?? row.matchesWon}–{row.courtsLost ?? row.matchesLost}</td>
              <td className="num matches-col">{row.gamesWon}–{row.gamesLost}</td>
              <td className="num strong">{row.points}</td>
              <td className="form-col"><span className="form">{row.form.map((r, i) => <i key={i} className={r === 'W' ? 'win' : 'loss'}>{r}</i>)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">Top {spots} qualify for the playoffs · {rules?.pointsPerWin ?? 1} point per encounter win · ties: head-to-head, court difference, game difference, games won · ⇅ place changed by a challenge.</p>
    </div>
  );
}
