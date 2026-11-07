import { createContext, useContext, useEffect, useState } from 'react';
import { createDemoService } from '../services/demo';
const Context = createContext(null);
const SNAPSHOT_KEY = 'traice.publicSnapshot';
// The last public data (already public, nothing private) so pages still show something offline.
const readSnapshot = () => { try { const saved = JSON.parse(localStorage.getItem(SNAPSHOT_KEY)); return saved?.data?.settings ? saved : null; } catch { return null; } };
const writeSnapshot = data => { try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* storage full or blocked */ } };
export function TournamentProvider({ children }) {
  const [service, setService] = useState({ loading: true, mode: 'Loading…' });
  useEffect(() => {
    let cancelled = false;
    (async () => { try { const next = import.meta.env.MODE === 'demo' ? createDemoService() : (await import('../services/firebase')).createFirebaseService(); if (!cancelled) setService(next); } catch (error) { if (!cancelled) setService({ setupError: error.message, mode: 'Not configured' }); } })();
    return () => { cancelled = true; };
  }, []);
  const [data, setData] = useState(null), [savedAt, setSavedAt] = useState(null), [user, setUser] = useState(null), [connected, setConnected] = useState(false), [error, setError] = useState(service.setupError || '');
  useEffect(() => {
    if (service.setupError) { setError(service.setupError); return; }
    if (service.loading) return;
    const fail = e => { console.error('[triace]', e); setError(e.message); };
    let live = false;
    const offPublic = service.subscribePublic(value => { live = true; setData(value); setSavedAt(null); if (value.settings) { setError(''); writeSnapshot(value); } }, fail);
    // Offline, or no live data after a few seconds: fall back to the last saved public data.
    const useSaved = () => { if (live) return; const saved = readSnapshot(); if (saved) { setData(old => old || saved.data); setSavedAt(saved.savedAt); } };
    if (!navigator.onLine) useSaved();
    const fallback = setTimeout(useSaved, 4000);
    const offAuth = service.subscribeAuth(setUser, fail), offConnection = service.subscribeConnection(setConnected);
    const timer = setTimeout(() => { if (!navigator.onLine) setError('You are offline. Reconnect before submitting.'); }, 10000);
    return () => { offPublic(); offAuth(); offConnection(); clearTimeout(timer); clearTimeout(fallback); };
  }, [service]);
  return <Context.Provider value={{ service, data, user, connected, error, savedAt }}>{children}</Context.Provider>;
}
export const useTournament = () => useContext(Context);
export function useRegistrations() {
  const { service, user } = useTournament(), [teams, setTeams] = useState({}), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    setTeams({}); setError(''); setLoading(true);
    if (!user?.admin) return;
    return service.subscribePrivate(value => { setTeams(value); setLoading(false); setError(''); }, e => { setError(e.message); setLoading(false); });
  }, [service, user?.uid, user?.admin]);
  return { teams, error, loading };
}

// Team IDs this browser's signed-in user registered (their captain teams).
export function useMyTeams() {
  const { service, user } = useTournament(), [teams, setTeams] = useState({});
  useEffect(() => {
    setTeams({});
    if (!user?.uid || !service.subscribeMyTeams) return;
    return service.subscribeMyTeams(user.uid, setTeams);
  }, [service, user?.uid]);
  return teams;
}
