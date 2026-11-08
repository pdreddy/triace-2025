import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, Stat, VerifiedSeal } from '../components/UI';
import { Icon } from '../components/Icons';
import { clubRanks, isVerified, playerBadges, courtsPlayed } from '../../functions/lib/pprcBadges.js';
import { fetchPlayer, fetchPlayerList, fetchYear } from '../services/pprc';

const signed = v => (Math.abs(v) < 0.005 ? '0.00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
const pair = (a, b) => `${Number.isFinite(a) ? a.toFixed(2) : '—'} / ${Number.isFinite(b) ? b.toFixed(2) : '—'}`;
const clubName = id => ({ koc: 'KOC', triace: 'Triace', ladder: 'Ladder' }[id] || id);

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

// The profile of one PPRC player, loaded once (null while loading or when it cannot be read).
export function usePprcProfile(playerId) {
  const [state, setState] = useState({ loading: !!playerId, profile: null, error: '' });
  useEffect(() => {
    if (!playerId) { setState({ loading: false, profile: null, error: '' }); return undefined; }
    let live = true;
    setState({ loading: true, profile: null, error: '' });
    fetchPlayer(playerId).then(profile => live && setState({ loading: false, profile, error: '' })).catch(e => live && setState({ loading: false, profile: null, error: e.message }));
    return () => { live = false; };
  }, [playerId]);
  return state;
}

// Every match a PPRC player has played, in any club: the latest ten, then older ones by year (a year opens on click).
export function PprcHistory({ playerId, state }) {
  const own = usePprcProfile(state ? null : playerId), { loading, profile, error } = state || own;
  if (loading) return <p className="small" aria-busy="true">Loading the PPRC history…</p>;
  if (error) return <p className="small warn-text">{error}</p>;
  if (!profile) return <p className="small">This player is not in the shared PPRC list.</p>;
  const { recent, years } = profile;
  const shown = new Set(recent.map(h => `${h.matchId}|${h.court}|${h.ts}`));
  const byYear = recent.reduce((o, h) => ({ ...o, [new Date(h.ts).getUTCFullYear()]: (o[new Date(h.ts).getUTCFullYear()] || 0) + 1 }), {});
  const older = Object.entries(years).map(([year, total]) => ({ year: Number(year), count: total - (byYear[year] || 0) })).filter(y => y.count > 0).sort((a, b) => b.year - a.year);
  return (
    <>
      {!recent.length && <EmptyState icon="calendar" title="No PPRC matches yet." />}
      <ul className="history" data-testid="pprc-recent">{recent.map((h, i) => <MatchRow key={`${h.matchId}-${h.court}-${i}`} h={h} />)}</ul>
      {older.length > 0 && <div className="history-years"><h3>Earlier matches</h3>{older.map(y => <Year key={y.year} id={playerId} year={y.year} count={y.count} skip={shown} />)}</div>}
    </>
  );
}

export function PprcPlayer() {
  const { playerId } = useParams();
  const [state, setState] = useState({ loading: true, player: null, error: '' }), [ranks, setRanks] = useState({});
  useEffect(() => { fetchPlayerList().then(list => setRanks(clubRanks(list, playerId))).catch(() => setRanks({})); }, [playerId]);
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
  const verified = isVerified(rating), badges = playerBadges({ rating, info, recent, rank: ranks });
  const games = [...new Set(Object.values(years).length ? recent.map(h => h.competition) : [])];
  return (
    <section className="page player-screen">
      <header className="team-hero">
        <div>
          <p className="eyebrow">PPRC player · {Object.keys(info.clubs || {}).map(clubName).join(' · ') || 'No club'}</p>
          <h1>{info.name}{verified && <span className="verified-name" title={`PPRC verified: ${courtsPlayed(rating)} rated courts (more than 5)`}><VerifiedSeal /> <b className="verified-rating" title="PPRC singles and doubles">S {rating.singles.toFixed(2)} · D {rating.doubles.toFixed(2)}</b> <span className="sr-only">PPRC verified</span></span>}</h1>
          <ul className="badge-row" aria-label="Badges" data-testid="pprc-badges">
            <li className={`badge ${verified ? 'verified' : 'nr'}`} title={verified ? 'More than 5 rated courts' : 'Not rated yet: 5 or fewer rated courts'}>{verified ? <><VerifiedSeal /> Verified</> : 'NR · not rated yet'}</li>
            {badges.map(b => <li key={b.key} className={`badge ${b.kind}${b.club ? ` club-${b.club}` : ''}`} title={b.title}>{b.icon && <Icon name={b.icon} size={14} />}{b.label}</li>)}
          </ul>
          <p className="team-hero-utr"><b>{rating.overall.toFixed(2)}</b> PPRC rating <span className="muted">· singles {rating.singles.toFixed(2)} · doubles {rating.doubles.toFixed(2)}</span></p>
          <p className="small muted">UTR (starting point) singles {rating.seed.singles.toFixed(2)} · doubles {rating.seed.doubles.toFixed(2)}{rating.reliability ? ` · reliability singles ${Math.round(rating.reliability.singles * 100)}% · doubles ${Math.round(rating.reliability.doubles * 100)}%` : ''}</p>
          {info.needsFullName && <p className="small warn-text">Only a first name is known so far.</p>}
        </div>
      </header>
      <div className="stat-row">
        <Stat value={`${rating.wins}–${rating.losses}`} label="Win–loss" tone="accent" />
        <Stat value={total ? `${Math.round((rating.wins / total) * 100)}%` : '—'} label="Win rate" />
        <Stat value={`${rating.record.singles.wins}–${rating.record.singles.losses}`} label="Singles" />
        <Stat value={`${rating.record.doubles.wins}–${rating.record.doubles.losses}`} label="Doubles" />
        <Stat value={pair(rating.seed.singles, rating.seed.doubles)} label="UTR singles / doubles" />
        <Stat value={pair(rating.singles, rating.doubles)} label="PPRC singles / doubles" />
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

// Every player in the shared PPRC list (KOC and Triace), with search and a club filter.
export function PprcDirectory() {
  const [state, setState] = useState({ loading: true, list: [], error: '' }), [query, setQuery] = useState(''), [club, setClub] = useState('all');
  useEffect(() => { fetchPlayerList().then(list => setState({ loading: false, list, error: '' })).catch(e => setState({ loading: false, list: [], error: e.message })); }, []);
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => state.list.filter(p => (club === 'all' || (p.clubs || []).includes(club)) && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => b.overall - a.overall), [state.list, q, club]);
  return (
    <>
      {state.error && <EmptyState icon="user" title="Could not load the players.">{state.error}</EmptyState>}
      {state.loading && <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading players…</div>}
      {!state.loading && !state.error && (
        <>
          <div className="toolbar">
            <input type="search" aria-label="Search players" placeholder="Search players" value={query} onChange={e => setQuery(e.target.value)} />
            <select aria-label="Club" value={club} onChange={e => setClub(e.target.value)}><option value="all">All clubs</option><option value="koc">KOC</option><option value="triace">Triace</option><option value="ladder">Ladder</option></select>
          </div>
          <p className="small">{rows.length} of {state.list.length} PPRC players. Right: PPRC singles / doubles, then UTR singles / doubles.</p>
          <ul className="history" data-testid="pprc-list">
            {rows.map((p, i) => (
              <li key={p.id}>
                <span className="history-result">{i + 1}</span>
                <div><Link to={`/pprc/${p.id}`}><b>{p.name}</b></Link>{p.played > 5 && <span className="verified-name" title="PPRC verified"><VerifiedSeal /> <b className="verified-rating" title="PPRC singles and doubles">S {Number.isFinite(p.singles) ? p.singles.toFixed(2) : '—'} · D {Number.isFinite(p.doubles) ? p.doubles.toFixed(2) : '—'}</b></span>} <span className="muted">· {(p.clubs || []).map(clubName).join(' · ')} · {p.played} {p.played === 1 ? 'match' : 'matches'}</span></div>
                <em title="PPRC singles / doubles">{pair(p.singles, p.doubles)}</em><small className="muted" title="UTR singles / doubles">UTR {pair(p.utr?.singles, p.utr?.doubles)}</small>
              </li>
            ))}
          </ul>
          {!rows.length && <EmptyState icon="user" title="No players match." />}
        </>
      )}
    </>
  );
}

export default function Pprc() {
  return (
    <section className="page players-screen">
      <header className="page-head">
        <p className="eyebrow">PPRC · one rating across every club</p>
        <h1>PPRC <em>players.</em></h1>
        <p>One list of players for KOC, Triace and every PPRC tournament. Open a player to see every match they have played.</p>
      </header>
      <PprcDirectory />
    </section>
  );
}
