import { createContext, useContext, useEffect, useState } from 'react';
import { createDemoService } from '../services/demo';
const Context = createContext(null);
export function TournamentProvider({ children }) {
  const [service, setService] = useState({ loading: true, mode: 'Loading…' });
  useEffect(() => {
    let cancelled = false;
    (async () => { try { const next = import.meta.env.MODE === 'demo' ? createDemoService() : (await import('../services/firebase')).createFirebaseService(); if (!cancelled) setService(next); } catch (error) { if (!cancelled) setService({ setupError: error.message, mode: 'Not configured' }); } })();
    return () => { cancelled = true; };
  }, []);
  const [data, setData] = useState(null), [user, setUser] = useState(null), [connected, setConnected] = useState(false), [error, setError] = useState(service.setupError || '');
  useEffect(() => {
    if (service.setupError) { setError(service.setupError); return; }
    if (service.loading) return;
    const fail = e => setError(e.message);
    const offPublic = service.subscribePublic(value => { setData(value); setError(''); }, fail);
    const offAuth = service.subscribeAuth(setUser, fail), offConnection = service.subscribeConnection(setConnected);
    const timer = setTimeout(() => { if (!navigator.onLine) setError('You are offline. Reconnect before submitting.'); }, 10000);
    return () => { offPublic(); offAuth(); offConnection(); clearTimeout(timer); };
  }, [service]);
  return <Context.Provider value={{ service, data, user, connected, error }}>{children}</Context.Provider>;
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
