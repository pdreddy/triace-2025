import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Stat } from '../components/UI';
import { fetchPlayer, fetchPlayerList, fetchYear } from '../services/pprc';

const signed = v => (Math.abs(v) < 0.005 ? '0.00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
const clubName = id => ({ koc: 'KOC', triace: 'Triace' }[id] || id);

// One played court: which game it was (club, season, league or playoffs), the date, the result and the people.
function MatchRow({ h }) {
  return (
    <li className={h.won ? 'win' : 'loss'} data-testid="pprc-match">
      <span className="history-result">{h.won ? 'W' : 'L'}</span>
      <div>
        <span className={`pill game-${h.club}`}>{h.competition}</span> <b>{h.court}</b> <span className="muted">· {h.seasonLabel} · {h.stageLabel} · {h.date}</span>
        <p>{h.partnerName ? `With ${h.partnerName} ` : ''}{h.won ? 'beat' : 'lost to'} {h.opponentNames.join(' + ')} {h.opponentTeam && <span className="muted">({h.opponentTeam})</span>}</p>
      </div>
      <em>{h.games}</em>
      <span className={`change ${h.change > 0 ? 'up' : h.change < 0 ? 'down' : ''}`}>{signed(h.change)}</span>
    </li>
  );
}

// A year that opens on click and loads its matches only then.
function Year({ id, year, count, skip }) {
  const [state, setState] = useState({ open: false, items: null, error: '' });
  async function toggle(event) {
    const open = event.currentTarget.open;
    setState(s => ({ ...s, open }));
    if (open && !state.items) {
      try {
        const all = await fetchYear(id, year);
        setState(s => ({ ...s, items: all.filter(h => !skip.has(`${h.matchId}|${h.court}|${h.ts}`)) }));
      } catch (e) { setState(s => ({ ...s, error: e.message })); }
    }
  }
  return (
    <details className="history-year" onToggle={toggle} data-testid={`pprc-year-${year}`}>
      <summary>{year} <span className="muted">· {count} {count === 1 ? 'match' : 'matches'}</span></summary>
      {state.error && <p className="small warn-text">{state.error}</p>}
      {state.open && !state.items && !state.error && <p className="small">Loading…</p>}
      {state.items && <ul className="history">{state.items.map((h, i) => <MatchRow key={`${h.matchId}-${h.court}-${i}`} h={h} />)}</ul>}
    </details>
  );
}

export function PprcPlayer() {
  const { playerId } = useParams();
  const [state, setState] = useState({ loading: true, player: null, error: '' });
  useEffect(() => { fetchPlayer(playerId).then(player => setState({ loading: false, player, error: '' })).catch(e => setState({ loading: false, player: null, error: e.message })); }, [playerId]);
  if (state.loading) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading player…</div>;
  if (state.error) return <section className="page"><EmptyState icon="user" title="Could not load this player.">{state.error}</EmptyState></section>;
  if (!state.player) return <section className="page"><EmptyState icon="user" title="Player not found."><Link className="secondary" to="/pprc">All PPRC players</Link></EmptyState></section>;
  const { info, rating, recent, years } = state.player;
  // The latest ten are shown straight away; the years below hold only the older matches.
  const shown = new Set(recent.map(h => `${h.matchId}|${h.court}|${h.ts}`));
  const recentByYear = recent.reduce((o, h) => ({ ...o, [new Date(h.ts).getUTCFullYear()]: (o[new Date(h.ts).getUTCFullYear()] || 0) + 1 }), {});
  const olderYears = Object.entries(years).map(([year, total]) => ({ year: Number(year), count: total - (recentByYear[year] || 0) })).filter(y => y.count > 0).sort((a, b) => b.year - a.year);
  const total = rating.wins + rating.losses;
  const games = [...new Set(Object.values(years).length ? recent.map(h => h.competition) : [])];
  return (
    <section className="page player-screen">
      <header className="team-hero">
        <div>
          <p className="eyebrow">PPRC player · {Object.keys(info.clubs || {}).map(clubName).join(' · ') || 'No club'}</p>
          <h1>{info.name}</h1>
          <p className="team-hero-utr"><b>{rating.overall.toFixed(2)}</b> PPRC rating <span className="muted">· singles {rating.singles.toFixed(2)} · doubles {rating.doubles.toFixed(2)}</span></p>
          {info.needsFullName && <p className="small warn-text">Only a first name is known so far.</p>}
        </div>
      </header>
      <div className="stat-row">
        <Stat value={`${rating.wins}–${rating.losses}`} label="Win–loss" tone="accent" />
        <Stat value={total ? `${Math.round((rating.wins / total) * 100)}%` : '—'} label="Win rate" />
        <Stat value={`${rating.record.singles.wins}–${rating.record.singles.losses}`} label="Singles" />
        <Stat value={`${rating.record.doubles.wins}–${rating.record.doubles.losses}`} label="Doubles" />
        <Stat value={rating.seed.singles.toFixed(2)} label="Starting singles" />
      </div>
      <section className="tier-group">
        <div className="tier-head"><div><h2>All matches</h2><span>Latest 10 first{games.length ? ` (${games.join(', ')})` : ''}. Older matches are grouped by year; click a year to open it.</span></div></div>
        {!recent.length && <EmptyState icon="calendar" title="No matches yet." />}
        <ul className="history" data-testid="pprc-recent">{recent.map((h, i) => <MatchRow key={`${h.matchId}-${h.court}-${i}`} h={h} />)}</ul>
        {olderYears.length > 0 && <div className="history-years"><h3>Earlier matches</h3>{olderYears.map(y => <Year key={y.year} id={playerId} year={y.year} count={y.count} skip={shown} />)}</div>}
      </section>
    </section>
  );
}

export default function Pprc() {
  const [state, setState] = useState({ loading: true, list: [], error: '' }), [query, setQuery] = useState(''), [club, setClub] = useState('all');
  useEffect(() => { fetchPlayerList().then(list => setState({ loading: false, list, error: '' })).catch(e => setState({ loading: false, list: [], error: e.message })); }, []);
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => state.list.filter(p => (club === 'all' || (p.clubs || []).includes(club)) && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => b.overall - a.overall), [state.list, q, club]);
  return (
    <section className="page players-screen">
      <header className="page-head">
        <p className="eyebrow">PPRC · one rating across every club</p>
        <h1>PPRC <em>players.</em></h1>
        <p>One list of players for KOC, Triace and every PPRC tournament. Open a player to see every match they have played.</p>
      </header>
      {state.error && <EmptyState icon="user" title="Could not load the players.">{state.error}</EmptyState>}
      {state.loading && <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading players…</div>}
      {!state.loading && !state.error && (
        <>
          <div className="toolbar">
            <input type="search" aria-label="Search players" placeholder="Search players" value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Club" value={club} onChange={e => setClub(e.target.value)}><option value="all">All clubs</option><option value="koc">KOC</option><option value="triace">Triace</option></select>
          </div>
          <ul className="history" data-testid="pprc-list">
            {rows.map((p, i) => (
              <li key={p.id}>
                <span className="history-result">{i + 1}</span>
                <div><Link to={`/pprc/${p.id}`}><b>{p.name}</b></Link> <span className="muted">· {(p.clubs || []).map(clubName).join(' · ')} · {p.played} {p.played === 1 ? 'match' : 'matches'}</span></div>
                <em>{p.overall.toFixed(2)}</em><span />
              </li>
            ))}
          </ul>
          {!rows.length && <EmptyState icon="user" title="No players match." />}
        </>
      )}
    </section>
  );
}
