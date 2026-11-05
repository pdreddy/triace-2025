import { Link } from 'react-router-dom';
import { Icon } from './Icons';
import { useEarlyBird } from '../hooks/useEarlyBird';

// A slim bar under the top bar on every page while the early bird is coming up or open.
export function EarlyBirdBar() {
  const { bird } = useEarlyBird();
  if (bird.phase !== 'open' && bird.phase !== 'upcoming') return null;
  return (
    <aside className={`early-bar ${bird.phase}`} aria-label="Early-bird registration">
      <span className="pill">Early bird</span>
      <strong>{bird.countdown}</strong>
      <span className="early-bar-text">{bird.short}</span>
      <Link to="/register">{bird.phase === 'open' ? 'Register now' : 'Details'} <Icon name="arrow" size={14} /></Link>
    </aside>
  );
}

// The full picture on the registration page: where we are in the timeline, the dates, and what changes after.
export function EarlyBirdCard() {
  const { plan, bird } = useEarlyBird();
  if (bird.phase === 'off') return null;
  return (
    <section className={`early-card ${bird.phase}`} aria-label="Early-bird registration">
      <div className="early-card-head">
        <span className="pill">{bird.label}</span>
        {bird.countdown && <strong className="early-count">{bird.countdown}</strong>}
      </div>
      <h2>{bird.headline}</h2>
      <p>{bird.detail}</p>
      <ol className="early-steps">
        {bird.steps.map((step, i) => (
          <li key={step.key} className={i === bird.step ? 'current' : i < bird.step ? 'done' : ''} aria-current={i === bird.step ? 'step' : undefined}>
            <i aria-hidden="true">{i < bird.step ? <Icon name="check" size={14} /> : i + 1}</i>
            <span><b>{step.text}</b><small>{step.title}</small></span>
          </li>
        ))}
      </ol>
      {plan.surchargeUsd > 0 && <p className="early-note">Register before <b>{bird.steps[2].text.replace('From ', '')}</b> to avoid the <b>${plan.surchargeUsd}</b> late fee.</p>}
    </section>
  );
}
