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

function GrandFinal({ season, teams }) {
  const f = season.grandFinal;
  if (!f) return null;
  const winner = f.result.winner, name = side => teamName(teams.get(f[side]));
  return (
    <section className="grand-final">
      <h2>{f.label}</h2>
      <p className="champion-banner"><Icon name="trophy" size={22} /><span>Champions</span><b>{name(winner)}</b><em>Runners-up: {name(winner === 'home' ? 'away' : 'home')}</em></p>
      <ul className="final-lines">
        {f.result.matches.map(m => (
          <li key={m.key} className={m.winner}>
            <b>{m.label}</b>
            <span className={m.winner === 'home' ? 'winner' : ''}>{m.home.join(' + ')}</span>
            <i>{m.score}</i>
            <span className={m.winner === 'away' ? 'winner' : ''}>{m.away.join(' + ')}</span>
          </li>
        ))}
      </ul>
    </section>
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
                  return <li key={t.id} className={tierTone(t.id)}><Icon name="trophy" size={18} /><span>{t.name}</span><b>{champ ? teamName(teams.get(champ.winner)) : 'No champion recorded'}</b></li>;
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
  const encounters = Object.values(season.fixtures || {}).flatMap(f => Object.values(f || {})).filter(f => f.status === 'final').length + (season.grandFinal ? 1 : 0);
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
        <Stat value={tiers.filter(t => tierResult(season, t.id)).length} label={season.legacy ? 'Group winners' : 'Champions'} tone="accent" />
      </div>
      <GrandFinal season={season} teams={teams} />
      {tiers.map(tier => {
        const tierFixtures = season.fixtures?.[tier.id] || {}, champ = tierResult(season, tier.id);
        const rows = seasonTable(season, tier.id);
        const playoffs = Object.values(tierFixtures).filter(f => f.stage);
        return (
          <section key={tier.id} className={`tier-group ${tierTone(tier.id)}`}>
            <div className="tier-head"><div><h2>{tier.name}</h2><span>{rows.length} teams</span></div></div>
            {champ && <p className="champion-banner"><Icon name="trophy" size={22} /><span>{champ.basis === 'table' ? 'Group winners' : 'Champions'}</span><b>{teamName(teams.get(champ.winner))}</b><em>Runners-up: {teamName(teams.get(champ.runnerUp))}</em></p>}
            {rows.length > 0 && <StandingsTable rows={rows} rules={season.leagueRules} archived />}
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
