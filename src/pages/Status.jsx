import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { STATUS_ICON } from '../services/diagnose.js';

// One-click check of the live setup: Firebase project, database rules, sign-in methods and deployed functions.
export default function Status() {
  const { service, user } = useTournament();
  const [items, setItems] = useState([]), [running, setRunning] = useState(false), [copied, setCopied] = useState(false), runId = useRef(0);
  const run = useCallback(async () => {
    if (!service.runChecks) return;
    const id = ++runId.current;
    setItems([]); setRunning(true); setCopied(false);
    await service.runChecks(item => { if (id === runId.current) setItems(old => (old.some(x => x.id === item.id) ? old.map(x => (x.id === item.id ? item : x)) : [...old, item])); });
    if (id === runId.current) setRunning(false);
  }, [service]);
  useEffect(() => { if (!service.loading && !service.setupError) run(); }, [service, run]);

  const failed = items.filter(i => i.status === 'fail'), warned = items.filter(i => i.status === 'warn');
  const report = () => [`Triace setup check · ${new Date().toLocaleString()} · ${location.origin}`, ...items.map(i => `${STATUS_ICON[i.status]} ${i.label}${i.detail ? ` — ${i.detail}` : ''}${i.fix ? `\n    fix: ${i.fix}` : ''}`)].join('\n');
  async function copy() { try { await navigator.clipboard.writeText(report()); setCopied(true); } catch { setCopied(false); } }

  return (
    <section className="page status-screen">
      <header className="page-head">
        <p className="eyebrow">Admin tools</p>
        <h1>Setup <em>check.</em></h1>
        <p>Checks the live Firebase setup: database rules, sign-in methods and deployed functions. It changes nothing.</p>
      </header>
      {service.setupError && <p className="message error" role="alert">{service.setupError}</p>}
      <div className={`status-summary ${running ? 'running' : failed.length ? 'fail' : warned.length ? 'warn' : 'ok'}`} role="status">
        {running ? 'Checking…' : !items.length ? 'Nothing to check.' : failed.length ? `${failed.length} problem${failed.length === 1 ? '' : 's'} to fix` : warned.length ? `Works, with ${warned.length} thing${warned.length === 1 ? '' : 's'} to look at` : 'Everything checked is working'}
      </div>
      <ul className="status-list">
        {items.map(i => (
          <li key={i.id} className={i.status}>
            <b aria-label={i.status}>{STATUS_ICON[i.status]}</b>
            <div><strong>{i.label}</strong>{i.detail && <span>{i.detail}</span>}{i.fix && <em>{i.fix}</em>}</div>
          </li>
        ))}
      </ul>
      <div className="success-actions">
        <button type="button" className="button" disabled={running} onClick={run}>Run again</button>
        <button type="button" className="secondary" disabled={!items.length} onClick={copy}>{copied ? 'Copied' : 'Copy report'}</button>
        <Link className="secondary" to={user?.admin ? '/admin' : '/admin/login'}>{user?.admin ? 'Open Admin' : 'Admin sign in'}</Link>
      </div>
    </section>
  );
}
