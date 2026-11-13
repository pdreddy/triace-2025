// The Singles Ladder's data access for the UI. Components never read database paths: they call useLadder() and
// act(). Reads come from service.subscribeLadder (Firebase, or the local demo server); every change is one
// service.ladderAction call that the backend validates and applies atomically.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTournament } from '../../hooks/useTournament';
import { completeRules } from '../../../functions/lib/singlesLadder/config.js';

const Context = createContext(null);
const newOpId = () => (crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '') : `${Date.now()}${Math.random().toString(36).slice(2)}`);

function useNode(service, path, enabled = true) {
  const [state, setState] = useState({ value: null, loading: true, error: '' });
  useEffect(() => {
    setState({ value: null, loading: true, error: '' });
    if (!enabled || service.loading) return;
    if (!service.subscribeLadder) { setState({ value: null, loading: false, error: service.setupError || 'The ladder is not available in this mode.' }); return; }
    return service.subscribeLadder(path, value => setState({ value, loading: false, error: '' }), error => setState({ value: null, loading: false, error: error.message }));
  }, [service, path, enabled]);
  return state;
}

export function LadderProvider({ children }) {
  const { service, user } = useTournament();
  const signedIn = !!user?.uid && !user.anonymous;
  const index = useNode(service, 'index');
  const [chosen, setChosen] = useState(null);
  const seasons = index.value?.seasons || {};
  const seasonId = chosen && seasons[chosen] ? chosen : index.value?.current && seasons[index.value.current] ? index.value.current : Object.keys(seasons)[0] || null;
  const season = useNode(service, `public/${seasonId}`, !!seasonId);
  const account = useNode(service, `accounts/${user?.uid}`, signedIn);
  const playerId = signedIn ? account.value : null;
  const enrolled = !!(playerId && season.value?.players?.[playerId]);
  const requests = useNode(service, `private/${seasonId}/requests/${playerId}`, enrolled && !!seasonId);
  const notifications = useNode(service, `private/${seasonId}/notifications/${playerId}`, enrolled && !!seasonId);
  // Every change: one backend call. The opId makes a retried request safe to repeat.
  const act = useCallback(payload => service.ladderAction({ seasonId, ...payload, opId: newOpId() }), [service, seasonId]);
  const value = useMemo(() => ({
    loading: index.loading || (!!seasonId && season.loading), error: index.error || season.error,
    seasons, seasonId, setSeasonId: setChosen, meta: seasonId ? seasons[seasonId] : null, season: season.value, rules: season.value?.rules?.values ? completeRules(season.value.rules.values) : null,
    playerId, me: enrolled ? season.value.players[playerId] : null, signedIn, admin: user?.admin === true, identityLoading: signedIn && account.loading,
    requests: requests.value || {}, notifications: notifications.value || {}, act, demo: service.ladderDemo || null
  }), [index, season, account, requests, notifications, seasonId, playerId, enrolled, signedIn, user?.admin, act, service]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLadder = () => useContext(Context);

// Organizer-only data (audit log, every request, linked accounts). The database rules refuse these reads to anyone else.
export function useLadderAdmin() {
  const { service } = useTournament(), { seasonId, admin } = useLadder();
  const audit = useNode(service, 'audit', admin), hidden = useNode(service, `private/${seasonId}`, admin && !!seasonId), accounts = useNode(service, 'accounts', admin);
  return { audit: audit.value || {}, requests: hidden.value?.requests || {}, accounts: accounts.value || {}, error: audit.error || hidden.error || accounts.error };
}

// One button press: { busy, error, run }. `run` resolves to the backend result, or undefined after showing the error.
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = useCallback(async fn => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(e.message || 'That did not work. Please try again.'); } finally { setBusy(false); }
  }, []);
  return { busy, error, run, setError };
}
