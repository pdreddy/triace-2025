import { useEffect, useState } from 'react';
import { useTournament } from './useTournament';
export function useSinglesLadder() {
  const { service, user } = useTournament();
  const [ladder, setLadder] = useState(null), [playerId, setPlayerId] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  useEffect(() => {
    setLadder(null); setLoading(true); setError('');
    if (service.loading) return;
    if (!service.subscribeLadder) { setLoading(false); setError('Ladder is unavailable in this mode. Use the local Firebase emulators to test matches.'); return; }
    return service.subscribeLadder(value => { setLadder(value); setLoading(false); }, e => { setError(e.message); setLoading(false); });
  }, [service]);
  useEffect(() => {
    setPlayerId(null);
    if (!user?.uid || user.anonymous || !service.subscribeLadderIdentity) return;
    return service.subscribeLadderIdentity(user.uid, setPlayerId, e => setError(e.message));
  }, [service, user?.uid, user?.anonymous]);
  async function act(payload) {
    setBusy(true); setError('');
    try { await service.ladderAction(payload); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return { ladder, playerId, error, loading, busy, act, user };
}
