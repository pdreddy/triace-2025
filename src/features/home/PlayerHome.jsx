// Player Home: one card per format. Active formats show the signed-in player's own numbers, read through each
// format's own service; formats that are not built yet are visibly disabled.
import { Link } from 'react-router-dom';
import { useTournament, useMyTeams } from '../../hooks/useTournament';
import { Icon } from '../../components/Icons';
import { formatInZone } from '../../../functions/lib/singlesLadder/time.js';
import { MODULES } from '../modules';
import { triaceSummary } from '../triace/summary';
import { useLadder } from '../ladder/LadderContext';
import { ladderSummary } from '../ladder/selectors';

const Fact = ({ label, children }) => <div><dt>{label}</dt><dd>{children}</dd></div>;
function TriaceFacts() {
  const { data, user } = useTournament(), teams = useMyTeams();
  if (!data) return <p className="format-note">Loading TRIACE…</p>;
  const summary = Object.keys(teams).map(id => triaceSummary(data, id)).find(Boolean);
  if (!summary) return <p className="format-note">{user?.captain || user?.admin ? 'No team is registered to this sign-in.' : 'Captains: sign in to see your team, tier and next fixture here.'}</p>;
  return <dl className="format-facts"><Fact label="Team">{summary.name}</Fact><Fact label="Tier">{summary.tier}</Fact><Fact label="Next fixture">{summary.next ? `v ${summary.next.opponent}${summary.next.dueBy ? ` · by ${summary.next.dueBy}` : ''}` : 'None scheduled'}</Fact><Fact label="Record">{summary.record || 'No results yet'}</Fact></dl>;
}
function LadderFacts() {
  const { loading, error, season, seasonId, playerId, signedIn, rules } = useLadder();
  if (loading) return <p className="format-note">Loading the ladder…</p>;
  if (error) return <p className="format-note">The ladder is unavailable right now.</p>;
  if (!seasonId) return <p className="format-note">No ladder season has been created yet.</p>;
  const summary = ladderSummary(season, playerId);
  if (!summary) return <p className="format-note">{signedIn ? 'Your sign-in is not linked to a ladder player yet. Ask an organizer.' : `${Object.keys(season?.players || {}).length} players on the ladder. Sign in to see your position.`}</p>;
  return <dl className="format-facts"><Fact label="Rank">#{summary.rank} of {summary.players}</Fact><Fact label="Points">{summary.points}</Fact><Fact label="UTR">{Number.isFinite(summary.utr) ? summary.utr.toFixed(2) : '—'}</Fact><Fact label="Pending challenges">{summary.pending}</Fact><Fact label="Next deadline">{summary.nextDeadline ? formatInZone(summary.nextDeadline, rules.deadline.timezone) : 'None'}</Fact></dl>;
}
const FACTS = { triace: TriaceFacts, ladder: LadderFacts };

export default function PlayerHome() {
  const { user } = useTournament(), signedIn = user && !user.anonymous;
  return (
    <section className="page home">
      <header className="home-hero">
        <p className="eyebrow">PPRC · All Formats</p>
        <h1>Player Home</h1>
        <p>Your next match starts here.</p>
        {!signedIn && <p className="home-signin"><Link className="button small" to="/player-login">Player sign in</Link><Link className="secondary small" to="/admin/login">Organizer sign in</Link></p>}
      </header>
      <div className="format-grid">
        {MODULES.map(m => {
          const Facts = FACTS[m.id];
          return m.status === 'active' ? (
            <Link className={`format-card ${m.id}`} key={m.id} to={m.path} aria-label={`Active ${m.name}`}>
              <small className="format-state">Active</small>
              <h2>{m.name}</h2>
              <p>{m.tagline}</p>
              {Facts && <Facts />}
              <span className="format-open">Open {m.name} <Icon name="arrow" size={16} /></span>
            </Link>
          ) : (
            <article className="format-card soon" key={m.id} aria-disabled="true">
              <small className="format-state">Coming Soon</small>
              <h2>{m.name}</h2>
              <p>This format is on its way.</p>
            </article>
          );
        })}
      </div>
      {user?.admin && <p className="home-links"><Link to="/admin">TRIACE organizer dashboard →</Link><Link to="/ladder/admin">Ladder admin dashboard →</Link></p>}
    </section>
  );
}
export function ComingSoon({ name }) {
  return <section className="page not-found"><Icon name="ball" size={56} /><h1>{name} is <em>coming soon.</em></h1><p>This format is reserved and not open yet.</p><Link className="button" to="/home">All Formats <Icon name="arrow" size={18} /></Link></section>;
}
