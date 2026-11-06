import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTournament, useRegistrations } from '../hooks/useTournament';
import { Field, Message, TeamCard, Stat } from '../components/UI';
import { Icon } from '../components/Icons';
import { FixtureCard, teamIndex } from '../components/League';
import { LeagueRulesCard, PlayoffPlanner, ScheduleForm, SeasonCard } from '../components/AdminLeague';
import { TeamEditForm } from '../components/TeamTools';
import FirebasePanel from '../components/FirebasePanel';
import EarlyBirdAdmin from '../components/EarlyBirdAdmin';
import AdminCalendar from '../components/AdminCalendar';
import AdminUsers from '../components/AdminUsers';
import LoginCard from '../components/LoginCard';
import { DEFAULT_SETTINGS, DEFAULT_TIERS, orderedTiers, parseUtr, validateSettings, validateTierConfig, registrationsCsv } from '../../functions/lib/tournament.js';

const SECTIONS = [
  { id: 'settings', label: 'Registration & privacy', short: 'Settings', icon: 'shield' },
  { id: 'tiers', label: 'Tier configuration', short: 'Tiers', icon: 'trophy' },
  { id: 'teams', label: 'Private registrations', short: 'Teams', icon: 'register' },
  { id: 'calendar', label: 'Dates & schedule', short: 'Dates', icon: 'calendar' },
  { id: 'league', label: 'League & results', short: 'League', icon: 'calendar' },
  { id: 'admins', label: 'Administrators', short: 'Admins', icon: 'shield' }
];
const draftFrom = data => ({
  settings: { ...(data?.settings || DEFAULT_SETTINGS) },
  tierConfig: structuredClone(data?.settings ? data.tierConfig || {} : DEFAULT_TIERS),
  expectedRevision: data?.configRevision || 0
});
const listedIn = team => team.listedTiers || [team.assignedTier || 'unassigned'];
const toUtr = value => { try { return parseUtr(value); } catch { return 0; } };

function SectionTitle({ id, num, children }) {
  return <h2 className={`section-title pane pane-${id}`} id={`admin-${id}`}><span>{num}</span>{children}</h2>;
}

