import { useEffect, useState } from 'react';
import { Field, Message } from './UI';
import { DEFAULT_EARLY_BIRD, earlyBirdStatus, validateEarlyBird } from '../config/earlyBird.js';

// Admin → Early-bird registration: turn it on or off, set the dates and the late surcharge. Saved to the database, so no rebuild is needed.
export default function EarlyBirdAdmin({ service, saved, disabled }) {
  const plan = { ...DEFAULT_EARLY_BIRD, ...(saved || {}) };
  const [draft, setDraft] = useState({ ...plan, surchargeUsd: String(plan.surchargeUsd) }), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { if (!dirty) setDraft({ ...plan, surchargeUsd: String(plan.surchargeUsd) }); }, [saved, dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); setMessage(''); setError(''); };
  const candidate = { enabled: draft.enabled, opens: draft.opens, ends: draft.ends, surchargeUsd: draft.surchargeUsd.trim() === '' ? NaN : Number(draft.surchargeUsd) };
  let problem = '', preview = null;
  try { preview = earlyBirdStatus(validateEarlyBird(candidate)); } catch (e) { problem = e.message; }

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { await service.saveEarlyBird(validateEarlyBird(candidate)); setDirty(false); setMessage('Early-bird settings saved. Every page updates right away.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="card early-admin pane pane-settings" aria-labelledby="early-title">
      <h3 id="early-title">Early-bird registration</h3>
      <p className="small">Shown on the rules page, the registration page and a bar across the top of every page. Changes apply immediately; no rebuild or deploy.</p>
      <label className="checkbox"><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={e => edit('enabled', e.target.checked)} /><span>Show the early bird to visitors</span></label>
      <div className="ratings">
        <Field id="early-opens" label="Early bird opens" type="date" value={draft.opens} disabled={disabled} onChange={e => edit('opens', e.target.value)} />
        <Field id="early-ends" label="Last early-bird day" type="date" value={draft.ends} disabled={disabled} onChange={e => edit('ends', e.target.value)} hint="From the next day, the late fee applies." />
        <Field id="early-surcharge" label="Late fee (US$ more)" type="number" min="0" max="1000" step="1" value={draft.surchargeUsd} disabled={disabled} onChange={e => edit('surchargeUsd', e.target.value)} />
      </div>
      {preview && preview.phase !== 'off' && <p className="early-preview"><b>Visitors will see:</b> {preview.headline}. {preview.detail}</p>}
      {preview && preview.phase === 'off' && <p className="early-preview">Early bird is off: nothing is shown to visitors.</p>}
      <Message error>{problem && dirty ? problem : error}</Message>
      <Message>{message}</Message>
      <div className="card-actions">
        <button type="button" className="button" disabled={disabled || busy || !dirty || !!problem} onClick={save}>{busy ? 'Saving…' : 'Save early-bird settings'}</button>
      </div>
    </section>
  );
}
