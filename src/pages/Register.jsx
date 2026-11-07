import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { useRulesAccess } from '../hooks/useRulesAccess';
import { Field, Message, UtrMeter, tierTone } from '../components/UI';
import PprcLookup from '../components/PprcLookup';
import { Icon } from '../components/Icons';
import { assignSelectedTier, assignTier, orderedTiers, parseUtr, formatUtr, validateRegistration, playerUtr, UTR_GAP_LIMIT, DEFAULT_TIERS } from '../../functions/lib/tournament.js';

const PLAYERS = [
  { key: 'captain', title: 'Captain', note: 'First name public', label: 'Captain first name', placeholder: 'First name only', max: 40, autoComplete: 'given-name' },
  { key: 'ace1', title: 'Ace 1', note: 'Full name private', label: 'Ace 1 full name', placeholder: 'Full name', max: 80, autoComplete: 'off' },
  { key: 'ace2', title: 'Ace 2', note: 'Full name private', label: 'Ace 2 full name', placeholder: 'Full name', max: 80, autoComplete: 'off' }
];
const STEPS = ['Tier', 'Captain', 'Ace 1', 'Ace 2', 'Confirm'];
const emptyPlayers = () => Object.fromEntries(PLAYERS.map(p => [p.key, { name: '', phone: '', singles: '', doubles: '', pprc: null }]));
// Counted rating for the live preview, using the same gap rule as the server (playerUtr).
function rating(player, gap = UTR_GAP_LIMIT) {
  try {
    const singles = player.singles ? parseUtr(player.singles) : 0, doubles = player.doubles ? parseUtr(player.doubles) : null;
    if (!singles) return { value: doubles || 0, averaged: false };
    return { value: playerUtr(singles, doubles, gap), averaged: doubles != null && Math.abs(singles - doubles) > gap };
  } catch { return { value: 0, averaged: false }; }
}

function TierOption({ value, tone, title, detail, eligibility, art, selected, disabled, onSelect }) {
  return (
    <label className={`tier-option ${tone}${selected ? ' selected' : ''}`}>
      <input type="checkbox" value={value} disabled={disabled} checked={selected} onChange={onSelect} />
      {art && <img className="tier-option-art" src={art} alt="" />}
      <span><strong>{title}</strong><small>{detail}</small>{eligibility && <em className={`tier-eligibility${disabled ? ' unavailable' : ''}`}>{eligibility}</em>}</span>
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
      {result.captainCode && (
        <div className="captain-code">
          <p className="eyebrow">Your captain code</p>
          <output className="mono" aria-label="Captain code">{result.captainCode}</output>
          <p className="small">Save it now; it isn’t shown again. Use it to manage your team from another phone or browser (team page → “Captain of this team on a new device?”).</p>
          <button type="button" className="secondary small" onClick={() => navigator.clipboard?.writeText(result.captainCode)}>Copy code</button>
        </div>
      )}
      <div className="success-actions">
        <Link className="button" to={`/team/${result.teamId}`}>Open my team <Icon name="arrow" size={18} /></Link>
        <Link className="secondary" to="/tiers">View the lineup</Link>
        <button type="button" className="secondary" onClick={onAgain}>Register another team</button>
      </div>
    </section>
  );
}

