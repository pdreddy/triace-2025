import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { EmptyState } from '../components/UI';
import { Icon } from '../components/Icons';
import { PageTabs } from './History';
import { WinnerCard } from '../components/Winners';
import { seasonList, seasonTeams, championTiers, tierResult } from '../data/seasons.js';

const year = ms => (ms ? new Date(ms).getFullYear() : '');
const years = s => (year(s.startedAt) && year(s.startedAt) !== year(s.archivedAt) ? `${year(s.startedAt)}–${year(s.archivedAt)}` : String(year(s.archivedAt)));

const squad = team => (team?.superSixMembers || team?.members || '').split('/').map(n => n.trim()).join(' · ');

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
        const teams = seasonTeams(season), tiers = championTiers(season);
        return (
          <article key={season.id} className="champ-season">
            <header>
              <h2>{season.name}</h2>
              <span className="muted">{years(season)}</span>
              <Link className="text-link" to={`/history/${season.id}`}>Full season <Icon name="arrow" size={14} /></Link>
            </header>
            <div className="podiums">{tiers.map(t => <WinnerCard key={t.id} tier={t} result={tierResult(season, t.id)} teams={teams} members={squad} empty={season.legacy ? 'Winners to be announced.' : 'No champion recorded.'} />)}</div>
          </article>
        );
      })}
    </section>
  );
}
