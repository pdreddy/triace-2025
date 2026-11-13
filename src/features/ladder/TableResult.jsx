import { Icon } from '../../components/Icons';
import { resultHighlights } from './selectors';

export function RankTrail({ direction }) {
  return <svg className={`rank-trail ${direction}`} viewBox="0 0 24 60" fill="none" aria-hidden="true">
    {direction === 'up' ? <><path d="M5 55V5M19 55V5M5 13H19M5 23H19M5 33H19M5 43H19M5 53H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle className="rank-climber" cx="12" cy="49" r="4" fill="currentColor" /></> : <><path d="M12 5C-3 16 27 25 12 35S6 46 12 50" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /><ellipse className="rank-snake-mouth" cx="12" cy="53" rx="9" ry="6" fill="currentColor" /><ellipse cx="12" cy="54" rx="5" ry="3" fill="#071521" /><circle cx="7" cy="48" r="1.5" fill="#e4fff2" /><circle cx="17" cy="48" r="1.5" fill="#e4fff2" /><circle className="rank-slider" cx="12" cy="5" r="3.5" fill="#ffb38a" /></>}
  </svg>;
}

export function ResultTag({ highlight }) {
  const { role, from, to, change, points } = highlight;
  return <span className={`table-result-tag ${role}`}>
    <b>{role === 'winner' ? 'WIN' : 'LOSS'}</b>
    <span>{change ? <><Icon name={change > 0 ? 'ladder' : 'chevronRight'} size={12} />#{from} → #{to}</> : 'Rank unchanged'}</span>
    <small>{points >= 0 ? '+' : ''}{points} pts</small>
  </span>;
}

export default function TableResult({ challenge, players, onReplay, playing }) {
  const winnerId = challenge.result.winnerId, loserId = winnerId === challenge.challengerId ? challenge.opponentId : challenge.challengerId;
  const highlights = resultHighlights(challenge), winner = highlights[winnerId], loser = highlights[loserId];
  const name = id => players[id]?.name || 'Player';
  return <section className="table-result-banner" aria-label="Latest ladder result">
    <span className="table-result-symbol" aria-hidden="true"><Icon name="trophy" size={23} /></span>
    <div className="table-result-copy" aria-live="polite" aria-atomic="true"><small>Latest match</small><strong>{name(winnerId)} <i>beat</i> {name(loserId)}</strong>
      <p>{challenge.result.score || (challenge.result.kind === 'noShow' ? 'No-show' : 'Walkover')}{winner.change > 0 && loser.change < 0 ? ` · Ladder up ${winner.change} · Snake down ${-loser.change}` : ' · Positions unchanged'}</p>
    </div>
    <button className="secondary small" onClick={onReplay} disabled={playing}><Icon name="refresh" size={15} />{playing ? 'Playing…' : 'Replay on table'}</button>
  </section>;
}
