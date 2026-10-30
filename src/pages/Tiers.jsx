import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament } from '../hooks/useTournament';
import { TeamCard, Message, Stat, UtrMeter, EmptyState, tierTone } from '../components/UI';
import { Icon } from '../components/Icons';
import { orderedTiers, formatUtr } from '../../functions/lib/tournament.js';
export default function Tiers() {
  const { data } = useTournament(), [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [sort, setSort] = useState('joined'), [view, setView] = useState('cards'), [shared, setShared] = useState('');
  const tiers = orderedTiers(data?.tierConfig || {});
  const unique = new Map(Object.values(data?.tiers || {}).flatMap(tier => Object.values(tier.teams || {})).map(team => [team.teamId, team]));
  const all = [...unique.values()], count = all.length, top = all.reduce((m, t) => Math.max(m, t.combinedUtr || 0), 0), avg = count ? Math.round(all.reduce((s, t) => s + (t.combinedUtr || 0), 0) / count) : 0;
  async function share() {
    const url = location.origin + '/tiers';
    try { if (navigator.share) { await navigator.share({ title: 'Traice 2.0 lineup', text: 'See every team in the Traice 2.0 tier list.', url }); return; } await navigator.clipboard.writeText(url); setShared('Link copied'); setTimeout(() => setShared(''), 2000); } catch { /* share sheet dismissed */ }
  }
  const q = query.trim().toLowerCase();
  return <section className="page tiers-screen">
    <header className="page-head with-actions"><div><p className="eyebrow">The lineup · {count} {count === 1 ? 'team' : 'teams'}</p><h1>Meet the <em>competition.</em></h1><p>Three players. One shared ambition. Ace names appear only when the admin turns public masking off.</p></div>
      <button type="button" className="secondary" onClick={share}><Icon name="share" size={16} /> {shared || 'Share lineup'}</button></header>
    <div className="stat-row"><Stat value={count} label="Teams" /><Stat value={tiers.length} label="Tiers" /><Stat value={count ? formatUtr(top) : '—'} label="Top combined UTR" tone="accent" /><Stat value={count ? formatUtr(avg) : '—'} label="Average combined" /></div>
    <div className="toolbar">
      <div className="filters" role="group" aria-label="Filter public tiers"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All tiers</button>{tiers.map(t => <button key={t.id} className={tierTone(t.id)} aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>{t.name}</button>)}</div>
      <div className="toolbar-controls">
        <label className="search"><Icon name="search" size={16} /><input type="search" aria-label="Search teams" placeholder="Search players…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select aria-label="Sort teams" value={sort} onChange={e => setSort(e.target.value)}><option value="joined">Newest first</option><option value="utr">Highest combined UTR</option></select>
        <div className="segmented" role="group" aria-label="Layout"><button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} title="Cards"><Icon name="grid" size={16} /><span className="sr-only">Cards</span></button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} title="Standings table"><Icon name="list" size={16} /><span className="sr-only">Table</span></button></div>
      </div>
    </div>
    {!data && <div className="skeleton-list" aria-busy="true" aria-label="Loading the lineup">{[0, 1, 2].map(i => <div key={i} className="skeleton-card" />)}</div>}
    {data && !tiers.length && <Message>No tiers configured yet.</Message>}
    {tiers.filter(t => filter === 'all' || t.id === filter).map(tier => {
      const members = Object.values(data?.tiers?.[tier.id]?.teams || {});
      const ranks = new Map([...members].sort((a, b) => b.combinedUtr - a.combinedUtr).map((t, i) => [t.teamId, i + 1]));
      const teams = members.filter(t => !q || [t.captainFirstName, t.ace1Name, t.ace2Name].some(n => n?.toLowerCase().includes(q))).sort((a, b) => sort === 'utr' ? b.combinedUtr - a.combinedUtr : b.registeredAt - a.registeredAt);
      return <section key={tier.id} className={`tier-group ${tierTone(tier.id)}`}>
        <div className="tier-head">{['goat', 'rising'].includes(tier.id) && <img className="tier-thumb" src={`/${tier.id}-tier.webp`} alt="" />}<div><h2>{tier.name} {!tier.active && <small>Inactive for new registrations</small>}</h2><span>{formatUtr(tier.minCombinedUtr)}–{formatUtr(tier.maxCombinedUtr)} UTR · {teams.length} {teams.length === 1 ? 'team' : 'teams'}</span></div></div>
        {view === 'cards' ? <div className="team-list">{teams.map(team => <TeamCard key={team.teamId} team={team} tierName={tier.name} tierId={tier.id} rank={ranks.get(team.teamId)} />)}</div>
          : teams.length > 0 && <div className="table-wrap"><table className="standings"><thead><tr><th scope="col">#</th><th scope="col">Captain</th><th scope="col">Aces</th><th scope="col" className="num">Captain</th><th scope="col" className="num">Ace 1</th><th scope="col" className="num">Ace 2</th><th scope="col" className="num">Combined</th></tr></thead>
            <tbody>{[...teams].sort((a, b) => ranks.get(a.teamId) - ranks.get(b.teamId)).map(t => <tr key={t.teamId}><td className="rank-cell">{ranks.get(t.teamId)}</td><td><b>{t.captainFirstName}</b></td><td className="muted">{t.ace1Name || 'Ace 1 (masked)'} · {t.ace2Name || 'Ace 2 (masked)'}</td><td className="num">{formatUtr(t.captainUtr)}</td><td className="num">{formatUtr(t.ace1Utr)}</td><td className="num">{formatUtr(t.ace2Utr)}</td><td className="num strong">{formatUtr(t.combinedUtr)}</td></tr>)}</tbody></table></div>}
        {!teams.length && <EmptyState title={members.length ? 'No teams match your search.' : 'No teams in this tier yet.'}>{!members.length && <Link className="secondary" to="/register">Be the first to register</Link>}</EmptyState>}
      </section>;
    })}
    {data && tiers.length > 0 && <section className="scale-card"><h2>Tier ranges</h2><UtrMeter tiers={tiers.filter(t => t.active)} value={0} /></section>}
  </section>;
}
