import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, VerifiedSeal } from '../components/UI';
import { fetchPlayerList } from '../services/pprc';
import { METRICS, rankPlayers } from '../../functions/lib/rankings.js';

const CLUBS = { all: 'All clubs', koc: 'KOC', triace: 'Triace', ladder: 'Ladder 2026' };
const two = n => (Number.isFinite(n) ? n.toFixed(2) : '—');

// The PPRC leaderboard: every player in the shared list, by overall, singles or doubles rating.
export default function Rankings() {
  const [state, setState] = useState({ loading: true, list: [], error: '' });
  const [metric, setMetric] = useState('overall'), [club, setClub] = useState('all'), [verifiedOnly, setVerifiedOnly] = useState(true), [query, setQuery] = useState('');
  useEffect(() => { fetchPlayerList().then(list => setState({ loading: false, list, error: '' })).catch(e => setState({ loading: false, list: [], error: e.message })); }, []);
  const rows = useMemo(() => rankPlayers(state.list, { metric, club, verifiedOnly, query }), [state.list, metric, club, verifiedOnly, query]);
  return (
    <section className="page rankings-screen">
      <header className="page-head">
        <p className="eyebrow">PPRC · every club</p>
        <h1>The <em>rankings.</em></h1>
        <p>Overall is the average of a player’s singles and doubles ratings. Only verified players (more than 5 rated courts) are ranked unless you switch that off.</p>
      </header>
      <nav className="subtabs" aria-label="Rating">
        {Object.entries(METRICS).map(([id, label]) => <button key={id} type="button" className={metric === id ? 'active' : ''} aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>)}
      </nav>
      <div className="toolbar">
        <input type="search" aria-label="Search players" placeholder="Search players" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Club" value={club} onChange={e => setClub(e.target.value)}>{Object.entries(CLUBS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <label className="checkbox"><input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} /><span>Verified players only</span></label>
      </div>
      {state.loading && <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading the rankings…</div>}
      {state.error && <EmptyState icon="user" title="Could not load the rankings.">{state.error}</EmptyState>}
      {!state.loading && !state.error && (
        <>
          <p className="small">{rows.length} {rows.length === 1 ? 'player' : 'players'} ranked by {METRICS[metric].toLowerCase()} rating.</p>
          <div className="table-wrap">
            <table className="standings rankings-table" data-testid="rankings">
              <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" className="num">{METRICS[metric]}</th><th scope="col" className="num">Singles</th><th scope="col" className="num">Doubles</th><th scope="col" className="num">Courts</th><th scope="col">Played in</th></tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className={p.rank <= 3 ? `podium p${p.rank}` : ''}>
                    <td className="rank-cell">{p.rank}</td>
                    <td><Link to={`/pprc/${p.id}`}><b>{p.name}</b></Link>{p.verified && <span className="verified-name" title="PPRC verified"><VerifiedSeal /></span>}</td>
                    <td className="num strong">{two(p.value)}</td><td className="num">{two(p.singles)}</td><td className="num">{two(p.doubles)}</td><td className="num">{p.played}</td>
                    <td>{(p.clubs || []).map(c => <span key={c} className={`pill game-${c}`}>{CLUBS[c] || c}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <EmptyState icon="user" title="No players match." />}
        </>
      )}
    </section>
  );
}
