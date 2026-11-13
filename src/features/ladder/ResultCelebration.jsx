import { useEffect, useRef } from 'react';
import { Icon } from '../../components/Icons';
import { useLadder } from './LadderContext';

export default function ResultCelebration({ challenge: c, onClose, onViewStandings }) {
  const { season, playerId } = useLadder(), dialog = useRef(null);
  const winnerId = c.result.winnerId, loserId = winnerId === c.challengerId ? c.opponentId : c.challengerId;
  const winner = season.players[winnerId], loser = season.players[loserId], won = playerId === winnerId;
  const before = c.outcome?.ranksBefore || {}, after = c.outcome?.ranksAfter || {};
  const moved = before[winnerId] > after[winnerId] && after[loserId] > before[loserId];
  useEffect(() => {
    const node = dialog.current; node.showModal();
    // Keep the result available for reading; the animation itself ends after three seconds.
    return () => node.close();
  }, []);
  const points = id => { const value = c.outcome?.points?.[id] ?? 0; return `${value >= 0 ? '+' : ''}${value} point${Math.abs(value) === 1 ? '' : 's'}`; };
  const rank = id => before[id] && after[id] ? before[id] === after[id] ? `Stays at #${after[id]}` : `#${before[id]} → #${after[id]}` : '';
  return <dialog ref={dialog} className="ladder-result" aria-labelledby="result-title" aria-describedby="result-summary" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="result-content">
      <button className="secondary small result-close" aria-label="Skip result animation" autoFocus onClick={onClose}><Icon name="close" size={18} /></button>
      <p className="eyebrow">Match confirmed</p>
      <h2 id="result-title">{won ? moved ? 'Up you go!' : 'A win to remember.' : 'The climb continues.'}</h2>
      <p id="result-summary">{winner.name} wins{c.result.score ? ` · ${c.result.score}` : ` · ${c.result.kind === 'noShow' ? 'No-show' : 'Walkover'}`}</p>
      {moved ? <div className="result-board" aria-hidden="true">
        <svg viewBox="0 0 600 265" fill="none">
          <defs><linearGradient id="result-snake" x1="400" y1="45" x2="480" y2="225" gradientUnits="userSpaceOnUse"><stop stopColor="#79e5c9" /><stop offset="1" stopColor="#2ec4b6" /></linearGradient></defs>
          <path d="M70 235H530" stroke="#28465d" strokeDasharray="4 6" />
          <g className="result-ladder" stroke="#d9f24b" strokeWidth="5" strokeLinecap="round"><path d="M114 215V43M166 215V43" />{[65, 92, 119, 146, 173, 200].map(y => <path key={y} d={`M114 ${y}H166`} />)}</g>
          <g transform="translate(140 205)"><g className="result-winner-token"><circle r="22" fill="#d9f24b" /><circle r="28" stroke="#d9f24b" strokeOpacity=".3" /><text textAnchor="middle" y="6" fill="#071521" fontSize="18" fontWeight="800">{winner.name.charAt(0)}</text></g></g>
          <path className="result-crown" d="m121 30-4-18 14 9 9-16 9 16 14-9-4 18z" fill="#d9f24b" />
          <path d="M445 45C370 80 530 105 440 130S420 175 460 205" stroke="url(#result-snake)" strokeWidth="24" strokeLinecap="round" />
          <path d="M445 45C370 80 530 105 440 130S420 175 460 205" stroke="#087d73" strokeWidth="3" strokeDasharray="2 14" strokeLinecap="round" />
          <g className="result-snake-head"><ellipse cx="460" cy="215" rx="31" ry="24" fill="#2ec4b6" /><ellipse cx="460" cy="219" rx="19" ry="10" fill="#071521" /><circle cx="444" cy="201" r="8" fill="#92efcd" /><circle cx="475" cy="201" r="8" fill="#92efcd" /><circle cx="446" cy="201" r="3" fill="#071521" /><circle cx="473" cy="201" r="3" fill="#071521" /><path d="m450 210 3 6 3-6m8 0 3 6 3-6" fill="#e4fff2" /></g>
          <g transform="translate(445 45)"><g className="result-loser-token"><circle r="18" fill="#ffb38a" /><text textAnchor="middle" y="5" fill="#071521" fontSize="16" fontWeight="800">{loser.name.charAt(0)}</text></g></g>
          <text className="result-gulp" x="504" y="213" fill="#79e5c9" fontSize="15" fontWeight="700" transform="rotate(-8 504 213)">Gulp!</text>
        </svg>
      </div> : <div className="result-trophy" aria-hidden="true"><Icon name="trophy" size={64} /></div>}
      <div className="result-players"><div><small>Winner{moved ? ' · Up the ladder' : ''}</small><strong>{winner.name}</strong><span>{rank(winnerId)}</span><b>{points(winnerId)}</b></div><div><small>{moved ? 'Down the snake' : 'Opponent'}</small><strong>{loser.name}</strong><span>{rank(loserId)}</span><b>{points(loserId)}</b></div></div>
      {!moved && <p className="lmeta">Positions unchanged under this match’s rules.</p>}
      <button className="button result-done" onClick={onViewStandings || onClose}>Back to the ladder <Icon name="arrow" size={18} /></button>
    </div>
  </dialog>;
}
