import { useState } from 'react';
import { useRevisionedDraft } from '../hooks/useRevisionedDraft';
import { Field, Message } from './UI';
import { DEFAULT_EARLY_BIRD, earlyBirdStatus, validateEarlyBird } from '../config/earlyBird.js';

// Admin → Early-bird registration: turn it on or off, set the dates and the late surcharge. Saved to the database, so no rebuild is needed.
const toDraft = saved => { const { revision, ...plan } = { ...DEFAULT_EARLY_BIRD, ...(saved || {}) }; return { ...plan, surchargeUsd: String(plan.surchargeUsd) }; };

export default function EarlyBirdAdmin({ service, saved, disabled: off, unavailable = false }) {
  const disabled = off || unavailable;
  const { draft, dirty, conflict, expectedRevision, edit: change, markSaved, reload } = useRevisionedDraft(saved, toDraft);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const edit = (key, value) => { change(key, value); setMessage(''); setError(''); };
  const candidate = { enabled: draft.enabled, opens: draft.opens, ends: draft.ends, surchargeUsd: draft.surchargeUsd.trim() === '' ? NaN : Number(draft.surchargeUsd) };
  let problem = '', preview = null;
  try { preview = earlyBirdStatus(validateEarlyBird(candidate)); } catch (e) { problem = e.message; }

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await service.saveEarlyBird({ ...validateEarlyBird(candidate), expectedRevision }); markSaved(result?.revision); setMessage('Early-bird settings saved. Every page updates right away.'); }
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
      {unavailable && <Message error>The saved early-bird settings could not be read, so saving is turned off. Check the connection and reload.</Message>}
      {conflict && <Message error>Another admin saved these settings while you were editing. <button type="button" className="text-link" onClick={reload}>Discard my changes and reload</button></Message>}
      <Message error>{problem && dirty ? problem : error}</Message>
      <Message>{message}</Message>
      <div className="card-actions">
        <button type="button" className="button" disabled={disabled || busy || !dirty || !!problem || conflict} onClick={save}>{busy ? 'Saving…' : 'Save early-bird settings'}</button>
      </div>
    </section>
  );
}
