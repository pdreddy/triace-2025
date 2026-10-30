import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRulesAccess } from '../hooks/useRulesAccess';
import { Icon } from '../components/Icons';
const CARD_COUNT = 9;
export default function Rules() {
  const { accepted, accept } = useRulesAccess();
  const frame = useRef(null), cleanup = useRef(() => {});
  const [seen, setSeen] = useState([0]), [current, setCurrent] = useState(0), [checked, setChecked] = useState(false), [ready, setReady] = useState(false), [titles, setTitles] = useState([]);
  const allSeen = seen.length === CARD_COUNT;
  function record(index) { setSeen(old => old.includes(index) ? old : [...old, index]); }
  function cardsOf(root) { return [...(root?.querySelector('.track')?.children || [])].filter(el => el.matches('header,section')); }
  function attach() {
    cleanup.current();
    const doc = frame.current?.contentDocument;
    const root = doc?.querySelector('#triace'), track = root?.querySelector('.track');
    if (!track) return;
    const cards = cardsOf(root);
    if (cards.length !== CARD_COUNT) return;
    setTitles(cards.map(card => card.dataset.title || card.querySelector('h1,h2')?.textContent?.trim() || ''));
    setReady(true); record(0);
    const observer = new frame.current.contentWindow.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .35) {
        const index = cards.indexOf(entry.target);
        if (index >= 0) { record(index); if (!root.classList.contains('deck')) setCurrent(index); }
      }
    }, { root: null, threshold: [.35, .6] });
    cards.forEach(card => observer.observe(card));
    const mutation = new frame.current.contentWindow.MutationObserver(() => {
      if (!root.classList.contains('deck')) return;
      const index = cards.findIndex(card => card.classList.contains('active'));
      if (index >= 0) { setCurrent(index); record(index); }
    });
    mutation.observe(track, { attributes: true, attributeFilter: ['class'], subtree: true });
    cleanup.current = () => { observer.disconnect(); mutation.disconnect(); };
  }
  function next() {
    const root = frame.current?.contentDocument?.querySelector('#triace'), cards = cardsOf(root);
    if (!root || current >= cards.length - 1) return;
    if (root.classList.contains('deck')) root.querySelector('.dnav .next')?.click();
    else cards[current + 1]?.scrollIntoView({ behavior: 'auto', block: 'start' });
    setCurrent(current + 1);
  }
  const last = current >= CARD_COUNT - 1;
  return <section className="rules-screen" aria-label="Official Triace tournament rules">
    <div className="rules-frame">{current > 0 && <span className="rules-bounce" key={current} aria-hidden="true" />}<iframe ref={frame} src="/triace-rules.html" title="Complete Triace 2.0 tournament rules" onLoad={attach} /></div>
    <div className="rules-dock">
      <div className="rules-dock-row">
        <div className="rules-count"><strong>{seen.length}<small>/{CARD_COUNT}</small></strong><span>{titles[current] || 'Sections read'}</span></div>
        <div className="rules-progress" role="progressbar" aria-label="Rules read" aria-valuemin="0" aria-valuemax={CARD_COUNT} aria-valuenow={seen.length}>{Array.from({ length: CARD_COUNT }, (_, i) => <span key={i} className={`${seen.includes(i) ? 'done' : ''}${i === current ? ' current' : ''}`} />)}</div>
        <button type="button" className="button small" onClick={next} disabled={!ready || last} aria-label="Next rule card">{last ? 'Last rule' : <>Next <Icon name="arrow" size={16} /></>}</button>
      </div>
      {accepted ? <div className="rules-agree done"><span><Icon name="check" size={18} /> Rules accepted</span><Link className="button small" to="/register">Register team ↗</Link></div>
        : <div className={`rules-agree${allSeen ? ' ready' : ''}`}><label><input type="checkbox" checked={checked} disabled={!allSeen} onChange={e => setChecked(e.target.checked)} /> {allSeen ? 'I have read all sections and agree.' : 'Read all sections and agree to register 🔒'}</label><button type="button" className="button small" disabled={!allSeen || !checked} onClick={accept}>Agree to rules</button></div>}
    </div>
  </section>;
}
