import { PPRC_VERIFIED_AFTER } from '../../functions/lib/tournament.js';

// The first thing an admin sees: where the tournament stands and what needs attention, with a button for each.
export default function AdminOverview({ data, teams, loading, tiers, go, busy, onExport, onBackup }) {
  const list = Object.values(teams || {}), settings = data?.settings, capacity = data?.leagueRules?.tierCapacity;
  const links = list.flatMap(t => Object.values(t.pprcLinks || {}));
  const awaiting = Object.values(data?.fixtures || {}).flatMap(tier => Object.values(tier || {})).filter(f => f.status === 'submitted').length;
  const waitlisted = tiers.reduce((n, t) => n + Object.keys(data?.tiers?.[t.id]?.waitlist || {}).length, 0);
  const players = list.length * 3, verified = links.filter(l => l.matches > PPRC_VERIFIED_AFTER).length;
  const noLogin = list.filter(t => !t.captainUsername).length;
  const thinTiers = tiers.filter(t => t.active && Object.keys(data?.tiers?.[t.id]?.teams || {}).length === 1).length;
  const attention = [
    { count: awaiting, text: awaiting === 1 ? 'score waiting for your approval' : 'scores waiting for your approval', tab: 'league', action: 'Review' },
    { count: players - links.length, text: 'players not linked to PPRC yet', tab: 'pprc', action: 'Link them', show: list.length > 0 },
    { count: noLogin, text: noLogin === 1 ? 'team without a captain login' : 'teams without a captain login', tab: 'teams', action: 'Reset logins' },
    { count: waitlisted, text: waitlisted === 1 ? 'team on a waitlist' : 'teams on a waitlist', tab: 'setup', action: 'Raise the limit' },
    { count: thinTiers, text: thinTiers === 1 ? 'tier with only one team' : 'tiers with only one team', tab: 'teams', action: 'See teams' }
  ].filter(item => item.count > 0 && item.show !== false);

  return (
    <div className="overview pane pane-overview" data-testid="admin-overview">
      <div className="overview-grid">
        <section className="card overview-card">
          <h3>Registration</h3>
          <p className={`big ${settings?.registrationEnabled ? 'good' : 'warn'}`}>{settings ? (settings.registrationEnabled ? 'Open' : 'Closed') : '—'}</p>
          <p className="small">Ace names are {settings ? (settings.aceNameMaskingEnabled ? 'hidden' : 'public') : '—'} on public pages.</p>
          <button type="button" className="text-link" onClick={() => go('setup')}>Change in Setup →</button>
        </section>
        <section className="card overview-card">
          <h3>Teams</h3>
          <p className="big">{loading ? '…' : list.length}</p>
          <ul className="tier-counts">
            {tiers.filter(t => t.active).map(t => { const n = Object.keys(data?.tiers?.[t.id]?.teams || {}).length; return <li key={t.id}><span>{t.name}</span><b>{n}{capacity ? ` / ${capacity}` : ''}</b></li>; })}
          </ul>
          <button type="button" className="text-link" onClick={() => go('teams')}>Open Teams →</button>
        </section>
        <section className="card overview-card">
          <h3>PPRC</h3>
          <p className="big">{links.length}<small> / {players} linked</small></p>
          <p className="small">{verified} verified (more than {PPRC_VERIFIED_AFTER} rated matches).</p>
          <button type="button" className="text-link" onClick={() => go('pprc')}>Open PPRC players →</button>
        </section>
      </div>

      <section className="card overview-attention">
        <h3>Needs your attention</h3>
        {attention.length === 0
          ? <p className="small">Nothing needs attention right now.</p>
          : <ul>{attention.map(item => <li key={item.text}><b>{item.count}</b><span>{item.text}</span><button type="button" className="secondary small" onClick={() => go(item.tab)}>{item.action}</button></li>)}</ul>}
      </section>

      <section className="card overview-actions">
        <h3>Quick actions</h3>
        <div className="card-actions">
          <button type="button" className="secondary small" disabled={loading || !list.length} onClick={onExport}>Export registrations (CSV) ↓</button>
          <button type="button" className="secondary small" disabled={busy} onClick={onBackup}>Back up now (cloud)</button>
          <button type="button" className="secondary small" onClick={() => go('calendar')}>Dates &amp; schedule</button>
          <button type="button" className="secondary small" onClick={() => go('league')}>League &amp; results</button>
        </div>
      </section>
    </div>
  );
}
