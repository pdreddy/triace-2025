import { useCallback, useEffect, useState } from 'react';
import { Field, Message } from './UI';

// Admin → Admins: add more administrators, reset their password, or remove them. The password is shown once and never stored.
export default function AdminUsers({ service, disabled }) {
  const [admins, setAdmins] = useState(null), [name, setName] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [issued, setIssued] = useState(null);
  const load = useCallback(async () => { try { setAdmins((await service.listAdmins()).admins); } catch (e) { setError(e.message); setAdmins([]); } }, [service]);
  useEffect(() => { if (!disabled) load(); }, [disabled, load]);
  async function run(work, done) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await work(); if (done) setMessage(done(result)); await load(); return result; } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const add = async event => {
    event.preventDefault();
    const result = await run(() => service.createAdmin({ username: name }), r => `Admin “${r.username}” created.`);
    if (result) { setIssued({ username: result.username, password: result.password }); setName(''); }
  };
  const reset = async admin => {
    const result = await run(() => service.resetAdminPassword({ uid: admin.uid }), r => `New password made for ${r.username}.`);
    if (result) setIssued({ username: result.username, password: result.password });
  };
  const remove = async admin => {
    if (!window.confirm(`Remove ${admin.username} as an administrator? They are signed out and lose admin access.`)) return;
    await run(() => service.removeAdmin({ uid: admin.uid }), () => `${admin.username} is no longer an admin.`);
  };
  return (
    <section className="card admins-admin pane pane-admins" aria-labelledby="admins-title">
      <h3 id="admins-title">Administrators</h3>
      <p className="small">Everyone here can change settings, dates, results and logins. Share the sign-in name and password privately; they sign in at <b>/admin/login</b>.</p>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      {issued && <div className="issued-login" aria-live="polite"><div className="credential-card" role="group" aria-label={`Login for ${issued.username}`}><p className="eyebrow">Admin login</p><dl><div><dt>Username</dt><dd><output className="mono" aria-label="Admin username">{issued.username}</output></dd></div><div><dt>Password</dt><dd><output className="mono password" aria-label="Admin password">{issued.password}</output></dd></div></dl></div><p className="small">Shown only once. Send it now.</p><button type="button" className="secondary small" onClick={() => setIssued(null)}>Done</button></div>}
      <ul className="admin-list">
        {(admins || []).map(admin => (
          <li key={admin.uid}>
            <span><b>{admin.username || admin.email}</b>{admin.you ? ' (you)' : ''}<small>{admin.lastSignIn ? ` last sign-in ${new Date(admin.lastSignIn).toLocaleDateString()}` : ' never signed in'}</small></span>
            <span className="card-actions">
              {admin.email.endsWith('@traice.local') && <button type="button" className="secondary small" disabled={busy} onClick={() => reset(admin)}>Reset password</button>}
              {!admin.you && <button type="button" className="secondary small danger" disabled={busy} onClick={() => remove(admin)}>Remove</button>}
            </span>
          </li>
        ))}
        {admins === null && <li className="small">Loading…</li>}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <Field id="new-admin" label="New admin’s sign-in name" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={name} disabled={disabled} onChange={e => setName(e.target.value)} hint="3–24 letters, numbers, dot, dash or underscore." />
        <button className="button small" disabled={disabled || busy || name.trim().length < 3}>Add admin</button>
      </form>
    </section>
  );
}
