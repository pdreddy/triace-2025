export function createDemoService() {
  const authListeners = new Set();
  async function request(path, data) {
    const response = await fetch(`/api/${path}`, { credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, method: data ? 'POST' : 'GET', ...(data ? { body: JSON.stringify(data) } : {}) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'The local demo request failed.'); return body;
  }
  function poll(path, callback, error) {
    let stopped = false, timer;
    async function tick() { try { const data = await request(path); if (!stopped) callback(data); } catch (e) { if (!stopped) error(e); } finally { if (!stopped) timer = setTimeout(tick, 600); } }
    tick(); return () => { stopped = true; clearTimeout(timer); };
  }
  async function refreshAuth() { const user = await request('session'); authListeners.forEach(fn => fn(user)); }
  return {
    mode: 'Local demo',
    subscribePublic: (callback, error) => poll('public', callback, error),
    subscribeConnection(callback) { callback(true); return () => {}; },
    subscribeAuth(callback, error) { authListeners.add(callback); refreshAuth().catch(error); return () => authListeners.delete(callback); },
    subscribePrivate: (callback, error) => poll('registrations', callback, error),
    async login(username, password) { await request('login', { username, password }); await refreshAuth(); },
    async logout() { await request('logout', {}); await refreshAuth(); },
    register: payload => request('register', payload),
    saveConfiguration: payload => request('configuration', payload),
    recalculate: () => request('recalculate', {})
  };
}
