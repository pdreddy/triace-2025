export function createDemoService() {
  const authListeners = new Set();
  let authRequest;
  async function request(path, data) {
    const response = await fetch(`/api/${path}`, { credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, method: data ? 'POST' : 'GET', ...(data ? { body: JSON.stringify(data) } : {}) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'The local demo request failed.'); return body;
  }
  function poll(path, callback, error) {
    let stopped = false, timer;
    async function tick() { try { const data = await request(path); if (!stopped) callback(data); } catch (e) { if (!stopped) error(e); } finally { if (!stopped) timer = setTimeout(tick, 600); } }
    tick(); return () => { stopped = true; clearTimeout(timer); };
  }
  async function refreshAuth() {
    // Concurrent subscriptions must not create competing anonymous session cookies.
    authRequest ||= request('session').finally(() => { authRequest = null; });
    const user = await authRequest;
    authListeners.forEach(fn => fn(user));
  }
  return {
    mode: 'Local demo',
    info: { projectId: 'local demo (no Firebase)', root: 'in-memory demo state', season1Path: 'in-memory demo state', emulators: false, demo: true },
    subscribePublic: (callback, error) => poll('public', callback, error),
    async runChecks(report) { report({ id: 'demo', label: 'Demo mode', status: 'ok', detail: 'This is the local demo: there is no Firebase to check. Open this page on the live site.' }); },
    subscribeConnection(callback) { callback(true); return () => {}; },
    subscribeAuth(callback, error) { authListeners.add(callback); refreshAuth().catch(error); return () => authListeners.delete(callback); },
    // Singles Ladder on the local demo server (same engine as the Cloud Function). ladderDemo exists only here.
    subscribeLadder: (path, callback, error = () => {}) => poll(`ladder?path=${encodeURIComponent(path)}`, callback, error),
    ladderAction: payload => request('ladder-action', payload),
    ladderDemo: { seed: () => request('ladder-demo-seed', {}), async loginAs(playerId) { await request('ladder-demo-login', { playerId }); await refreshAuth(); } },
    subscribePrivate: (callback, error) => poll('registrations', callback, error),
    getMyRegistration: teamId => request(`my-registration?teamId=${encodeURIComponent(teamId)}`),
    subscribeMyTeams: (uid, callback) => poll('my-teams', callback, () => callback({})),
    async login(username, password) { await request('login', { username, password }); await refreshAuth(); },
    async logout() { await request('logout', {}); await refreshAuth(); },
    register: payload => request('register', payload),
    saveConfiguration: payload => request('configuration', payload),
    recalculate: () => request('recalculate', {}),
    generateFixtures: payload => request('generate-fixtures', payload),
    generatePlayoffs: payload => request('generate-playoffs', payload),
    createPartnerPost: payload => request('partner-post', payload),
    expressInterest: payload => request('partner-interest', payload),
    closePartnerPost: payload => request('partner-close', payload),
    markPartnerPicked: payload => request('partner-picked', payload),
    reopenPartnerPost: payload => request('partner-reopen', payload),
    subscribeMyPartnerPosts: (uid, callback) => poll('partner-mine', callback, () => callback({})),
    backupNow: () => request('backup-now', {}),
    saveCalendar: payload => request('calendar', payload),
    autoSchedule: payload => request('auto-schedule', payload),
    addBufferWeeks: payload => request('add-buffer', payload),
    listAdmins: () => request('admins', {}),
    createAdmin: payload => request('admin-create', payload),
    resetAdminPassword: payload => request('admin-reset', payload),
    removeAdmin: payload => request('admin-remove', payload),
    saveEarlyBird: payload => request('early-bird', payload),
    saveLeagueRules: payload => request('league-rules', payload),
    setSchedule: payload => request('set-schedule', payload),
    moveFixture: payload => request('move-fixture', payload),
    issueChallenge: payload => request('issue-challenge', payload),
    updateTeam: payload => request('update-team', payload),
    linkPprc: payload => request('link-pprc', payload),
    syncPprcUtr: payload => request('sync-pprc-utr', payload),
    withdrawTeam: payload => request('withdraw-team', payload),
    resetCaptainLogin: payload => request('reset-captain-login', payload),
    async captainLogin(username, password) { await request('captain-login', { username, password }); await refreshAuth(); },
    importSeason1: season => request('import-season1', { season }),
    manageSeason: payload => request('season', payload),
    submitResult: payload => request('submit-result', payload),
    reviewResult: payload => request('review-result', payload)
  };
}