export default function Admin() {
  const { data, user, service, connected } = useTournament();
  const { teams, loading, error: readError } = useRegistrations();
  const [draft, setDraft] = useState(() => draftFrom(data)), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [summary, setSummary] = useState(null);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [reveal, setReveal] = useState(true), [issued, setIssued] = useState(null), [captainOnly, setCaptainOnlyState] = useState(() => localStorage.getItem('traice.admin.captainOnly') === '1'), [newId, setNewId] = useState(''), [tab, setTab] = useState('settings'), [editing, setEditing] = useState(null);

  useEffect(() => {
    if (data && !dirty && (data.configRevision || 0) >= draft.expectedRevision) setDraft(draftFrom(data));
  }, [data, dirty, draft.expectedRevision]);

  if (!user) return <Message>Checking administrator access…</Message>;
  if (!user.admin) return <Navigate to="/admin/login" replace />;

  function editSettings(key, value) { setDraft(old => ({ ...old, settings: { ...old.settings, [key]: value } })); setDirty(true); }
  function editTier(id, key, value) { setDraft(old => ({ ...old, tierConfig: { ...old.tierConfig, [id]: { ...old.tierConfig[id], [key]: value } } })); setDirty(true); }
  async function action(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function save(event) {
    event.preventDefault();
    return action(async () => {
      validateSettings(draft.settings); validateTierConfig(draft.tierConfig);
      const result = await service.saveConfiguration(draft);
      setDraft(old => ({ ...old, expectedRevision: result.configRevision })); setDirty(false);
      setMessage('Rules saved. Public name visibility updates immediately; recalculate tiers if ranges changed.');
    });
  }
  function setCaptainOnly(value) { setCaptainOnlyState(value); localStorage.setItem('traice.admin.captainOnly', value ? '1' : '0'); }
  function reload() { setDraft(draftFrom(data)); setDirty(false); setError(''); }
  function recalculate() {
    return action(async () => { setSummary(await service.recalculate()); setMessage('Tier recalculation completed.'); });
  }
  function addTier() {
    setError('');
    const id = newId.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id) || ['higher', 'both', 'goat_fallback_rising', 'constructor', 'prototype'].includes(id) || Object.hasOwn(draft.tierConfig, id)) { setError('Choose a unique lowercase tier ID, starting with a letter.'); return; }
    const sortOrder = Math.max(0, ...Object.values(draft.tierConfig).map(t => t.sortOrder)) + 1;
    setDraft(old => ({ ...old, tierConfig: { ...old.tierConfig, [id]: { name: 'New Tier', minCombinedUtr: 1, maxCombinedUtr: 4950, sortOrder, active: false } } }));
    setDirty(true); setNewId('');
  }
  function removeTier(id) {
    if (Object.values(teams).some(team => (team.listedTiers || [team.assignedTier]).includes(id))) { setError('This tier still has teams. Deactivate it, save, and recalculate before removing it.'); return; }
    setDraft(old => { const tierConfig = { ...old.tierConfig }; delete tierConfig[id]; return { ...old, tierConfig }; });
    setDirty(true);
  }
  const saveSchedule = schedule => attempt(async () => { await service.setSchedule(schedule); setMessage('Match dates saved. Every round now has a deadline.'); });
  const saveTeam = async payload => { await service.updateTeam(payload); setEditing(null); setMessage('Team updated.'); };
  function withdraw(team) {
    if (!window.confirm(`Withdraw ${team.captain.firstName}’s team? Its unplayed fixtures are removed and its results stop counting.`)) return;
    return action(async () => { const r = await service.withdrawTeam({ teamId: team.teamId }); setMessage(`${team.captain.firstName}’s team withdrawn${r.removedFixtures ? `; ${r.removedFixtures} unplayed fixtures removed` : ''}.`); });
  }
  function resetLogin(team) {
    if (!window.confirm(`Reset the login for ${team.captain.firstName}’s team? A new password is created, the old one stops working, and the captain is signed out on every device.`)) return;
    return action(async () => { const r = await service.resetCaptainLogin({ teamId: team.teamId }); setIssued({ teamId: team.teamId, label: `${team.captain.firstName}’s team`, login: { username: r.username, password: r.password } }); });
  }
  function generateFixtures(tier) {
    const existing = Object.values(data?.fixtures?.[tier.id] || {});
    const replace = existing.some(f => f.status !== 'scheduled');
    if (existing.length && !window.confirm(replace ? `Replace the ${tier.name} schedule? All of its submitted and final results will be deleted.` : `Create a new ${tier.name} schedule? The current fixtures will be replaced.`)) return;
    return action(async () => { const result = await service.generateFixtures({ tierId: tier.id, replace }); setMessage(`${tier.name}: ${result.fixtures} fixtures over ${result.rounds} rounds created.`); });
  }
  // Like action(), but reports whether it succeeded so a form can keep or clear its draft.
  async function attempt(fn) { let ok = false; await action(async () => { await fn(); ok = true; }); return ok; }
  function createPlayoffs(tier, seeds, hasResults) {
    if (hasResults && !window.confirm(`Replace the ${tier.name} playoffs? Their results will be deleted.`)) return;
    return attempt(async () => { await service.generatePlayoffs({ tierId: tier.id, seeds }); setMessage(`${tier.name} playoffs created.`); });
  }
  const saveRules = rules => attempt(async () => { await service.saveLeagueRules(rules); setMessage('League rules saved. Rules cards, standings and playoffs now use them.'); });
  const renameSeason = name => attempt(async () => { await service.manageSeason({ action: 'rename', name }); setMessage('Season renamed.'); });
  const archiveSeason = (name, confirm) => attempt(async () => { await service.manageSeason({ action: 'archive', name, confirm }); setMessage(`Season saved to the history. ${name} has started; registration is open to new teams.`); });
  function review(tierId, fixtureId, approve) {
    return action(async () => { await service.reviewResult({ tierId, fixtureId, approve }); setMessage(approve ? 'Result approved. Standings are updated.' : 'Submission rejected. The captains can submit again.'); });
  }
  function exportCsv() {
    const blob = new Blob(['﻿' + registrationsCsv(teams, data?.tierConfig || {}, { captainOnly })], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `traice-registrations-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const q = query.toLowerCase().trim();
  const filtered = Object.values(teams).filter(t => (filter === 'all' || listedIn(t).includes(filter)) && (captainOnly ? [t.teamId, t.captain.firstName] : [t.teamId, t.captain.firstName, t.ace1.fullName, t.ace2.fullName]).some(v => v.toLowerCase().includes(q)));
  const liveTiers = orderedTiers(data?.tierConfig || {});
  const groups = [...liveTiers.map(t => ({ id: t.id, name: t.name })), { id: 'unassigned', name: 'Unassigned' }];
  const tally = id => Object.values(teams).filter(t => listedIn(t).includes(id)).length;
  const live = data?.settings, total = Object.keys(teams).length;
  const masked = (live?.aceNameMaskingEnabled ?? true) && !reveal;

  return (
    <section className="page admin" data-tab={tab}>
      <header className="page-head with-actions">
        <div>
          <p className="eyebrow">Tournament control</p>
          <h1>Your <em>dashboard.</em></h1>
          <p>Configure the tournament, review private registrations, and keep the lineup current.</p>
        </div>
        <Link to="/tiers" className="secondary">View public lineup ↗</Link>
      </header>

      <div className="stat-row">
        <Stat value={loading ? '…' : total} label="Registrations" tone="accent" />
        {liveTiers.slice(0, 2).map(t => <Stat key={t.id} value={loading ? '…' : tally(t.id)} label={t.name} />)}
        <Stat value={live ? (live.registrationEnabled ? 'Open' : 'Closed') : '—'} label="Registration" tone={live?.registrationEnabled ? 'good' : 'warn'} />
        <Stat value={live ? (live.aceNameMaskingEnabled ? 'On' : 'Off') : '—'} label="Ace-name masking" />
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Dashboard sections">
        {SECTIONS.map(s => <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)}>{s.short}</button>)}
      </div>

      <div className="admin-save-bar">
        <span><i className={`dot ${dirty ? 'warn' : 'good'}`} aria-hidden="true" />{dirty ? 'Unsaved rule changes' : 'Rules are up to date'}</span>
        <button className="button small" type="submit" form="tournament-configuration" disabled={busy || !connected || !data || !dirty}>{busy ? 'Saving…' : 'Save rule changes ↗'}</button>
      </div>
      <Message error>{error || readError}</Message>
      <Message>{message}</Message>
      {issued && (
        <section className="card issued-login" aria-live="polite">
          <LoginCard login={issued.login} teamLabel={issued.label} title={`New login for ${issued.label}`} />
          <p className="small">Send this to the captain now. It is shown only once and is gone when you close it.</p>
          <button type="button" className="secondary small" onClick={() => setIssued(null)}>Done, I’ve sent it</button>
        </section>
      )}

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Dashboard sections">
          {SECTIONS.map(s => <a key={s.id} href={`#admin-${s.id}`}><Icon name={s.icon} size={18} />{s.label}</a>)}
        </nav>

        <div className="admin-body">
          <form id="tournament-configuration" onSubmit={save} aria-label="Tournament configuration">
            <fieldset disabled={busy || !connected || !data}>
              <SectionTitle id="settings" num="01">Registration &amp; privacy</SectionTitle>
              <div className="card pane pane-settings">
                <label className="checkbox"><input type="checkbox" checked={draft.settings.registrationEnabled} onChange={e => editSettings('registrationEnabled', e.target.checked)} /><span>Registration enabled</span></label>
                <label className="checkbox"><input type="checkbox" checked={draft.settings.aceNameMaskingEnabled} onChange={e => editSettings('aceNameMaskingEnabled', e.target.checked)} /><span>Ace-name masking enabled</span></label>
                <p className="small note">When enabled, Ace names are hidden on public lists. Turn it off and save to publish both names immediately; turn it on and save to hide them again. Registrations made before the current name-publication consent stay masked.</p>
                <div className="ratings">
                  <Field id="individual-min" label="Minimum individual UTR" type="number" min="0.01" max="16.5" step="0.01" required value={draft.settings.minPlayerUtr / 100 || ''} onChange={e => editSettings('minPlayerUtr', toUtr(e.target.value))} />
                  <Field id="individual-max" label="Maximum individual UTR" type="number" min="0.01" max="16.5" step="0.01" required value={draft.settings.maxPlayerUtr / 100 || ''} onChange={e => editSettings('maxPlayerUtr', toUtr(e.target.value))} />
                </div>
              </div>

              <SectionTitle id="tiers" num="02">Tier configuration</SectionTitle>
              <p className="small note pane pane-tiers">Order 1 is highest. A team qualifying for a higher tier may choose any lower active tier. Deactivate a tier and recalculate before removing a tier with teams.</p>
              <div className="tier-editors pane pane-tiers">
                {orderedTiers(draft.tierConfig).map(tier => (
                  <section className="card" key={tier.id}>
                    <div className="card-head"><h3>Tier: {tier.id}</h3><button className="danger" type="button" onClick={() => removeTier(tier.id)}>Remove {tier.id}</button></div>
                    <Field id={`${tier.id}-name`} label="Tier name" value={tier.name} maxLength="50" required onChange={e => editTier(tier.id, 'name', e.target.value)} />
                    <div className="ratings">
                      <Field id={`${tier.id}-min`} label="Minimum combined UTR" type="number" min="0.01" max="49.5" step="0.01" required value={tier.minCombinedUtr / 100 || ''} onChange={e => editTier(tier.id, 'minCombinedUtr', toUtr(e.target.value))} />
                      <Field id={`${tier.id}-max`} label="Maximum combined UTR" type="number" min="0.01" max="49.5" step="0.01" required value={tier.maxCombinedUtr / 100 || ''} onChange={e => editTier(tier.id, 'maxCombinedUtr', toUtr(e.target.value))} />
                    </div>
                    <Field id={`${tier.id}-order`} label="Priority order (1 = highest)" type="number" min="1" max="999" required value={tier.sortOrder || ''} onChange={e => editTier(tier.id, 'sortOrder', Number(e.target.value))} />
                    <label className="checkbox"><input type="checkbox" checked={tier.active} onChange={e => editTier(tier.id, 'active', e.target.checked)} /><span>{tier.id} active</span></label>
                  </section>
                ))}
              </div>
              <div className="add-tier pane pane-tiers">
                <Field id="new-tier-id" label="New tier ID" placeholder="e.g. premier" value={newId} onChange={e => setNewId(e.target.value)} />
                <button className="secondary" type="button" disabled={Object.keys(draft.tierConfig).length >= 20} onClick={addTier}>Add tier +</button>
              </div>

              {dirty && data?.configRevision !== draft.expectedRevision && <Message error>Another admin updated the configuration. Reload before saving.</Message>}
              <div className="actions pane pane-settings pane-tiers">
                <button className="button" type="submit">{busy ? 'Saving…' : 'Save configuration ↗'}</button>
                <button className="secondary" type="button" onClick={reload}>Reload saved settings</button>
              </div>
            </fieldset>
          </form>

          <EarlyBirdAdmin service={service} saved={data?.earlyBird} disabled={busy || !connected || !data} />

          <section className="recalculate pane pane-tiers">
            <div>
              <h3>Keep every team in the right tier.</h3>
              <p>Rebuilds the public tier list from private registrations, removes old entries, and updates assigned tiers in one atomic operation. Teams outside all active ranges become unassigned.</p>
            </div>
            <button className="button" disabled={busy || dirty || !connected || !live} onClick={recalculate}>Recalculate Tiers ↻</button>
          </section>
          {dirty && <p className="small note pane pane-tiers">Save or reload your configuration changes before recalculating.</p>}
          {summary && <div className="stats pane pane-tiers" role="status">{Object.entries(summary).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key}</span></div>)}</div>}

          <SectionTitle id="teams" num="03">Private registrations</SectionTitle>
          <div className="admin-tools pane pane-teams">
            <Field id="search" label="Search registrations" placeholder="Captain, Ace name, or registration ID" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="field">
              <label htmlFor="admin-tier-filter">Assigned tier</label>
              <select id="admin-tier-filter" value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">All tiers</option>
                {groups.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button className="secondary" disabled={loading || !!readError} onClick={exportCsv}>Export private CSV ↓</button>
          </div>
          <label className="checkbox pane pane-teams"><input type="checkbox" checked={captainOnly} onChange={e => setCaptainOnly(e.target.checked)} /><span>Captain only: hide the other players (cards, search and export)</span></label>
          <label className="checkbox pane pane-teams"><input type="checkbox" checked={reveal} disabled={captainOnly} onChange={e => setReveal(e.target.checked)} /><span>Reveal Ace names in admin cards</span></label>
          <p className="small note pane pane-teams">{filtered.length} of {total} registrations. Exports include all registrations{captainOnly ? ' (captains only)' : ' and private names'}, regardless of the current filter.</p>
          {loading && <Message>Loading private registrations…</Message>}
          {!loading && !filtered.length && <Message>No registrations match.</Message>}
          {groups.map(group => {
            const list = filtered.filter(t => listedIn(t).includes(group.id));
            if (!list.length) return null;
            return (
              <section className="tier-group pane pane-teams" key={group.id}>
                <div className="tier-head"><div><h2>{group.name}</h2><span>{list.length} {list.length === 1 ? 'team' : 'teams'}</span></div></div>
                <div className="team-list">{list.map(team => editing === team.teamId
                  ? <TeamEditForm key={team.teamId} registration={team} tierConfig={data?.tierConfig} onSave={saveTeam} onCancel={() => setEditing(null)} />
                  : (
                    <div className="team-admin" key={team.teamId}>
                      <TeamCard team={team} tierName={group.name} tierId={group.id} privateView masked={masked} captainOnly={captainOnly} />
                      <div className="card-actions">
                        <button type="button" className="secondary small" disabled={busy} onClick={() => setEditing(team.teamId)}>Edit</button>
                        <button type="button" className="secondary small" disabled={busy} onClick={() => resetLogin(team)}>Reset login</button>
                        <button type="button" className="danger" disabled={busy} onClick={() => withdraw(team)}>Withdraw</button>
                      </div>
                    </div>
                  ))}</div>
              </section>
            );
          })}

          <SectionTitle id="calendar" num="04">Dates &amp; schedule</SectionTitle>
          <AdminCalendar service={service} saved={data?.calendar} tiers={liveTiers.map(t => ({ id: t.id, name: t.name, teams: Object.keys(data?.tiers?.[t.id]?.teams || {}).length }))} disabled={busy || !connected || !data?.settings} />

          <SectionTitle id="league" num="05">League &amp; results</SectionTitle>
          <p className="small note pane pane-league">Every league rule is set here. Create each tier’s round-robin schedule once its teams are final, then map the playoffs. Captains submit scores from the League page; they count once you approve them. You can also enter or correct any result there.</p>
          <div className="league-admin pane pane-league">
            <LeagueRulesCard rules={data?.leagueRules} busy={busy || !connected || !data?.settings} onSave={saveRules} />
            {data?.season && <SeasonCard season={data.season} seasons={data.seasons} busy={busy || !connected || !data?.settings} onRename={renameSeason} onArchive={archiveSeason} />}
            {liveTiers.map(tier => {
              const fixtures = Object.values(data?.fixtures?.[tier.id] || {}), teamCount = Object.keys(data?.tiers?.[tier.id]?.teams || {}).length;
              const pending = fixtures.filter(f => f.status === 'submitted'), finals = fixtures.filter(f => f.status === 'final').length;
              return (
                <section className="card" key={tier.id}>
                  <div className="card-head">
                    <h3>{tier.name}</h3>
                    <div className="card-actions">
                      <button className="secondary small" type="button" disabled={busy || teamCount < 2} onClick={() => generateFixtures(tier)}>{fixtures.some(f => !f.stage) ? 'Regenerate fixtures' : 'Generate fixtures'}</button>
                    </div>
                  </div>
                  <p className="small">{teamCount} teams · {fixtures.length} fixtures · {finals} final · {pending.length} awaiting approval{teamCount < 2 ? ' · needs at least 2 teams' : ''}</p>
                  {pending.length > 0 && <div className="fixture-list">{pending.map(f => <FixtureCard key={f.id} fixture={f} teams={teamIndex(data)} onReview={approve => review(tier.id, f.id, approve)} />)}</div>}
                  {teamCount >= 2 && <ScheduleForm tier={tier} schedule={data?.schedules?.[tier.id]} busy={busy} onSave={saveSchedule} />}
                  <PlayoffPlanner tier={tier} data={data} rules={data?.leagueRules} busy={busy} onCreate={(seeds, hasResults) => createPlayoffs(tier, seeds, hasResults)} />
                </section>
              );
            })}
            <Link className="secondary" to="/league">Open the League page ↗</Link>
          </div>

          <SectionTitle id="admins" num="06">Administrators</SectionTitle>
          <AdminUsers service={service} disabled={busy || !connected || !data?.settings} />
        </div>
      </div>
      <FirebasePanel service={service} data={data} />
    </section>
  );
}
