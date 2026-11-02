import { Link, useParams } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState, Stat } from '../components/UI';
import { playerName, teamName } from '../components/League';
import { ROLE_LABELS, playerId } from '../../functions/lib/league.js';
import { signed, useRatings } from './Players';

// Rating trend as an SVG line: one point per rated match, starting from the seed rating.
function Trend({ start, history }) {
  const values = [start, ...history.map(h => h.after)];
  if (values.length < 2) return <p className="small">The trend appears after the first approved match with a lineup.</p>;
  const lo = Math.min(...values), hi = Math.max(...values), span = Math.max(0.2, hi - lo);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - lo) / span) * 32}`).join(' ');
  return (
    <svg className="trend" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Rating moved from ${start.toFixed(2)} to ${values.at(-1).toFixed(2)}`}>
      <polyline className="trend-line" points={points} />
    </svg>
  );
}

export default function Player() {
  const { teamId, role } = useParams();
  const { data } = useTournament();
  const { teams, players } = useRatings();
  if (!data) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading player…</div>;
  const player = players.find(p => p.id === playerId(teamId, role)), team = teams.get(teamId);
  if (!player || !team) return <section className="page"><EmptyState icon="user" title="Player not found."><Link className="secondary" to="/players">All players</Link></EmptyState></section>;
  const rank = [...players].sort((a, b) => b.rating - a.rating).findIndex(p => p.id === player.id) + 1;
  const change = player.rating - player.start, name = id => { const [t, r] = id.split(':'); return playerName(teams.get(t), r); };
  const total = player.wins + player.losses;

  return (
    <section className="page player-screen">
      <header className="team-hero">
        <div>
          <p className="eyebrow">{ROLE_LABELS[player.role]} · <Link to={`/team/${teamId}`}>{teamName(team)}</Link></p>
          <h1>{playerName(team, player.role)}</h1>
          <p className="team-hero-utr"><b>{player.rating.toFixed(2)}</b> Triace rating <span className={`change ${change > 0.004 ? 'up' : change < -0.004 ? 'down' : ''}`}>{total ? signed(change) : ''}</span></p>
        </div>
        <span className="rating-badge" aria-label={`Ranked ${rank} of ${players.length}`}><small>Rank</small>#{rank}</span>
      </header>

      <div className="stat-row">
        <Stat value={`${player.wins}–${player.losses}`} label="Win–loss" tone="accent" />
        <Stat value={total ? `${Math.round((player.wins / total) * 100)}%` : '—'} label="Win rate" />
        <Stat value={`${player.singles.wins}–${player.singles.losses}`} label="Singles" />
        <Stat value={`${player.doubles.wins}–${player.doubles.losses}`} label="Doubles" />
        <Stat value={player.start.toFixed(2)} label="Start (counted UTR)" />
      </div>

      <section className="card">
        <div className="card-head"><h2>Rating trend</h2><span className="pill">{player.history.length} rated matches</span></div>
        <Trend start={player.start} history={player.history} />
      </section>

      <section className="tier-group">
        <div className="tier-head"><div><h2>Match history</h2><span>Newest first. Scores are from the winner’s side.</span></div></div>
        {!player.history.length && <EmptyState icon="calendar" title="No rated matches yet." />}
        <ul className="history">
          {[...player.history].reverse().map((h, i) => (
            <li key={`${h.fixtureId}-${h.match}-${i}`} className={h.won ? 'win' : 'loss'}>
              <span className="history-result">{h.won ? 'W' : 'L'}</span>
              <div>
                <b>{h.match}</b> <span className="muted">· {h.stage || `Round ${h.round}`}</span>
                <p>{h.partner ? `With ${name(h.partner)} ` : ''}{h.won ? 'beat' : 'lost to'} {h.opponents.map(name).join(' + ')} <span className="muted">({teamName(teams.get(h.opponents[0].split(':')[0]))})</span></p>
              </div>
              <em>{h.score}</em>
              <span className={`change ${h.change > 0 ? 'up' : 'down'}`}>{signed(h.change)}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
