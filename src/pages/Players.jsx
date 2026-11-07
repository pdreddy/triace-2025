import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState, Stat, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { playerName, teamIndex, teamName } from '../components/League';
import { orderedTiers } from '../../functions/lib/tournament.js';
import { PprcDirectory } from './Pprc';
import { ROLE_LABELS, playerRatings } from '../../functions/lib/league.js';

export const signed = value => (Math.abs(value) < 0.005 ? '0.00' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`);
export function useRatings() {
  const { data } = useTournament();
  return useMemo(() => {
    const teams = teamIndex(data);
    return { teams, players: [...playerRatings([...teams.values()], data?.fixtures).values()] };
  }, [data]);
}

export default function Players() {
  const { data } = useTournament();
  const { teams, players } = useRatings();
  const [query, setQuery] = useState(''), [tier, setTier] = useState('all'), [sort, setSort] = useState('rating'), [scope, setScope] = useState('triace');
  const tiers = orderedTiers(data?.tierConfig || {}).filter(t => Object.keys(data?.tiers?.[t.id]?.teams || {}).length);
  const inTier = (p, id) => !!data?.tiers?.[id]?.teams?.[p.teamId];
  const q = query.trim().toLowerCase();
  const pct = p => (p.wins + p.losses ? p.wins / (p.wins + p.losses) : -1);
  const ranked = [...players].sort((a, b) => b.rating - a.rating).map((p, i) => ({ ...p, rank: i + 1 }));
  const rows = ranked
    .filter(p => tier === 'all' || inTier(p, tier))
    .filter(p => !q || [playerName(teams.get(p.teamId), p.role), teamName(teams.get(p.teamId))].some(n => n.toLowerCase().includes(q)))
    .sort((a, b) => (sort === 'rating' ? b.rating - a.rating : sort === 'change' ? (b.rating - b.start) - (a.rating - a.start) : pct(b) - pct(a) || b.wins - a.wins));
  const rated = players.filter(p => p.history.length), matches = new Set(players.flatMap(p => p.history.map(h => `${h.tierId}:${h.fixtureId}:${h.match}`))).size;
  const top = ranked[0];

  return (
    <section className="page players-screen">
      <header className="page-head">
        <p className="eyebrow">Triace rating · live from every approved match</p>
        <h1>The <em>players.</em></h1>
        <div className="view-switch" role="group" aria-label="Which players to show">
          <button type="button" className={scope === 'triace' ? 'on' : ''} aria-pressed={scope === 'triace'} onClick={() => setScope('triace')}>Triace 2.0 players</button>
          <button type="button" className={scope === 'pprc' ? 'on' : ''} aria-pressed={scope === 'pprc'} onClick={() => setScope('pprc')}>All PPRC players</button>
        </div>
        <p>Each player starts at their counted UTR. After every approved match the rating moves by how many games they won compared with what the rating gap predicted.</p>
      </header>
      {scope === 'pprc' ? <PprcDirectory /> : (
        <>
      <div className="stat-row">
        <Stat value={players.length} label="Players" />
        <Stat value={rated.length} label="Rated in play" />
        <Stat value={matches} label="Matches rated" />
        <Stat value={top ? top.rating.toFixed(2) : '—'} label="Top rating" tone="accent" />
      </div>
      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filter players by tier">
          <button aria-pressed={tier === 'all'} onClick={() => setTier('all')}>All tiers</button>
          {tiers.map(t => <button key={t.id} className={tierTone(t.id)} aria-pressed={tier === t.id} onClick={() => setTier(t.id)}>{t.name}</button>)}
        </div>
        <div className="toolbar-controls">
          <label className="search"><Icon name="search" size={16} /><input type="search" aria-label="Search players" placeholder="Search players…" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <select aria-label="Sort players" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="rating">Highest rating</option>
            <option value="change">Biggest movers</option>
            <option value="wins">Best win rate</option>
          </select>
        </div>
      </div>
      {!data && <div className="skeleton-list" aria-busy="true" aria-label="Loading players">{[0, 1, 2].map(i => <div key={i} className="skeleton-card" />)}</div>}
      {data && !rows.length && <EmptyState icon="users" title={players.length ? 'No players match your search.' : 'No players yet.'} />}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="standings players-table">
            <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" className="num">Rating</th><th scope="col" className="num">Change</th><th scope="col" className="num">W–L</th><th scope="col" className="num split-col">Singles</th><th scope="col" className="num split-col">Doubles</th></tr></thead>
            <tbody>
              {rows.map(p => {
                const team = teams.get(p.teamId), change = p.rating - p.start;
                return (
                  <tr key={p.id}>
                    <td className="rank-cell">{p.rank}</td>
                    <td><Link to={`/player/${p.teamId}/${p.role}`}><b>{playerName(team, p.role)}</b></Link><span className="muted player-team"> · {ROLE_LABELS[p.role]}, {teamName(team)}</span></td>
                    <td className="num strong">{p.rating.toFixed(2)}</td>
                    <td className={`num change ${change > 0.004 ? 'up' : change < -0.004 ? 'down' : ''}`}>{p.history.length ? signed(change) : '—'}</td>
                    <td className="num">{p.wins}–{p.losses}</td>
                    <td className="num split-col">{p.singles.wins}–{p.singles.losses}</td>
                    <td className="num split-col">{p.doubles.wins}–{p.doubles.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="table-note">Triace rating is this league’s own rating, seeded from each player’s counted UTR. It is not an official UTR.</p>
        </div>
      )}
        </>
      )}
    </section>
  );
}
