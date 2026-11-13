import { Link } from 'react-router-dom';
import { useTournament } from '../../hooks/useTournament';
import { useLadder } from './LadderContext';
import { Chip } from './ui';

export default function PracticeGuide({ onReplay }) {
  const { data } = useTournament(), { seasonId, playerId, signedIn, season } = useLadder();
  const practice = data?.ladderPractice;
  if (!practice || practice.seasonId !== seasonId) return null;
  const matches = practice.matches.filter(m => !playerId || m.homeId === playerId || m.awayId === playerId);
  const rounds = practice.rounds || [], completed = rounds.flatMap(r => r.matches).map(m => ({ ...m, challenge: season?.challenges?.[m.challengeId] })).filter(m => m.challenge?.status === 'completed');
  return <section className="lcard practice-guide" aria-label="Group A practice guide">
    <div className="practice-title"><h2>Group A · Real-roster practice</h2><Chip tone="warn">Local practice</Chip></div>
    <p>{practice.players} actual Group A players from the 2026 records, with isolated practice points and results. The recorded competition remains unchanged.</p>
    <p className="lmeta">Challenge up to 3 places above; after 2 consecutive wins, up to 5. Only the top 3 may challenge down, by at most 3 places. A third set can be a full set or a match tiebreak. UTRs use the saved player-rating snapshot; missing ratings stay blank.</p>
    {completed.length > 0 ? <>
      <p><strong>{rounds.length} sample rounds · {completed.length} completed matches.</strong> These are practice outcomes using real names, not official competition results.</p>
      <button className="button small" onClick={() => { const m = completed.at(-1); onReplay({ ...m.challenge, id: m.challengeId }); }}>Watch snake &amp; ladder</button>
      <details><summary>Completed practice rounds</summary>{rounds.map(round => <div key={round.round}><h3>Practice round {round.round}</h3><ul>{round.matches.map(match => <li key={match.challengeId}>{match.home} v {match.away} · {match.score} · Winner: {match.winner} <button className="secondary small" disabled={season?.challenges?.[match.challengeId]?.status !== 'completed'} onClick={() => onReplay({ ...season.challenges[match.challengeId], id: match.challengeId })}>Replay result</button></li>)}</ul></div>)}</details>
    </> : <p className="form-error">This saved practice uses the older setup. Stop the server and run <code>npm run demo:group-a</code> without a custom data directory to open the new two-round setup. Your older practice stays saved.</p>}
    <details><summary>Manual rules checklist</summary><ol>
      <li>Watch a completed result: verify winner climbs, loser slides, points and recorded rank changes.</li>
      <li>Sign in as Noufal: two wins unlock 5 places up. His pending Malla challenge is 4 places above.</li>
      <li>Complete or withdraw a pending challenge, then compare eligible and disabled Challenge buttons: normal limit 3; streak limit 5; top-3 downward limit 3. Busy opponents and rematch cooldown still apply.</li>
      <li>Use the prepared matches below to accept, decline, withdraw, report, confirm or dispute. Try an invalid score before a valid score.</li>
      <li>Organizer rules and actions cover exemptions, extensions, walkovers, no-shows, adjustments and dispute resolution. Response expiry and inactivity require elapsed time and a sweep; completed rounds alone do not exercise these rules.</li>
    </ol><Link to="/ladder/rules">Read all season rules</Link></details>
    {!signedIn && <Link className="button small" to="/player-login">Player sign in</Link>}
    <details><summary>Reference scores and steps for {playerId ? 'your match' : 'the three prepared matches'}</summary>
      <ol className="practice-matches">{matches.map(match => <li key={match.challengeId}><strong>{match.home} v {match.away}</strong><span>{match.round} · recorded winner: {match.winner}</span><span>1. {match.away}: accept the challenge.</span><span>2. {match.home}: report the winner and score <code>{match.score}</code>.</span><span>3. {match.away}: confirm or dispute.</span></li>)}</ol>
      <p className="lmeta">Scores above are reference results, written from the challenger’s side. You can try different results in this local season.</p>
    </details>
  </section>;
}
