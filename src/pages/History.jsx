import { Link, useParams } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState, Stat, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { Bracket, StandingsTable, teamName } from '../components/League';
import { seasonList, seasonsOf, seasonTeams, seasonTable, seasonTiers, tierResult } from '../data/seasons.js';

const date = ms => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const span = s => (s.startedAt ? `${date(s.startedAt)} – ${date(s.archivedAt)}` : `Closed ${date(s.archivedAt)}`);

export function PageTabs({ active }) {
  return (
    <nav className="subtabs" aria-label="Seasons">
      <Link to="/champions" className={active === 'champions' ? 'active' : ''}>Champions</Link>
      <Link to="/history" className={active === 'history' ? 'active' : ''}>Past seasons</Link>
    </nav>
  );
}

const signed = n => (n > 0 ? `+${n}` : String(n));
export const Members = ({ team }) => (team?.members ? <small className="members">{team.members.split('/').join(' · ')}</small> : null);

// Season 1's published table: matches, wins, losses, game and singles difference, points.
function PublishedTable({ rows, teams }) {
  return (
    <div className="table-wrap">
      <table className="standings league-table published">
        <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" className="num">M</th><th scope="col" className="num">W</th><th scope="col" className="num">L</th><th scope="col" className="num"><span className="long">Game +/-</span><span className="short">Gm</span></th><th scope="col" className="num"><span className="long">Singles +/-</span><span className="short">Sg</span></th><th scope="col" className="num">Pts</th></tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.teamId} className={i < 3 ? 'qualify' : ''}>
              <td className="rank-cell">{i + 1}</td>
              <td><b>{teamName(teams.get(row.teamId))}</b><Members team={teams.get(row.teamId)} /></td>
              <td className="num">{row.m}</td><td className="num">{row.w}</td><td className="num">{row.l}</td>
              <td className="num">{signed(row.game)}</td><td className="num">{signed(row.singles)}</td><td className="num strong">{row.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">Top 3 teams advance · ranking: match points, game difference (+ doubles bonus), singles game difference, head-to-head.</p>
    </div>
  );
}

function SeasonList({ data }) {
  const seasons = seasonList(data);
  return (
    <section className="page history-screen">
      <header className="page-head">
        <p className="eyebrow">Now playing · {data.season?.name}</p>
        <h1>Past <em>seasons.</em></h1>
        <p>Every closed season keeps its final standings, playoffs and champions.</p>
      </header>
      <PageTabs active="history" />
      {!seasons.length && <EmptyState icon="trophy" title="No past seasons yet.">When the admin closes a season, it appears here with its champions and final tables.</EmptyState>}
      <div className="season-list">
        {seasons.map(season => {
          const teams = seasonTeams(season), tiers = seasonTiers(season);
          return (
            <Link key={season.id} className="season-tile" to={`/history/${season.id}`}>
              <div className="season-tile-top"><h2>{season.name}</h2><span className="muted">{span(season)}</span></div>
              <ul className="champions">
                {tiers.map(t => {
                  const champ = tierResult(season, t.id);
                  return <li key={t.id} className={tierTone(t.id)}><Icon name="trophy" size={18} /><span>{t.name}</span><b>{champ ? teamName(teams.get(champ.winner)) : season.legacy ? 'To be announced' : 'No champion recorded'}</b></li>;
                })}
              </ul>
              <span className="text-link">{teams.size} teams · view season <Icon name="arrow" size={14} /></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SeasonDetail({ season }) {
  const teams = seasonTeams(season), tiers = seasonTiers(season);
  const encounters = Object.values(season.fixtures || {}).flatMap(f => Object.values(f || {})).filter(f => f.status === 'final').length;
  return (
    <section className="page history-screen">
      <header className="page-head with-actions">
        <div>
          <p className="eyebrow">{span(season)}</p>
          <h1>{season.name}</h1>
        </div>
        <Link className="secondary" to="/history">All seasons</Link>
      </header>
      <div className="stat-row">
        <Stat value={teams.size} label="Teams" />
        <Stat value={tiers.length} label="Tiers" />
        <Stat value={encounters} label="Encounters played" />
        {season.legacy ? <Stat value="TBA" label="Winners" tone="accent" /> : <Stat value={tiers.filter(t => tierResult(season, t.id)).length} label="Champions" tone="accent" />}
      </div>
      {tiers.map(tier => {
        const tierFixtures = season.fixtures?.[tier.id] || {}, champ = tierResult(season, tier.id);
        const rows = season.legacy ? season.table[tier.id] : seasonTable(season, tier.id);
        const playoffs = Object.values(tierFixtures).filter(f => f.stage);
        return (
          <section key={tier.id} className={`tier-group ${tierTone(tier.id)}`}>
            <div className="tier-head"><div><h2>{tier.name}</h2><span>{rows.length} teams</span></div></div>
            {champ && <p className="champion-banner"><Icon name="trophy" size={22} /><span>Champions</span><b>{teamName(teams.get(champ.winner))}</b><em>Runners-up: {teamName(teams.get(champ.runnerUp))}</em></p>}
            {rows.length > 0 && (season.legacy ? <PublishedTable rows={rows} teams={teams} /> : <StandingsTable rows={rows} rules={season.leagueRules} archived />)}
            {playoffs.length > 0 && <><h3 className="round-title">Playoffs</h3><Bracket fixtures={playoffs} teams={teams} archived /></>}
          </section>
        );
      })}
    </section>
  );
}

export default function History() {
  const { seasonId } = useParams();
  const { data } = useTournament();
  if (!data) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading history…</div>;
  if (!seasonId) return <SeasonList data={data} />;
  const season = seasonsOf(data)[seasonId];
  return season ? <SeasonDetail season={season} /> : <section className="page"><EmptyState title="Season not found."><Link className="secondary" to="/history">All seasons</Link></EmptyState></section>;
}
