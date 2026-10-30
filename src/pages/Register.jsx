import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { useRulesAccess } from '../hooks/useRulesAccess';
import { Field, Message, UtrMeter, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { assignSelectedTier, assignTier, orderedTiers, parseUtr, formatUtr, validateRegistration } from '../../functions/lib/tournament.js';
const empty = () => ({ captain: { name: '', singles: '', doubles: '' }, ace1: { name: '', singles: '', doubles: '' }, ace2: { name: '', singles: '', doubles: '' } });
const PLAYERS = [['captain', 'Captain', 'First name public'], ['ace1', 'Ace 1', 'Full name private'], ['ace2', 'Ace 2', 'Full name private']];
const STEPS = ['Tier', 'Captain', 'Ace 1', 'Ace 2', 'Confirm'];
function rating(player) { try { return Math.max(player.singles ? parseUtr(player.singles) : 0, player.doubles ? parseUtr(player.doubles) : 0); } catch { return 0; } }
export default function Register() {
  const { data, service, user, connected } = useTournament();
  const { accepted } = useRulesAccess();
  const [players, setPlayers] = useState(empty), [selectedTier, setSelectedTier] = useState('higher'), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(null), [step, setStep] = useState(0);
  const id = useRef(crypto.randomUUID()), form = useRef(null);
  const config = data?.tierConfig || {}, active = orderedTiers(config, true), settings = data?.settings;
  let combined = 0, complete = true;
  for (const value of Object.values(players)) { try { if (!value.singles) complete = false; combined += Math.max(value.singles ? parseUtr(value.singles) : 0, value.doubles ? parseUtr(value.doubles) : 0); } catch { complete = false; } }
  const highest = complete ? assignTier(combined, config) : null;
  const assigned = complete ? assignSelectedTier(combined, config, selectedTier) : null;
  const filled = key => !!players[key].name.trim() && !!players[key].singles;
  const stepDone = [true, filled('captain'), filled('ace1'), filled('ace2'), consent];
  const canRegister = !busy && settings?.registrationEnabled && connected && user?.uid && active.length;
  function change(key, field, value) { setPlayers(old => ({ ...old, [key]: { ...old[key], [field]: value } })); setError(''); setSuccess(null); }
  function next() { const panel = form.current.querySelector('.step-panel.on'), bad = [...panel.querySelectorAll('input')].find(i => !i.checkValidity()); if (bad) { bad.reportValidity(); return; } setStep(old => Math.min(STEPS.length - 1, old + 1)); }
  function jump(i) { setStep(i); form.current?.querySelectorAll('.step-panel')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (!settings || !connected || !user?.uid) { setError('Registration is not connected. Please wait or contact the admin.'); return; }
    setError(''); setSuccess(null);
    try {
      const payload = { teamId: id.current, selectedTier, consent, rulesAccepted: accepted };
      for (const [key, value] of Object.entries(players)) payload[key] = { [key === 'captain' ? 'firstName' : 'fullName']: value.name.trim(), singlesUtr: parseUtr(value.singles), doublesUtr: value.doubles.trim() ? parseUtr(value.doubles) : null };
      validateRegistration(payload, settings, config);
      setBusy(true); const result = await service.register(payload); setSuccess(result); setPlayers(empty()); setConsent(false); setStep(0); id.current = crypto.randomUUID();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const assignedLabel = assigned ? selectedTier === 'both' ? 'GOAT + Rising' : config[assigned].name : complete ? highest ? 'Choose an eligible tier' : 'No eligible active tier' : 'Add all three UTR values';
  if (success) return <section className="page success-screen" role="status">
    <span className="success-icon"><Icon name="check" size={40} /></span>
    <p className="eyebrow">Registration complete</p><h1>You’re in the <em>draw.</em></h1>
    <p className="success-detail">Team registered successfully! Listed in {success.listedTiers?.length > 1 ? 'GOAT and Rising' : config[success.assignedTier]?.name || success.assignedTier}, combined UTR {formatUtr(success.combinedUtr)}.</p>
    <dl className="success-facts"><div><dt>Combined UTR</dt><dd>{formatUtr(success.combinedUtr)}</dd></div><div><dt>Registration ID</dt><dd className="id">{success.teamId}</dd></div></dl>
    <div className="success-actions"><Link className="button" to="/tiers">View the lineup <Icon name="arrow" size={18} /></Link><button type="button" className="secondary" onClick={() => setSuccess(null)}>Register another team</button></div>
  </section>;
  return <section className="register-screen">
    <header className="page-head"><p className="eyebrow">Three players. One team.</p><h1>Build your <em>trio.</em></h1><p>Pick your tier, add your three players, and see where your team lands as you type.</p></header>
    <ol className="step-rail" aria-label="Registration steps">{STEPS.map((label, i) => <li key={label}><button type="button" className={`${step === i ? 'current' : ''}${stepDone[i] && i > 0 ? ' done' : ''}`} onClick={() => jump(i)}><span>{stepDone[i] && i > 0 ? <Icon name="check" size={14} /> : i + 1}</span>{label}</button></li>)}</ol>
    <div className="register-grid">
      <form ref={form} onSubmit={submit} aria-label="Team registration"><fieldset disabled={busy}>
        <div className={`step-panel panel${step === 0 ? ' on' : ''}`} role="group" aria-label="Choose your tier"><div className="panel-head"><h2>Choose your tier</h2><p className="small">GOAT-qualified teams may enter GOAT, Rising, or both. Rising-qualified teams may enter Rising only.</p></div>
          <div className="tier-options">{active.map(t => { const off = complete && !!highest && !assignSelectedTier(combined, config, t.id); return <label className={`tier-option ${tierTone(t.id)} ${selectedTier === t.id ? 'selected' : ''}`} key={t.id}><input type="radio" name="tier" value={t.id} disabled={off} checked={selectedTier === t.id} onChange={() => setSelectedTier(t.id)} />{['goat', 'rising'].includes(t.id) && <img className="tier-option-art" src={`/${t.id}-tier.webp`} alt="" />}<span><strong>{t.name}</strong><small>{formatUtr(t.minCombinedUtr)}–{formatUtr(t.maxCombinedUtr)} combined UTR{off ? ` · Not available at ${formatUtr(combined)}` : ''}</small></span></label>; })}
            <label className={`tier-option both ${selectedTier === 'both' ? 'selected' : ''}`}><input type="radio" name="tier" value="both" disabled={!config.goat?.active || !config.rising?.active || (complete && highest !== 'goat')} checked={selectedTier === 'both'} onChange={() => setSelectedTier('both')} /><span><strong>GOAT + Rising</strong><small>{complete && highest !== 'goat' ? 'Only for teams that qualify for GOAT' : 'Enter both tiers when your team qualifies for GOAT'}</small></span></label>
            <label className={`tier-option higher ${selectedTier === 'higher' ? 'selected' : ''}`}><input type="radio" name="tier" value="higher" checked={selectedTier === 'higher'} onChange={() => setSelectedTier('higher')} /><span><strong>Interested in a higher UTR tier</strong><small>Place us in the highest eligible tier</small></span></label></div></div>
        {PLAYERS.map(([key, title, note], i) => <section className={`player step-panel panel${step === i + 1 ? ' on' : ''}`} key={key}><div className="panel-head player-heading"><h2><span className="player-num">0{i + 1}</span>{title}</h2><span className="pill">{note}</span></div>
          <Field id={`${key}-name`} label={i === 0 ? 'Captain first name' : `${title} full name`} value={players[key].name} onChange={e => change(key, 'name', e.target.value)} required maxLength={i === 0 ? 40 : 80} autoComplete={i === 0 ? 'given-name' : 'off'} placeholder={i === 0 ? 'First name only' : 'Full name'} />
          <div className="ratings"><Field id={`${key}-utr`} label="UTR / singles UTR" value={players[key].singles} onChange={e => change(key, 'singles', e.target.value)} required type="number" inputMode="decimal" step="0.01" min={(settings?.minPlayerUtr || 1) / 100} max={(settings?.maxPlayerUtr || 1650) / 100} placeholder="e.g. 6.50" /><Field id={`${key}-doubles`} label="Doubles UTR (optional)" value={players[key].doubles} onChange={e => change(key, 'doubles', e.target.value)} type="number" inputMode="decimal" step="0.01" min={(settings?.minPlayerUtr || 1) / 100} max={(settings?.maxPlayerUtr || 1650) / 100} placeholder="If applicable" /></div></section>)}
        <div className={`step-panel panel confirm${step === 4 ? ' on' : ''}`}><div className="panel-head"><h2>Confirm &amp; register</h2></div><p className="rules-confirmed"><Icon name="check" size={16} /> Tournament rules accepted in this session. <Link to="/">Review rules</Link></p><label className="checkbox"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>I have permission to register these players and publish the captain’s first name and all three UTR values. Ace names are public only when the admin turns masking off.</span></label><Message error>{error}</Message><button className="button block" disabled={!canRegister}>{busy ? 'Saving registration…' : 'Register team ↗'}</button></div>
        <div className="step-nav"><button type="button" className="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="back" size={16} /> Back</button><span>Step {step + 1} of {STEPS.length}</span>{step < STEPS.length - 1 ? <button type="button" className="button" onClick={next}>Next <Icon name="arrow" size={16} /></button> : <span className="step-nav-spacer" />}</div>
      </fieldset></form>
      <aside className="preview" aria-label="Your team at a glance">
        <div className="preview-score"><div><p className="eyebrow">Your team at a glance</p><output aria-label="Combined UTR">{formatUtr(combined)}</output><span className="preview-unit">Combined UTR</span></div><p className="assignment" role="status">Assigned tier: <strong>{assignedLabel}</strong></p></div>
        <UtrMeter tiers={active} value={combined} />
        <ul className="preview-players">{PLAYERS.map(([key, title]) => <li key={key} className={filled(key) ? 'done' : ''}><span>{title}</span><b>{players[key].name.trim() || '—'}</b><em>{rating(players[key]) ? formatUtr(rating(players[key])) : '0.00'}</em></li>)}</ul>
        <div className="preview-notes"><p><strong>Rating rule.</strong> Each player counts at the higher of singles or doubles UTR.</p><p><strong>Privacy.</strong> The captain’s first name and all three UTRs are public. The admin controls whether Ace names are masked.</p></div>
        {settings && !settings.registrationEnabled && <Message>Registration is closed.</Message>}{data && !settings && <Message>An admin must save the initial tournament configuration.</Message>}
      </aside>
    </div>
  </section>;
}
