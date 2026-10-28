import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRulesAccess } from '../hooks/useRulesAccess';
import './rules.css';

const SECTIONS = [
  'TRIACE 2.0', 'Team composition', 'Team UTR & tiers', 'Match format',
  'Playoff eligibility', 'Playoff qualification', 'Challenge rule',
  'Playoff format', 'Best of 5'
];

export default function Rules() {
  const { accepted, accept } = useRulesAccess();
  const navigate = useNavigate();
  const frame = useRef(null), cleanup = useRef(() => {}), cardsRef = useRef([]), limitRef = useRef(0), acceptedRef = useRef(accepted);
  const [current, setCurrent] = useState(0);
  const [confirmed, setConfirmed] = useState([]);
  const [ready, setReady] = useState(false);
  const allConfirmed = confirmed.length === SECTIONS.length;
  const unlocked = SECTIONS.findIndex((_, index) => !confirmed.includes(index));
  const lastUnlocked = unlocked === -1 ? SECTIONS.length - 1 : Math.min(unlocked, SECTIONS.length - 1);
  limitRef.current = lastUnlocked;
  acceptedRef.current = accepted;
  useEffect(() => () => cleanup.current(), []);

  function attach() {
    cleanup.current();
    const doc = frame.current?.contentDocument;
    const root = doc?.querySelector('#triace'), track = root?.querySelector('.track');
    if (!track) return;
    const cards = [...track.children].filter(el => el.matches('header,section'));
    if (cards.length !== SECTIONS.length) return;
    cardsRef.current = cards;
    if (!doc.querySelector('link[data-local-fonts]')) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet'; link.href = '/fonts/fonts.css'; link.dataset.localFonts = 'true';
      doc.head.appendChild(link);
    }
    if (!doc.querySelector('style[data-rulebook-controls]')) {
      const style = doc.createElement('style');
      style.dataset.rulebookControls = 'true';
      style.textContent = '.triace.deck .dnav,.triace.deck .swipe{display:none!important}.triace.deck .track{overflow-x:hidden!important;touch-action:pan-y}';
      doc.head.appendChild(style);
    }
    setReady(true);
    const observer = new frame.current.contentWindow.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .35 && !root.classList.contains('deck')) {
        const index = cards.indexOf(entry.target);
        if (index >= 0) {
          if (!acceptedRef.current && index > limitRef.current) cards[limitRef.current]?.scrollIntoView({ behavior: 'auto', block: 'start' });
          else setCurrent(index);
        }
      }
    }, { root: null, threshold: [.35, .6] });
    cards.forEach(card => observer.observe(card));
    const mutation = new frame.current.contentWindow.MutationObserver(() => {
      if (!root.classList.contains('deck')) return;
      const index = cards.findIndex(card => card.classList.contains('active'));
      if (index >= 0) {
        if (!acceptedRef.current && index > limitRef.current) root.querySelectorAll('.dnav .dots button')[limitRef.current]?.click();
        else setCurrent(index);
      }
    });
    mutation.observe(track, { attributes: true, attributeFilter: ['class'], subtree: true });
    const guard = event => {
      if (acceptedRef.current) return;
      const button = event.target.closest('.dnav button');
      if (!button) return;
      const dots = [...root.querySelectorAll('.dnav .dots button')];
      const target = dots.includes(button) ? dots.indexOf(button) : button.classList.contains('next') ? cards.findIndex(card => card.classList.contains('active')) + 1 : -1;
      if (target > limitRef.current) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    doc.addEventListener('click', guard, true);
    cleanup.current = () => { observer.disconnect(); mutation.disconnect(); doc.removeEventListener('click', guard, true); };
  }

  function show(index) {
    if (!ready || index < 0 || index >= SECTIONS.length || (!accepted && index > lastUnlocked)) return;
    const root = frame.current?.contentDocument?.querySelector('#triace');
    if (root?.classList.contains('deck')) root.querySelectorAll('.dnav .dots button')[index]?.click();
    else cardsRef.current[index]?.scrollIntoView({ behavior: 'auto', block: 'start' });
    setCurrent(index);
  }

  function continueReading() {
    if (!confirmed.includes(current) && !accepted) return;
    if (current < SECTIONS.length - 1) { show(current + 1); return; }
    if (allConfirmed && !accepted) accept();
    navigate('/register');
  }

  function confirmCurrent(checked) {
    setConfirmed(old => checked ? old.includes(current) ? old : [...old, current] : old.filter(index => index !== current));
  }

  return <section className="rulebook" aria-label="Triace rulebook">
    <div className="rulebook-layout">
      <aside className="rulebook-sidebar" aria-label="Rulebook sections">
        <h2>Rulebook</h2>
        <ol>{SECTIONS.map((title, index) => {
          const locked = !accepted && index > lastUnlocked;
          return <li key={title}><button type="button" className={index === current ? 'current' : ''} disabled={locked || !ready} onClick={() => show(index)} aria-current={index === current ? 'step' : undefined}><span className="rulebook-status">{confirmed.includes(index) || accepted ? '✓' : index === current ? '●' : '·'}</span><span className="rulebook-number">{index + 1}</span><span className="rulebook-title">{title}</span><span className="rulebook-end" aria-hidden="true">{locked ? <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="9" width="12" height="9" rx="1.5"/><path d="M6.5 9V6a3.5 3.5 0 0 1 7 0v3"/></svg> : index === current ? '›' : ''}</span></button></li>;
        })}</ol>
      </aside>
      <div className="rulebook-stage">
        <div className="rulebook-progress"><span>Section {current + 1} of {SECTIONS.length}</span><div className="rulebook-steps" aria-label="Rulebook progress">{SECTIONS.map((title, index) => <button key={title} type="button" onClick={() => show(index)} disabled={!ready || (!accepted && index > lastUnlocked)} className={`${index === current ? 'active' : ''} ${confirmed.includes(index) || accepted ? 'done' : ''}`} aria-label={`Section ${index + 1}: ${title}`} aria-current={index === current ? 'step' : undefined}>{confirmed.includes(index) || accepted ? '✓' : index + 1}</button>)}</div></div>
        <div className="rules-frame-wrap">{current > 0 && <span className="rules-bounce" key={current} aria-hidden="true" />}<iframe ref={frame} src="/triace-rules.html" title="Complete Triace 2.0 tournament rules" onLoad={attach} /></div>
      </div>
    </div>
    <div className="rulebook-actions"><label><input type="checkbox" checked={confirmed.includes(current) || accepted} disabled={!ready || accepted} onChange={e => confirmCurrent(e.target.checked)} /><span>{accepted ? 'Rules accepted' : confirmed.includes(current) ? 'Section confirmed' : 'Check to confirm this section'}</span></label><div><button type="button" className="rulebook-back" disabled={current === 0} onClick={() => show(current - 1)}>Back</button><button type="button" className="rulebook-continue" disabled={!ready || (!accepted && !confirmed.includes(current)) || (current === SECTIONS.length - 1 && !accepted && !allConfirmed)} onClick={continueReading}>{current === SECTIONS.length - 1 ? accepted ? 'Register →' : 'Agree & register →' : 'Continue →'}</button></div></div>
  </section>;
}
