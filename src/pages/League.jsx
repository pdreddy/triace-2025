import { useState } from 'react';
import { useTournament, useMyTeams } from '../hooks/useTournament';
import { EmptyState, Message, tierTone } from '../components/UI';
import { Bracket, FixtureCard, StandingsTable, teamIndex } from '../components/League';
import { orderedTiers } from '../../functions/lib/tournament.js';
import { standings } from '../../functions/lib/league.js';

export default function League() {
  const { data, service, user } = useTournament();
  const myTeams = useMyTeams();
  const tiers = orderedTiers(data?.tierConfig || {}).filter(t => Object.keys(data?.tiers?.[t.id]?.teams || {}).length || Object.keys(data?.fixtures?.[t.id] || {}).length);
  const [picked, setPicked] = useState(null), [view, setView] = useState('standings'), [mineOnly, setMineOnly] = useState(false), [message, setMessage] = useState('');
  const tier = tiers.find(t => t.id === picked) || tiers[0];
  const teams = teamIndex(data), mine = new Set(Object.keys(myTeams));
  const all = Object.values(data?.fixtures?.[tier?.id] || {}), playoffs = all.filter(f => f.stage);
  const fixtures = all.filter(f => !f.stage).sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const shown = mineOnly ? fixtures.filter(f => mine.has(f.home) || mine.has(f.away)) : fixtures;
  const rounds = [...new Set(shown.map(f => f.round))];
  const rows = tier ? standings(Object.values(data?.tiers?.[tier.id]?.teams || {}), data?.fixtures?.[tier.id]) : [];
  const played = fixtures.filter(f => f.status === 'final').length;

  async function submit(fixture, entry) {
    await service.submitResult({ tierId: tier.id, fixtureId: fixture.id, ...entry });
    setMessage(user?.admin ? 'Result saved. Standings are updated.' : 'Score submitted. It counts once the admin approves it.');
  }

  return (
    <section className="page league-screen">
      <header className="page-head">
        <p className="eyebrow">Round robin · {played} of {fixtures.length} encounters played</p>
        <h1>The <em>league.</em></h1>
        <p>Live standings and every fixture. Captains submit their scores here; the admin approves them.</p>
      </header>

      {!data && <div className="skeleton-list" aria-busy="true" aria-label="Loading the league">{[0, 1, 2].map(i => <div key={i} className="skeleton-card" />)}</div>}
      {data && !tier && <EmptyState icon="calendar" title="The league hasn’t started yet.">Fixtures appear here once teams register and the admin creates the schedule.</EmptyState>}

      {tier && (
        <>
          <div className="toolbar">
            <div className="filters" role="group" aria-label="Choose a tier">
              {tiers.map(t => <button key={t.id} className={tierTone(t.id)} aria-pressed={t.id === tier.id} onClick={() => setPicked(t.id)}>{t.name}</button>)}
            </div>
            <div className="toolbar-controls">
              <div className="segmented labelled" role="tablist" aria-label="League view">
                <button type="button" role="tab" aria-selected={view === 'standings'} onClick={() => setView('standings')}>Standings</button>
                <button type="button" role="tab" aria-selected={view === 'fixtures'} onClick={() => setView('fixtures')}>Fixtures</button>
                <button type="button" role="tab" aria-selected={view === 'playoffs'} onClick={() => setView('playoffs')}>Playoffs</button>
              </div>
            </div>
          </div>
          <Message>{message}</Message>

          {view === 'standings' && (rows.length ? <StandingsTable rows={rows} highlight={mine} /> : <EmptyState title="No teams in this tier yet." />)}

          {view === 'playoffs' && (playoffs.length
            ? <Bracket fixtures={playoffs} teams={teams} mine={mine} admin={!!user?.admin} onSubmit={submit} />
            : <EmptyState icon="trophy" title="Playoffs haven’t started.">The admin creates the bracket from the final standings: top 3 (eliminator, then final) or top 4 when the tier has more than 7 teams (semifinals, then final). Every playoff encounter is best of 5.</EmptyState>)}

          {view === 'fixtures' && (
            <>
              {mine.size > 0 && <label className="checkbox"><input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} /><span>Show only my team’s fixtures</span></label>}
              {!fixtures.length && <EmptyState icon="calendar" title="No fixtures yet.">The admin creates the round-robin schedule from the Admin dashboard.</EmptyState>}
              {rounds.map(round => (
                <section key={round} className="round">
                  <h2 className="round-title">Round {round}</h2>
                  <div className="fixture-list">
                    {shown.filter(f => f.round === round).map(f => (
                      <FixtureCard key={f.id} fixture={f} teams={teams} mine={mine.has(f.home) || mine.has(f.away)} admin={!!user?.admin} onSubmit={entry => submit(f, entry)} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
