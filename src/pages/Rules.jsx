import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRulesAccess } from '../hooks/useRulesAccess';
import { Icon } from '../components/Icons';
import { RULE_CARDS } from '../rules/cards';

const COUNT = RULE_CARDS.length;

// Played on every card change: a racquet swings and three balls bounce across the card.
function Rally() {
  return (
    <div className="rally" aria-hidden="true">
      <svg className="racquet" viewBox="0 0 64 150">
        <ellipse className="racquet-frame" cx="32" cy="38" rx="27" ry="34" />
        <path className="racquet-strings" d="M14 18v40M23 8v60M32 5v66M41 8v60M50 18v40M8 26h48M6 38h52M8 50h48M14 62h36" />
        <path className="racquet-throat" d="M20 68l12 22 12-22" />
        <rect className="racquet-grip" x="27" y="88" width="10" height="58" rx="4" />
      </svg>
      <i className="rally-ball" /><i className="rally-ball" /><i className="rally-ball" />
    </div>
  );
}

export default function Rules() {
  const { accepted, accept } = useRulesAccess();
  const track = useRef(null);
  const [current, setCurrent] = useState(0), [seen, setSeen] = useState([0]), [checked, setChecked] = useState(false);
  const allSeen = seen.length === COUNT, last = current === COUNT - 1;

  function show(index) {
    setCurrent(index);
    setSeen(old => (old.includes(index) ? old : [...old, index]));
  }
  function go(index) {
    const next = Math.min(COUNT - 1, Math.max(0, index)), el = track.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'instant' });
    show(next);
  }
  // Swiping snaps the track one card at a time; whichever card is centred counts as read.
  function onScroll(event) {
    const el = event.currentTarget, index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== current && index >= 0 && index < COUNT) show(index);
  }
  function onKeyDown(event) {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1); }
  }

  return (
    <section className="rules-screen" aria-label="Official Triace tournament rules">
      <div className="deck">
        {current > 0 && <Rally key={current} />}
        <div className="deck-track" ref={track} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} aria-roledescription="carousel" aria-label="Rule cards">
          {RULE_CARDS.map((card, i) => (
            <article key={card.title} className={`rule-card${card.hero ? ' hero' : ''}${i === current ? ' active' : ''}`} aria-roledescription="slide" aria-label={`${i + 1} of ${COUNT}: ${card.title}`} aria-hidden={i !== current}>
              <div className="rule-card-body">{card.body}</div>
            </article>
          ))}
        </div>
        <div className="deck-nav">
          <button type="button" className="round-button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous rule card"><Icon name="chevronLeft" /></button>
          <div className="deck-dots" role="group" aria-label="Jump to a rule card">
            {RULE_CARDS.map((card, i) => <button key={card.title} type="button" className={`${seen.includes(i) ? 'seen' : ''}${i === current ? ' current' : ''}`} onClick={() => go(i)} aria-label={`Card ${i + 1}: ${card.title}`} aria-current={i === current} />)}
          </div>
          <button type="button" className="round-button primary" onClick={() => go(current + 1)} disabled={last} aria-label="Next rule card"><Icon name="chevronRight" /></button>
        </div>
      </div>

      <div className="rules-dock">
        <div className="rules-dock-row">
          <p className="rules-count"><strong>{seen.length}<small>/{COUNT}</small></strong><span>{RULE_CARDS[current].title}</span></p>
          <div className="rules-progress" role="progressbar" aria-label="Rules read" aria-valuemin="0" aria-valuemax={COUNT} aria-valuenow={seen.length}>
            {RULE_CARDS.map((card, i) => <span key={card.title} className={seen.includes(i) ? 'done' : ''} />)}
          </div>
        </div>
        {accepted ? (
          <div className="rules-agree done">
            <span><Icon name="check" size={18} /> Rules accepted</span>
            <Link className="button small" to="/register">Register team ↗</Link>
          </div>
        ) : (
          <div className={`rules-agree${allSeen ? ' ready' : ''}`}>
            <label>
              <input type="checkbox" checked={checked} disabled={!allSeen} onChange={e => setChecked(e.target.checked)} />
              {allSeen ? 'I have read all sections and agree.' : 'Read all sections and agree to register 🔒'}
            </label>
            <button type="button" className="button small" disabled={!allSeen || !checked} onClick={accept}>Agree to rules</button>
          </div>
        )}
      </div>
    </section>
  );
}
