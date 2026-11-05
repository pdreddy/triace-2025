import { useState } from 'react';
import { Message } from './UI';
import { bundledSeason1, season1Source } from '../data/seasons.js';

const host = url => { try { return new URL(url).host; } catch { return url || '—'; } };
const Row = ({ label, children }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

// Admin → Firebase: which project and database paths the app uses, and where Season 1 comes from.
export default function FirebasePanel({ service, data }) {
  const info = service.info || {}, source = season1Source(data), live = data?.legacySeasons?.s1;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const matches = s => Object.values(s?.fixtures || {}).reduce((n, tier) => n + Object.keys(tier || {}).length, 0);

  async function importSeason1() {
    if (source === 'firebase' && !window.confirm(`Season 1 already exists at ${info.season1Path}. Replace it with the bundled copy?`)) return;
    setBusy(true); setError(''); setMessage('');
    try { const result = await service.importSeason1(bundledSeason1()); setMessage(`Season 1 saved to ${result.path}. It now loads from the database.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <section className="card firebase-panel" id="admin-firebase" aria-labelledby="firebase-title">
      <h2 id="firebase-title">Firebase &amp; data paths</h2>
      <p className="small">Season 2 (the live tournament and its closed seasons) and Season 1 (the legacy season) are read from the same Firebase project. Paths are set at build time; change them in <code>.env.local</code> (<code>VITE_DB_ROOT</code>, <code>VITE_DB_SEASON1_PATH</code>) and in <code>functions/.env</code> (<code>TRAICE_DB_ROOT</code>, <code>TRAICE_DB_SEASON1_PATH</code>), then rebuild and redeploy.</p>
      <dl className="kv">
        <Row label="Mode">{service.mode}{info.emulators ? ' (local emulators)' : ''}</Row>
        <Row label="Project">{info.projectId || '—'}</Row>
        {info.databaseURL && <Row label="Database">{host(info.databaseURL)}</Row>}
        {info.authDomain && <Row label="Auth domain">{info.authDomain}</Row>}
        <Row label="Season 2 path (live + closed seasons)"><code>{info.root || '—'}</code></Row>
        <Row label="Season 1 path"><code>{info.season1Path || '—'}</code></Row>
        <Row label="Season 1 source">{source === 'firebase' ? `Firebase · ${matches(live)} matches` : `Bundled snapshot · ${matches(bundledSeason1())} matches (not in Firebase yet)`}</Row>
      </dl>
      <div className="card-actions">
        <button className="secondary" type="button" disabled={busy} onClick={importSeason1}>{busy ? 'Saving…' : source === 'firebase' ? 'Replace Season 1 in Firebase' : 'Copy Season 1 into Firebase'}</button>
      </div>
      <Message error>{error}</Message>
      <Message>{message}</Message>
      {!info.demo && <p className="small">Changed a path? Run <code>npm run rules:generate</code> then <code>npm run rules:deploy</code> so the database rules cover it, and keep the web and functions values equal. The Season 1 import only ever replaces a previous Season 1 import, never other data.</p>}
    </section>
  );
}
