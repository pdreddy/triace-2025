import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icons';
import { Message } from '../../components/UI';
import { useLadder, useAction } from './LadderContext';
import { challengeOption } from './selectors';

export default function ChallengeDialog({ opponent, onClose }) {
  const { me, season, playerId, meta, act, rules } = useLadder(), { busy, error, run } = useAction();
  const dialog = useRef(null), [sent, setSent] = useState(false);
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close(); }, []);
  const option = challengeOption(season, playerId, opponent.id);
  const send = () => run(async () => { await act({ action: 'challenge', opponentId: opponent.id }); setSent(true); });
  return (
    <dialog ref={dialog} className={`ladder-duel${sent ? ' sent' : ''}`} aria-labelledby="duel-title" aria-describedby="duel-description" onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="duel-content">
        <button className="duel-close secondary small" aria-label="Close challenge" disabled={busy} onClick={onClose}><Icon name="close" size={18} /></button>
        <p className="eyebrow">Singles Ladder · Your next match</p>
        <div className="duel-court" aria-hidden="true"><span className="duel-net" /><span className="duel-ball"><Icon name="ball" size={30} /></span>{sent && <div className="duel-sparks">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--angle': `${i * 45}deg` }} />)}</div>}</div>
        <h2 id="duel-title" key={sent ? 'sent' : 'ready'}>{sent ? 'Challenge sent!' : 'Make your move.'}</h2>
        <div className="duel-players"><div><span>#{me?.rank}</span><strong>{me?.name}</strong><small>You · Challenger</small></div><b>VS</b><div><span>#{opponent.rank}</span><strong>{opponent.name}</strong><small>Opponent</small></div></div>
        <p id="duel-description">{sent ? `${opponent.name} has ${rules.response.hours} hours to respond. Follow your challenge in Matches.` : `Challenge ${opponent.name} for a chance to climb. They have ${rules.response.hours} hours to accept or decline.`}</p>
        {!sent && (!option.ok || meta.status !== 'active') && <Message error>{meta.status !== 'active' ? 'This season is no longer open for challenges.' : `${option.why || 'This opponent is no longer available'}. Choose another opponent.`}</Message>}
        <Message error>{error}</Message>
        <div className="duel-actions">{sent ? <><Link className="button" to="/ladder/matches" onClick={onClose}>View match <Icon name="arrow" size={18} /></Link><button className="secondary" onClick={onClose}>Back to ladder</button></> : <><button className="button" disabled={busy || !option.ok || meta.status !== 'active'} onClick={send}>{busy ? 'Sending challenge…' : 'Send challenge'}<Icon name={busy ? 'ball' : 'arrow'} size={18} /></button><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button></>}</div>
      </div>
    </dialog>
  );
}
