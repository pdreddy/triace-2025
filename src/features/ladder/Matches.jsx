import { EmptyState } from '../../components/UI';
import { useLadder } from './LadderContext';
import { challengesOf, entries, isActive } from './selectors';
import { ChallengeCard } from './ui';

export default function Matches() {
  const { season, playerId, me } = useLadder();
  const mine = me ? challengesOf(season, playerId) : [], active = mine.filter(isActive), past = mine.filter(c => !isActive(c));
  const results = entries(season?.challenges).filter(c => c.status === 'completed').sort((a, b) => b.completedAt - a.completedAt).slice(0, 20);
  return (
    <>
      {me && <>
        <h2 className="lsection">Your active challenges</h2>
        {active.length ? active.map(c => <ChallengeCard key={c.id} challenge={c} />) : <EmptyState icon="ball" title="Nothing in play">Pick an opponent on the ladder to send a challenge.</EmptyState>}
        <h2 className="lsection">Your history</h2>
        {past.length ? past.map(c => <ChallengeCard key={c.id} challenge={c} />) : <p className="lmeta">Finished challenges and matches will be listed here.</p>}
      </>}
      <h2 className="lsection">Latest results</h2>
      {results.length ? results.map(c => <ChallengeCard key={c.id} challenge={c} compact />) : <EmptyState icon="trophy" title="No results yet">Confirmed matches appear here.</EmptyState>}
    </>
  );
}
