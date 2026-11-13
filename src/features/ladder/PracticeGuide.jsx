import { Link } from 'react-router-dom';
import { useTournament } from '../../hooks/useTournament';
import { useLadder } from './LadderContext';
import { Chip } from './ui';

export default function PracticeGuide() {
  const { data } = useTournament(), { seasonId, playerId, signedIn } = useLadder();
  const practice = data?.ladderPractice;
  if (!practice || practice.seasonId !== seasonId) return null;
  const matches = practice.matches.filter(m => !playerId || m.homeId === playerId || m.awayId === playerId);
  return <section className="lcard practice-guide" aria-label="Group A practice guide">
    <div className="practice-title"><h2>Group A · Real-roster practice</h2><Chip tone="warn">Local practice</Chip></div>
    <p>{practice.players} actual Group A players from the 2026 records, with fresh test points and results. The recorded competition remains unchanged.</p>
    <p className="lmeta">All Group A opponents are allowed in this practice season. A third set can be a full set or a match tiebreak. UTRs use the saved player-rating snapshot; missing ratings stay blank.</p>
    {!signedIn && <Link className="button small" to="/player-login">Player sign in</Link>}
    <details><summary>Reference scores and steps for {playerId ? 'your match' : 'the three prepared matches'}</summary>
      <ol className="practice-matches">{matches.map(match => <li key={match.challengeId}><strong>{match.home} v {match.away}</strong><span>{match.round} · recorded winner: {match.winner}</span><span>1. {match.away}: accept the challenge.</span><span>2. {match.home}: report the winner and score <code>{match.score}</code>.</span><span>3. {match.away}: confirm or dispute.</span></li>)}</ol>
      <p className="lmeta">Scores above are reference results, written from the challenger’s side. You can try different results in this local season.</p>
    </details>
  </section>;
}
