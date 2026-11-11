import { useEffect, useState } from 'react';
import { matchPlayers } from '../../functions/lib/pprc.js';
import { fetchPlayer, fetchPlayerList } from '../services/pprc';

// The shared player list is downloaded once, the first time someone types a name. If it cannot be read the lookup
// simply stays quiet: registering never depends on it.
let listPromise = null;
const loadList = () => (listPromise ||= fetchPlayerList().catch(() => { listPromise = null; return []; }));
const clubName = id => ({ koc: 'KOC', triace: 'Triace' }[id] || id);

// Suggestions under a name field. Choosing one links the player to their PPRC profile and hands back the
// player's current PPRC singles and doubles ratings, so earlier results carry into this tournament.
export default function PprcLookup({ query, linked, onPick, onUnlink }) {
  const [list, setList] = useState([]), [busy, setBusy] = useState(''), [failed, setFailed] = useState(false);
  const typed = query.trim();
  useEffect(() => { if (!linked && typed.length >= 2) loadList().then(setList); }, [linked, typed.length >= 2]);
  if (linked) {
    return (
      <p className="pprc-linked" data-testid="pprc-linked">
        Linked to PPRC profile <b>{linked.name}</b>{linked.singles ? <> · PPRC singles {linked.singles} · doubles {linked.doubles}</> : null}
        {' '}<button type="button" className="text-link" onClick={onUnlink}>Unlink</button>
      </p>
    );
  }
  const matches = matchPlayers(list, typed);
  if (!matches.length) return null;
  async function pick(player) {
    setBusy(player.id); setFailed(false);
    try { const full = await fetchPlayer(player.id); onPick({ id: player.id, name: player.name, singles: full?.rating?.singles ?? null, doubles: full?.rating?.doubles ?? null }); } catch { setFailed(true); } finally { setBusy(''); }
  }
  return (
    <div className="pprc-suggest" role="group" aria-label="Players already in PPRC" data-testid="pprc-suggest">
      <small>Already playing in PPRC? Pick yourself to bring your rating and match history.</small>
      <ul>
        {matches.map(p => (
          <li key={p.id}><button type="button" disabled={!!busy} onClick={() => pick(p)}><b>{p.name}</b> <span>PPRC {Number(p.overall).toFixed(2)} · {(p.clubs || []).map(clubName).join(' · ')}</span></button></li>
        ))}
      </ul>
      {failed && <small className="warn-text">Could not load that player. You can still enter the details by hand.</small>}
    </div>
  );
}
