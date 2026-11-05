import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { teamName } from '../components/League';
import { PageTabs } from './History';
import { seasonList, seasonTeams, seasonTiers, tierResult } from '../data/seasons.js';

const year = ms => (ms ? new Date(ms).getFullYear() : '');
const years = s => (year(s.startedAt) && year(s.startedAt) !== year(s.archivedAt) ? `${year(s.startedAt)}–${year(s.archivedAt)}` : String(year(s.archivedAt)));

function Podium({ tier, result, teams, legacy }) {
  return (
    <div className={`podium ${tierTone(tier.id)}`}>
      <h3>{tier.name}</h3>
      {result ? (
        <dl>
          <div className="gold"><dt><Icon name="trophy" size={16} /> {legacy ? 'Group winner' : 'Winner'}</dt><dd>{teamName(teams.get(result.winner))}</dd></div>
          <div className="silver"><dt>Runner-up</dt><dd>{teamName(teams.get(result.runnerUp))}</dd></div>
        </dl>
      ) : <p className="muted">No champion recorded.</p>}
    </div>
  );
}

export default function Champions() {
  const { data } = useTournament();
  if (!data) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading champions…</div>;
  const seasons = seasonList(data);
  return (
    <section className="page champions-screen">
      <header className="page-head">
        <p className="eyebrow">Hall of fame</p>
        <h1>Season <em>champions.</em></h1>
        <p>Winners and runners-up of every tier, season by season.</p>
      </header>
      <PageTabs active="champions" />
      {!seasons.length && <EmptyState icon="trophy" title="No champions yet.">Champions appear here once a season is closed.</EmptyState>}
      {seasons.map(season => {
        const teams = seasonTeams(season), tiers = seasonTiers(season), final = season.grandFinal;
        return (
          <article key={season.id} className="champ-season">
            <header>
              <h2>{season.name}</h2>
              <span className="muted">{years(season)}</span>
              <Link className="text-link" to={`/history/${season.id}`}>Full season <Icon name="arrow" size={14} /></Link>
            </header>
            <div className="podiums">{tiers.map(t => <Podium key={t.id} tier={t} result={tierResult(season, t.id)} teams={teams} legacy={season.legacy} />)}</div>
            {final && <p className="final-note"><Icon name="trophy" size={16} /> Grand final: <b>{teamName(teams.get(final.result.winner === 'home' ? final.home : final.away))}</b> beat {teamName(teams.get(final.result.winner === 'home' ? final.away : final.home))}</p>}
          </article>
        );
      })}
    </section>
  );
}