export default function Register() {
  const { data, service, user, connected, error: loadError } = useTournament();
  const { accepted } = useRulesAccess();
  const [players, setPlayers] = useState(emptyPlayers), [whatsappPhone, setWhatsappPhone] = useState(''), [selectedTier, setSelectedTier] = useState('higher'), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState(null), [step, setStep] = useState(0);
  const id = useRef(crypto.randomUUID()), form = useRef(null);
  const settings = data?.settings, config = settings ? data?.tierConfig || {} : DEFAULT_TIERS, active = orderedTiers(config, true), gap = data?.leagueRules?.utrGapLimit ?? UTR_GAP_LIMIT;

  let combined = 0, complete = true;
  for (const value of Object.values(players)) {
    try {
      if (!value.singles) { complete = false; continue; }
      const singles = parseUtr(value.singles), doubles = value.doubles ? parseUtr(value.doubles) : null;
      if (singles < (settings?.minPlayerUtr ?? 1) || singles > (settings?.maxPlayerUtr ?? 1650) || (doubles !== null && (doubles < (settings?.minPlayerUtr ?? 1) || doubles > (settings?.maxPlayerUtr ?? 1650)))) complete = false;
      combined += playerUtr(singles, doubles, gap);
    } catch { complete = false; }
  }
  const highest = complete ? assignTier(combined, config) : null;
  const assigned = complete ? assignSelectedTier(combined, config, selectedTier) : null;
  useEffect(() => {
    if (complete && highest && !assigned) setSelectedTier('higher');
  }, [complete, highest, assigned]);
  const eligibleTiers = complete ? active.filter(t => assignSelectedTier(combined, config, t.id)) : [];
  const goatShortfall = complete && config.goat?.active && combined < config.goat.minCombinedUtr ? config.goat.minCombinedUtr - combined : 0;
  const assignedLabel = assigned ? (selectedTier === 'both' ? 'GOAT + Rising' : config[assigned].name) : complete ? (highest ? 'Choose an eligible tier or allow Rising fallback' : 'No eligible active tier') : 'Add all three UTR values';
  // Every reason the Register button is off, in the order a visitor can act on them.
  const blockers = [
    !connected && 'Connecting to the tournament server…',
    connected && !data && (loadError ? `Tournament data could not be loaded: ${loadError}` : 'Loading tournament settings…'),
    data && !settings && (loadError ? `Registration setup is unavailable: ${loadError}` : 'Opening tournament registration…'),
    settings && !settings.registrationEnabled && 'Registration is closed.',
    data && settings && !active.length && 'No tier is open for registration. An admin must activate a tier.',
    !user?.uid && 'Signing you in… (anonymous sign-in must be enabled in Firebase Authentication)'
  ].filter(Boolean);
  const filled = key => !!players[key].name.trim() && !!players[key].singles;
  const stepDone = [true, filled('captain') && !!whatsappPhone.trim(), filled('ace1') && !!players.ace1.phone.trim(), filled('ace2') && !!players.ace2.phone.trim(), consent];
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
      const payload = { teamId: id.current, whatsappPhone, ace1Phone: players.ace1.phone, ace2Phone: players.ace2.phone, selectedTier, consent, rulesAccepted: accepted };
      const links = Object.fromEntries(Object.entries(players).filter(([, value]) => value.pprc).map(([key, value]) => [key, value.pprc.id]));
      if (Object.keys(links).length) payload.pprcIds = links;
      for (const [key, value] of Object.entries(players)) payload[key] = { [key === 'captain' ? 'firstName' : 'fullName']: value.name.trim(), singlesUtr: parseUtr(value.singles), doublesUtr: value.doubles.trim() ? parseUtr(value.doubles) : null };
      validateRegistration(payload, settings, config, gap);
      setBusy(true);
      setSuccess(await service.register(payload));
      setPlayers(emptyPlayers()); setWhatsappPhone(''); setConsent(false); setStep(0); id.current = crypto.randomUUID();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (success) return <Success result={success} config={config} onAgain={() => setSuccess(null)} />;

  const tierLocked = t => complete && !assignSelectedTier(combined, config, t.id);
  const goatFallback = selectedTier === 'goat_fallback_rising';
  const fallbackAvailable = !!config.goat?.active && !!config.rising?.active && (!complete || ['goat', 'rising'].includes(highest));
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
              <div className="card-head stacked"><h2>Choose your tier</h2><p className="small">Automatic placement is selected by default: we use your combined UTR to place you in the highest eligible tier. Choose another preference only if you want it. GOAT only never moves to Rising because of team count.</p></div>
              {!settings && <p className="small note">{loadError ? `Registration setup is unavailable: ${loadError}` : 'Opening tournament registration…'}</p>}
              {settings && !active.length && <p className="small note">Registration is currently closed because no tiers are active.</p>}
              <div className="tier-options">
                {active.map(t => (
                  <TierOption key={t.id} value={t.id} tone={tierTone(t.id)} title={t.id === 'goat' ? `${t.name} only` : t.id === 'rising' ? `${t.name} only` : t.name} art={['goat', 'rising'].includes(t.id) ? `/${t.id}-tier.webp` : null}
                    detail={`${formatUtr(t.minCombinedUtr)}–${formatUtr(t.maxCombinedUtr)} combined UTR${t.id === 'goat' ? ' · Never moved to Rising for low team count' : ''}`}
                    eligibility={complete ? tierLocked(t) ? t.id === 'goat' && goatShortfall ? `Need ${formatUtr(goatShortfall)} more combined UTR` : 'Not eligible at your current UTR' : 'Your team is UTR eligible' : 'Enter all three UTRs to check eligibility'}
                    selected={selectedTier === t.id} disabled={tierLocked(t)} onSelect={() => setSelectedTier(t.id)} />
                ))}
                <TierOption value="both" tone="both" title="GOAT + Rising" detail={complete && highest !== 'goat' ? 'Only for teams that qualify for GOAT' : 'Enter both tiers when your team qualifies for GOAT'}
                  selected={selectedTier === 'both'} disabled={!config.goat?.active || !config.rising?.active || (complete && highest !== 'goat')} onSelect={() => setSelectedTier('both')} />
                <TierOption value="higher" tone="higher" title="Automatic placement (recommended)" detail="We use your combined UTR to select the highest eligible tier" selected={selectedTier === 'higher'} disabled={complete && !highest} onSelect={() => setSelectedTier('higher')} />
              </div>
              {config.goat?.active && config.rising?.active && <label className="tier-fallback checkbox"><input type="checkbox" checked={goatFallback} disabled={!fallbackAvailable} onChange={e => setSelectedTier(e.target.checked ? 'goat_fallback_rising' : highest === 'goat' || !complete ? 'goat' : 'rising')} /><span><strong>GOAT preferred; Rising is okay if our UTR does not qualify for GOAT.</strong><small>This enters one tier only. If you qualify for GOAT, you stay in GOAT regardless of team count.</small></span></label>}
            </div>

            {PLAYERS.map((p, i) => (
              <section key={p.key} className={`step-panel card${step === i + 1 ? ' on' : ''}`}>
                <div className="card-head"><h2><span className="player-num">0{i + 1}</span>{p.title}</h2><span className="pill">{p.note}</span></div>
                <Field id={`${p.key}-name`} label={p.label} value={players[p.key].name} onChange={e => { change(p.key, 'name', e.target.value); if (players[p.key].pprc) change(p.key, 'pprc', null); }} required maxLength={p.max} autoComplete={p.autoComplete} placeholder={p.placeholder} />
                <PprcLookup query={players[p.key].name} linked={players[p.key].pprc} onUnlink={() => change(p.key, 'pprc', null)} onPick={found => setPlayers(old => ({ ...old, [p.key]: { ...old[p.key], pprc: found, name: p.key === 'captain' ? found.name.split(' ')[0] : found.name, ...(found.singles ? { singles: found.singles.toFixed(2), doubles: found.doubles ? found.doubles.toFixed(2) : '' } : {}) } }))} />
                {p.key === 'captain' && <Field id="captain-whatsapp" label="Captain WhatsApp number (private)" type="tel" inputMode="tel" autoComplete="tel" placeholder="+15551234567" hint="Include country code. This is visible to the team owner and admin, never on public pages." value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)} required maxLength={25} />}
                {p.key !== 'captain' && <Field id={`${p.key}-whatsapp`} label={`${p.title} WhatsApp number (private)`} type="tel" inputMode="tel" autoComplete="off" placeholder="+15551234567" hint="Include country code. This is visible to the team owner and admin, never on public pages." value={players[p.key].phone} onChange={e => change(p.key, 'phone', e.target.value)} required maxLength={25} />}
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
                <span>I have permission to register these players and publish the captain’s first name and all three UTR values. All three WhatsApp numbers stay private to the team owner and admin. Ace names are public only when the admin turns masking off.</span>
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
            <p className="assignment" role="status">{selectedTier === 'higher' ? 'Automatic placement' : 'Selected preference outcome'}: <strong>{assignedLabel}</strong></p>
          </div>
          <p className="eligibility-summary" role="status"><strong>UTR eligibility:</strong> {complete ? eligibleTiers.length ? eligibleTiers.map(t => t.name).join(' · ') : 'No active tier at this UTR' : 'Enter all three UTRs'}{goatShortfall > 0 && ` · GOAT needs ${formatUtr(goatShortfall)} more`}</p>
          <UtrMeter tiers={active} value={combined} />
          <ul className="preview-players">
            {PLAYERS.map(p => <li key={p.key} className={filled(p.key) ? 'done' : ''}><span>{p.title}</span><b>{players[p.key].name.trim() || '—'}</b><em>{rating(players[p.key], gap).averaged && <small>avg</small>}{formatUtr(rating(players[p.key], gap).value)}</em></li>)}
          </ul>
          <div className="preview-notes">
            <p><strong>Rating rule.</strong> Each player counts at the higher of singles or doubles UTR. If the two are more than {formatUtr(gap)} apart, their average counts instead.</p>
            <p><strong>Privacy.</strong> The captain’s first name and all three UTRs are public. The admin controls whether Ace names are masked.</p>
          </div>
          {blockers.map(text => <Message key={text}>{text}</Message>)}
        </aside>
      </div>
    </section>
  );
}
