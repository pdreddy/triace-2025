import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { useRulesAccess } from '../hooks/useRulesAccess';
import { Field, Message, UtrMeter, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { assignSelectedTier, assignTier, orderedTiers, parseUtr, formatUtr, validateRegistration } from '../../functions/lib/tournament.js';

const PLAYERS = [
  { key: 'captain', title: 'Captain', note: 'First name public', label: 'Captain first name', placeholder: 'First name only', max: 40, autoComplete: 'given-name' },
  { key: 'ace1', title: 'Ace 1', note: 'Full name private', label: 'Ace 1 full name', placeholder: 'Full name', max: 80, autoComplete: 'off' },
  { key: 'ace2', title: 'Ace 2', note: 'Full name private', label: 'Ace 2 full name', placeholder: 'Full name', max: 80, autoComplete: 'off' }
];
const STEPS = ['Tier', 'Captain', 'Ace 1', 'Ace 2', 'Confirm'];
const emptyPlayers = () => Object.fromEntries(PLAYERS.map(p => [p.key, { name: '', singles: '', doubles: '' }]));
const rating = player => { try { return Math.max(player.singles ? parseUtr(player.singles) : 0, player.doubles ? parseUtr(player.doubles) : 0); } catch { return 0; } };

function TierOption({ value, tone, title, detail, art, selected, disabled, onSelect }) {
  return (
    <label className={`tier-option ${tone}${selected ? ' selected' : ''}`}>
      <input type="radio" name="tier" value={value} disabled={disabled} checked={selected} onChange={onSelect} />
      {art && <img className="tier-option-art" src={art} alt="" />}
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>
  );
}

function Success({ result, config, onAgain }) {
  const listed = result.listedTiers?.length > 1 ? 'GOAT and Rising' : config[result.assignedTier]?.name || result.assignedTier;
  return (
    <section className="page success-screen" role="status">
      <span className="success-icon"><Icon name="check" size={40} /></span>
      <p className="eyebrow">Registration complete</p>
      <h1>You’re in the <em>draw.</em></h1>
      <p>Team registered successfully! Listed in {listed}, combined UTR {formatUtr(result.combinedUtr)}.</p>
      <dl className="success-facts">
        <div><dt>Combined UTR</dt><dd>{formatUtr(result.combinedUtr)}</dd></div>
        <div><dt>Registration ID</dt><dd className="mono">{result.teamId}</dd></div>
      </dl>
      <div className="success-actions">
        <Link className="button" to="/tiers">View the lineup <Icon name="arrow" size={18} /></Link>
        <button type="button" className="secondary" onClick={onAgain}>Register another team</button>
      </div>
    </section>
  );
}

export default function Register() {
  const { data, service, user, connected } = useTournament();
  const { accepted } = useRulesAccess();
  const [players, setPlayers] = useState(emptyPlayers), [selectedTier, setSelectedTier] = useState('higher'), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(null), [step, setStep] = useState(0);
  const id = useRef(crypto.randomUUID()), form = useRef(null);
  const config = data?.tierConfig || {}, active = orderedTiers(config, true), settings = data?.settings;

  let combined = 0, complete = true;
  for (const value of Object.values(players)) {
    try { if (!value.singles) complete = false; combined += Math.max(value.singles ? parseUtr(value.singles) : 0, value.doubles ? parseUtr(value.doubles) : 0); } catch { complete = false; }
  }
  const highest = complete ? assignTier(combined, config) : null;
  const assigned = complete ? assignSelectedTier(combined, config, selectedTier) : null;
  const assignedLabel = assigned ? (selectedTier === 'both' ? 'GOAT + Rising' : config[assigned].name) : complete ? (highest ? 'Choose an eligible tier' : 'No eligible active tier') : 'Add all three UTR values';
  const filled = key => !!players[key].name.trim() && !!players[key].singles;
  const stepDone = [true, filled('captain'), filled('ace1'), filled('ace2'), consent];
  const utrLimits = { min: (settings?.minPlayerUtr || 1) / 100, max: (settings?.maxPlayerUtr || 1650) / 100 };

  function change(key, field, value) { setPlayers(old => ({ ...old, [key]: { ...old[key], [field]: value } })); setError(''); setSuccess(null); }
  function next() {
    const panel = form.current.querySelector('.step-panel.on'), invalid = [...panel.querySelectorAll('input')].find(i => !i.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    setStep(old => Math.min(STEPS.length - 1, old + 1));
  }
  function jump(index) { setStep(index); form.current?.querySelectorAll('.step-panel')[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!settings || !connected || !user?.uid) { setError('Registration is not connected. Please wait or contact the admin.'); return; }
    setError(''); setSuccess(null);
    try {
      const payload = { teamId: id.current, selectedTier, consent, rulesAccepted: accepted };
      for (const [key, value] of Object.entries(players)) payload[key] = { [key === 'captain' ? 'firstName' : 'fullName']: value.name.trim(), singlesUtr: parseUtr(value.singles), doublesUtr: value.doubles.trim() ? parseUtr(value.doubles) : null };
      validateRegistration(payload, settings, config);
      setBusy(true);
      setSuccess(await service.register(payload));
      setPlayers(emptyPlayers()); setConsent(false); setStep(0); id.current = crypto.randomUUID();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (success) return <Success result={success} config={config} onAgain={() => setSuccess(null)} />;

  const tierLocked = t => complete && !!highest && !assignSelectedTier(combined, config, t.id);
  return (
    <section className="register-screen">
      <header className="page-head">
        <p className="eyebrow">Three players. One team.</p>
        <h1>Build your <em>trio.</em></h1>
        <p>Pick your tier, add your three players, and see where your team lands as you type.</p>
      </header>

      <ol className="step-rail" aria-label="Registration steps">
        {STEPS.map((label, i) => {
          const done = stepDone[i] && i > 0;
          return <li key={label}><button type="button" className={`${step === i ? 'current' : ''}${done ? ' done' : ''}`} onClick={() => jump(i)}><span>{done ? <Icon name="check" size={14} /> : i + 1}</span>{label}</button></li>;
        })}
      </ol>

      <div className="register-grid">
        <form ref={form} onSubmit={submit} aria-label="Team registration">
          <fieldset disabled={busy}>
            <div className={`step-panel card${step === 0 ? ' on' : ''}`} role="group" aria-label="Choose your tier">
              <div className="card-head stacked"><h2>Choose your tier</h2><p className="small">GOAT-qualified teams may enter GOAT, Rising, or both. Rising-qualified teams may enter Rising only.</p></div>
              <div className="tier-options">
                {active.map(t => (
                  <TierOption key={t.id} value={t.id} tone={tierTone(t.id)} title={t.name} art={['goat', 'rising'].includes(t.id) ? `/${t.id}-tier.webp` : null}
                    detail={`${formatUtr(t.minCombinedUtr)}–${formatUtr(t.maxCombinedUtr)} combined UTR${tierLocked(t) ? ` · Not available at ${formatUtr(combined)}` : ''}`}
                    selected={selectedTier === t.id} disabled={tierLocked(t)} onSelect={() => setSelectedTier(t.id)} />
                ))}
                <TierOption value="both" tone="both" title="GOAT + Rising" detail={complete && highest !== 'goat' ? 'Only for teams that qualify for GOAT' : 'Enter both tiers when your team qualifies for GOAT'}
                  selected={selectedTier === 'both'} disabled={!config.goat?.active || !config.rising?.active || (complete && highest !== 'goat')} onSelect={() => setSelectedTier('both')} />
                <TierOption value="higher" tone="higher" title="Interested in a higher UTR tier" detail="Place us in the highest eligible tier" selected={selectedTier === 'higher'} onSelect={() => setSelectedTier('higher')} />
              </div>
            </div>

            {PLAYERS.map((p, i) => (
              <section key={p.key} className={`step-panel card${step === i + 1 ? ' on' : ''}`}>
                <div className="card-head"><h2><span className="player-num">0{i + 1}</span>{p.title}</h2><span className="pill">{p.note}</span></div>
                <Field id={`${p.key}-name`} label={p.label} value={players[p.key].name} onChange={e => change(p.key, 'name', e.target.value)} required maxLength={p.max} autoComplete={p.autoComplete} placeholder={p.placeholder} />
                <div className="ratings">
                  <Field id={`${p.key}-utr`} label="UTR / singles UTR" value={players[p.key].singles} onChange={e => change(p.key, 'singles', e.target.value)} required type="number" inputMode="decimal" step="0.01" min={utrLimits.min} max={utrLimits.max} placeholder="e.g. 6.50" />
                  <Field id={`${p.key}-doubles`} label="Doubles UTR (optional)" value={players[p.key].doubles} onChange={e => change(p.key, 'doubles', e.target.value)} type="number" inputMode="decimal" step="0.01" min={utrLimits.min} max={utrLimits.max} placeholder="If applicable" />
                </div>
              </section>
            ))}

            <div className={`step-panel card${step === 4 ? ' on' : ''}`}>
              <div className="card-head"><h2>Confirm &amp; register</h2></div>
              <p className="confirmed"><Icon name="check" size={16} /> Tournament rules accepted in this session. <Link to="/">Review rules</Link></p>
              <label className="checkbox">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required />
                <span>I have permission to register these players and publish the captain’s first name and all three UTR values. Ace names are public only when the admin turns masking off.</span>
              </label>
              <Message error>{error}</Message>
              <button className="button block" disabled={busy || !settings?.registrationEnabled || !connected || !user?.uid || !active.length}>{busy ? 'Saving registration…' : 'Register team ↗'}</button>
            </div>

            <div className="step-nav">
              <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="back" size={16} /> Back</button>
              <span>Step {step + 1} of {STEPS.length}</span>
              {step < STEPS.length - 1 ? <button type="button" className="button" onClick={next}>Next <Icon name="arrow" size={16} /></button> : <span className="step-nav-spacer" />}
            </div>
          </fieldset>
        </form>

        <aside className="preview" aria-label="Your team at a glance">
          <div className="preview-score">
            <div><p className="eyebrow">Your team at a glance</p><output aria-label="Combined UTR">{formatUtr(combined)}</output><span className="preview-unit">Combined UTR</span></div>
            <p className="assignment" role="status">Assigned tier: <strong>{assignedLabel}</strong></p>
          </div>
          <UtrMeter tiers={active} value={combined} />
          <ul className="preview-players">
            {PLAYERS.map(p => <li key={p.key} className={filled(p.key) ? 'done' : ''}><span>{p.title}</span><b>{players[p.key].name.trim() || '—'}</b><em>{formatUtr(rating(players[p.key]))}</em></li>)}
          </ul>
          <div className="preview-notes">
            <p><strong>Rating rule.</strong> Each player counts at the higher of singles or doubles UTR.</p>
            <p><strong>Privacy.</strong> The captain’s first name and all three UTRs are public. The admin controls whether Ace names are masked.</p>
          </div>
          {settings && !settings.registrationEnabled && <Message>Registration is closed.</Message>}
          {data && !settings && <Message>An admin must save the initial tournament configuration.</Message>}
        </aside>
      </div>
    </section>
  );
}
