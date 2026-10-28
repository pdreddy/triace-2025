import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRulesAccess } from '../hooks/useRulesAccess';
import './rules.css';
const CARD_COUNT = 9;
export default function Rules() {
  const { accepted, accept } = useRulesAccess();
  const frame = useRef(null), cleanup = useRef(() => {});
  const [seen, setSeen] = useState([0]), [current, setCurrent] = useState(0), [checked, setChecked] = useState(false), [ready, setReady] = useState(false);
  const allSeen = seen.length === CARD_COUNT;
  function record(index) { setSeen(old => old.includes(index) ? old : [...old, index]); }
  function attach() {
    cleanup.current();
    const doc = frame.current?.contentDocument;
    const root = doc?.querySelector('#triace'), track = root?.querySelector('.track');
    if (!track) return;
    const cards = [...track.children].filter(el => el.matches('header,section'));
    if (cards.length !== CARD_COUNT) return;
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
    const doc = frame.current?.contentDocument, root = doc?.querySelector('#triace');
    const cards = [...(root?.querySelector('.track')?.children || [])].filter(el => el.matches('header,section'));
    if (!root || current >= cards.length - 1) return;
    if (root.classList.contains('deck')) root.querySelector('.dnav .next')?.click();
    else cards[current + 1]?.scrollIntoView({ behavior: 'auto', block: 'start' });
    setCurrent(current + 1);
  }
  return <section className="embedded-rules" aria-label="Official Triace tournament rules">
    <div className="rules-frame-wrap">{current > 0 && <span className="rules-bounce" key={current} aria-hidden="true" />}<iframe ref={frame} src="/triace-rules.html" title="Complete Triace 2.0 tournament rules" onLoad={attach} /></div>
    <div className="rules-review"><div className="rules-review-top"><strong>{seen.length}/{CARD_COUNT} <span>sections read</span></strong><div className="rules-progress" role="progressbar" aria-label="Rules read" aria-valuemin="0" aria-valuemax={CARD_COUNT} aria-valuenow={seen.length}><span style={{ width: `${seen.length / CARD_COUNT * 100}%` }} /></div><button type="button" onClick={next} disabled={!ready || current >= CARD_COUNT - 1} aria-label="Next rule card">{current >= CARD_COUNT - 1 ? 'Last rule' : 'Next →'}</button></div>
      {accepted ? <div className="rules-agreement done"><span>✓ Rules accepted</span><Link className="rules-register" to="/register">Register team ↗</Link></div> : <div className="rules-agreement"><label><input type="checkbox" checked={checked} disabled={!allSeen} onChange={e => setChecked(e.target.checked)} /> {allSeen ? 'I have read all sections and agree.' : 'Read all sections and agree to register 🔒'}</label><button type="button" disabled={!allSeen || !checked} onClick={accept}>Agree to rules</button></div>}</div>
  </section>;
}
