import { useState } from 'react';
import { Field, Message } from './UI';
import { formatUtr, orderedTiers, parseUtr } from '../../functions/lib/tournament.js';

const utrText = value => (value == null ? '' : formatUtr(value));
const toUtr = text => (String(text).trim() ? parseUtr(text) : null);

// Edit a team's players and tier choice. Used by the admin (any team) and by a captain (before fixtures).
export function TeamEditForm({ registration, tierConfig, onSave, onCancel }) {
  const r = registration;
  const [form, setForm] = useState({
    captain: r.captain.firstName, captainSingles: utrText(r.captain.singlesUtr), captainDoubles: utrText(r.captain.doublesUtr),
    ace1: r.ace1.fullName, ace1Singles: utrText(r.ace1.singlesUtr), ace1Doubles: utrText(r.ace1.doublesUtr),
    ace2: r.ace2.fullName, ace2Singles: utrText(r.ace2.singlesUtr), ace2Doubles: utrText(r.ace2.doublesUtr),
    selectedTier: r.selectedTier
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = key => e => setForm(old => ({ ...old, [key]: e.target.value }));
  const id = key => `edit-${r.teamId}-${key}`;
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const player = (nameKey, key, nameField) => ({ [nameField]: form[nameKey].trim(), singlesUtr: parseUtr(form[`${key}Singles`]), doublesUtr: toUtr(form[`${key}Doubles`]) });
      await onSave({ teamId: r.teamId, captain: player('captain', 'captain', 'firstName'), ace1: player('ace1', 'ace1', 'fullName'), ace2: player('ace2', 'ace2', 'fullName'), selectedTier: form.selectedTier });
    } catch (e) { setError(e.message); setBusy(false); }
  }
  const rows = [['captain', 'Captain first name'], ['ace1', 'Ace 1 full name'], ['ace2', 'Ace 2 full name']];
  return (
    <form className="team-edit" onSubmit={submit} aria-label={`Edit ${r.captain.firstName}’s team`}>
      <fieldset disabled={busy}>
        {rows.map(([key, label]) => (
          <div className="team-edit-row" key={key}>
            <Field id={id(key)} label={label} value={form[key]} onChange={set(key)} required />
            <Field id={id(`${key}-s`)} label="Singles UTR" type="number" step="0.01" min="0.01" value={form[`${key}Singles`]} onChange={set(`${key}Singles`)} required />
            <Field id={id(`${key}-d`)} label="Doubles UTR" type="number" step="0.01" min="0.01" value={form[`${key}Doubles`]} onChange={set(`${key}Doubles`)} placeholder="Optional" />
          </div>
        ))}
        <div className="field">
          <label htmlFor={id('tier')}>Tier choice</label>
          <select id={id('tier')} value={form.selectedTier} onChange={set('selectedTier')}>
            {orderedTiers(tierConfig || {}, true).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="both">GOAT + Rising</option>
            <option value="goat_fallback_rising">GOAT preferred; Rising fallback</option>
            <option value="higher">Highest eligible tier</option>
          </select>
        </div>
        <Message error>{error}</Message>
        <div className="actions">
          <button className="button small">{busy ? 'Saving…' : 'Save team'}</button>
          <button className="secondary small" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
    </form>
  );
}

// A captain on a new phone or browser enters the captain code shown when the team registered.
export function CaptainClaim({ teamId, service, onClaimed }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await service.claimTeam({ teamId, code }); setCode(''); onClaimed?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <details className="card claim">
      <summary>Captain of this team on a new device?</summary>
      <form onSubmit={submit} className="inline-form">
        <Field id={`claim-${teamId}`} label="Captain code" placeholder="e.g. K7QM-4XPA" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required />
        <button className="button small" disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Claim team'}</button>
      </form>
      <Message error>{error}</Message>
      <p className="small">The captain code was shown once when the team registered. If it’s lost, ask the admin for a new one.</p>
    </details>
  );
}
