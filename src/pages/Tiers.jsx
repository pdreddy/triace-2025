import { useState } from 'react';
import { useTournament } from '../hooks/useTournament';
import { TeamCard, Message } from '../components/UI';
import { orderedTiers, formatUtr } from '../../functions/lib/tournament.js';
export default function Tiers() {
  const { data } = useTournament(), [filter, setFilter] = useState('all');
  const tiers = orderedTiers(data?.tierConfig || {}), count = new Set(Object.values(data?.tiers || {}).flatMap(tier => Object.keys(tier.teams || {}))).size;
  return <section className="page"><div className="brand-banner"><img src="/traice-tennis.webp" alt="Traice Tennis" /><span>PLAY TOGETHER. RISE TOGETHER.</span></div><div className="eyebrow">THE LINEUP / {count} {count === 1 ? 'TEAM' : 'TEAMS'}</div><h1>Meet the <em>competition.</em></h1><p>Three players. One shared ambition. Every Ace’s name stays private.</p><div className="filters" role="group" aria-label="Filter public tiers"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All tiers</button>{tiers.map(t => <button key={t.id} aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>{t.name}</button>)}</div>
    {!data && <Message>Loading the lineup…</Message>}{data && !tiers.length && <Message>No tiers configured yet.</Message>}
    {tiers.filter(t => filter === 'all' || t.id === filter).map(tier => { const teams = Object.values(data?.tiers?.[tier.id]?.teams || {}).sort((a, b) => a.registeredAt - b.registeredAt); return <section key={tier.id} className="tier-group"><div className="group-heading"><h2>{tier.name} {!tier.active && <small>Inactive for new registrations</small>}</h2><span>{formatUtr(tier.minCombinedUtr)}–{formatUtr(tier.maxCombinedUtr)} UTR · {teams.length} teams</span></div><div className="team-list">{teams.map(team => <TeamCard key={team.teamId} team={team} tierName={tier.name} />)}</div>{!teams.length && <p>No teams in this tier yet.</p>}</section>; })}
  </section>;
}
