import { Link } from 'react-router-dom';
import { useTournament, useMyTeams } from '../hooks/useTournament';
export default function Home() {
  const { user } = useTournament(), teams = useMyTeams();
  return <section className="page"><p className="eyebrow">PPRC · All Formats</p><h1>Player Home</h1><p>Your next match starts here.</p>
    {(!user || user.anonymous) && <p><Link to="/captain">Player sign in</Link> · <Link to="/admin/login">Organizer sign in</Link></p>}
    <div className="format-grid">{[['TRIACE 2.0', '/triace', 'Teams, tiers, fixtures and results'], ['Singles Ladder', '/ladder', 'Challenge, compete and climb']].map(([name, to, description]) => <Link className="format-card" key={to} to={to}><small>Active</small><h2>{name}</h2><p>{description}</p><span>Open format →</span></Link>)}
    {['PO', 'KOC'].map(name => <article className="format-card" key={name}><small>Coming Soon</small><h2>{name}</h2></article>)}</div>
    {Object.keys(teams).map(id => <p key={id}><Link to={`/team/${id}`}>My TRIACE team →</Link></p>)}
    {user?.admin && <p><Link to="/admin">TRIACE organizer dashboard →</Link></p>}
  </section>;
}
