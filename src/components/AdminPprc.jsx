import { useEffect, useMemo, useState } from 'react';
import { matchPlayers, nameKey } from '../../functions/lib/pprc.js';
import { PPRC_VERIFIED_AFTER, publicPprc } from '../../functions/lib/tournament.js';
import { PprcBadge } from './UI';
import { fetchPlayer, fetchPlayerList } from '../services/pprc';

const ROLES = [['captain', 'Captain'], ['ace1', 'Ace 1'], ['ace2', 'Ace 2']];
const utr = n => (n == null ? '' : (n / 100).toFixed(2));
const matchesOf = rating => (rating?.played?.singles || 0) + (rating?.played?.doubles || 0);
const figures = (id, rating) => ({ id, overall: rating.overall, singles: rating.singles, doubles: rating.doubles, matches: matchesOf(rating) });

// Admin: check each registered player against the shared PPRC list, link them, refresh the figures, and export the
// players who are not in PPRC yet so they can be created there.
export default function AdminPprc({ teams, busy, onLink, publicByDefault = false }) {
  const [list, setList] = useState(null), [error, setError] = useState(''), [working, setWorking] = useState(''), [note, setNote] = useState('');
  const [search, setSearch] = useState({}), [fullNames, setFullNames] = useState({});
  useEffect(() => { fetchPlayerList().then(setList).catch(e => setError(e.message)); }, []);
  const byId = useMemo(() => new Map((list || []).map(p => [p.id, p])), [list]);

  const rows = useMemo(() => Object.values(teams || {}).sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0)).flatMap(team => ROLES.map(([role, label]) => {
    const person = team[role], name = role === 'captain' ? person.firstName : person.fullName;
    return { key: `${team.teamId}:${role}`, team, role, label, name, person, link: team.pprcLinks?.[role] || null, chosen: team.pprcIds?.[role] || null };
  })), [teams]);
  const linked = rows.filter(r => r.link), verified = linked.filter(r => r.link.matches > PPRC_VERIFIED_AFTER);

  const suggestions = row => {
    if (!list || row.link) return [];
    const typed = search[row.key]?.trim(), pool = typed ? matchPlayers(list, typed, 5) : matchPlayers(list, row.name, 3);
    const first = row.chosen && byId.get(row.chosen);
    return [...(first ? [first] : []), ...pool.filter(p => p.id !== row.chosen)];
  };
  async function run(label, fn) {
    setWorking(label); setNote('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setWorking(''); }
  }
  const link = (row, player) => run(row.key, async () => {
    const full = await fetchPlayer(player.id);
    if (!full) throw new Error('That PPRC player no longer exists.');
    await onLink([{ teamId: row.team.teamId, role: row.role, player: figures(player.id, full.rating), public: publicByDefault }]);
  });
  // Show or hide this player's PPRC profile (full name and every match) on the public pages; the figures are kept as they are.
  const setPublic = (row, value) => run(row.key, () => onLink([{ teamId: row.team.teamId, role: row.role, player: { id: row.link.id, overall: row.link.overall, singles: row.link.singles, doubles: row.link.doubles, matches: row.link.matches }, public: value }]));
  const unlink = row => run(row.key, () => onLink([{ teamId: row.team.teamId, role: row.role, player: null }]));
  const refresh = () => run('refresh', async () => {
    const links = [];
    for (const row of linked) { const full = await fetchPlayer(row.link.id); if (full) links.push({ teamId: row.team.teamId, role: row.role, player: figures(row.link.id, full.rating) }); }
    if (links.length) await onLink(links);
    setNote(`Refreshed ${links.length} linked players.`);
  });
  function exportPlayers() {
    const entries = rows.map(r => ({
      teamId: r.team.teamId, role: r.role, name: r.role === 'captain' ? (fullNames[r.key]?.trim() || null) : r.person.fullName, firstName: r.role === 'captain' ? r.person.firstName : undefined,
      singlesUtr: r.person.singlesUtr / 100, doublesUtr: r.person.doublesUtr == null ? null : r.person.doublesUtr / 100, pprcId: r.link?.id || null
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), club: 'triace', players: entries }, null, 1)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'triace-players.json' }).click();
    setNote(`Exported ${entries.length} players. Run scripts/import-triace-players.mjs to add them to PPRC.`);
  }

  return (
    <div className="card pane pane-pprc" data-testid="pprc-admin">
      <div className="card-head">
        <h3>PPRC players</h3>
        <div className="card-actions">
          <button type="button" className="secondary small" disabled={busy || !!working || !linked.length} onClick={refresh}>{working === 'refresh' ? 'Refreshing…' : 'Refresh linked'}</button>
          <button type="button" className="secondary small" disabled={!rows.length} onClick={exportPlayers}>Export for PPRC</button>
        </div>
      </div>
      <p className="small">Link each registered player to their PPRC profile. A rating is shown publicly with a seal once they have played more than {PPRC_VERIFIED_AFTER} rated matches; until then it shows as NR. Tick Public profile to also show their full name and every match on their player page (it reveals who they are, so it starts off unless the Ace names are public). {linked.length} of {rows.length} players linked · {verified.length} verified.</p>
      {error && <p className="small warn-text">{error}</p>}
      {note && <p className="small">{note}</p>}
      {!list && !error && <p className="small">Loading the PPRC list…</p>}
      <div className="table-wrap">
        <table className="standings">
          <thead><tr><th scope="col">Team</th><th scope="col">Player</th><th scope="col" className="num">UTR</th><th scope="col">PPRC</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} data-testid={`pprc-row-${r.team.teamId}-${r.role}`}>
                <td>{r.team.captain.firstName}’s team</td>
                <td><b>{r.name}</b> <span className="muted">· {r.label}</span></td>
                <td className="num">{utr(r.person.singlesUtr)}{r.person.doublesUtr != null ? ` / ${utr(r.person.doublesUtr)}` : ''}</td>
                <td>
                  {r.link ? (
                    <>
                      <b>{byId.get(r.link.id)?.name || r.link.id}</b> · S {r.link.singles.toFixed(2)} / D {r.link.doubles.toFixed(2)} · {r.link.matches} {r.link.matches === 1 ? 'match' : 'matches'}{' '}
                      <PprcBadge info={publicPprc({ pprcLinks: { [r.role]: r.link } })[r.role]} />{' '}
                      <label className="small"><input type="checkbox" checked={r.link.public === true} disabled={busy || !!working} onChange={e => setPublic(r, e.target.checked)} aria-label={`Show ${r.name} PPRC profile publicly`} /> Public profile</label>{' '}
                      <button type="button" className="text-link" disabled={busy || !!working} onClick={() => unlink(r)}>Unlink</button>
                    </>
                  ) : (
                    <div>
                      {suggestions(r).map(p => <button key={p.id} type="button" className="secondary small" disabled={busy || !!working} onClick={() => link(r, p)}>Link {p.name}{r.chosen === p.id ? ' (their choice)' : ''} · {Number(p.overall).toFixed(2)} · {p.played}</button>)}
                      <input type="search" aria-label={`Search PPRC for ${r.name} (${r.label})`} placeholder="Search PPRC" value={search[r.key] || ''} onChange={e => setSearch(old => ({ ...old, [r.key]: e.target.value }))} />
                      {list && !suggestions(r).length && <span className="small muted"> Not in PPRC yet. </span>}
                      {r.role === 'captain' && <input type="text" aria-label={`Full name of ${r.name} for PPRC`} placeholder="Full name (to create a profile)" value={fullNames[r.key] || ''} onChange={e => setFullNames(old => ({ ...old, [r.key]: e.target.value }))} />}
                      <PprcBadge info={null} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="small">No registrations yet.</p>}
    </div>
  );
}
