import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTournament, useMyTeams } from '../hooks/useTournament';
import { EmptyState, Message, tierTone } from '../components/UI';
import { Bracket, FixtureCard, StandingsTable, shortDate, teamIndex, teamName } from '../components/League';
import { orderedTiers } from '../../functions/lib/tournament.js';
import { challengeStatus, standings } from '../../functions/lib/league.js';

// For a captain whose team sits in the challenger places: why they can't challenge yet, or a form to do it.
function ChallengePanel({ data, tierId, teamId, teams, service, onDone }) {
  const status = challengeStatus(data, tierId, teamId), rules = data.leagueRules;
  const [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!rules?.challengeEnabled || status.position < rules.challengerFrom || status.position > rules.challengerTo) return null;
  async function issue() {
    setBusy(true); setError('');
    try { await service.issueChallenge({ tierId, challenger: teamId, target }); onDone(`Challenge issued to ${teamName(teams.get(target))}. It’s in your fixtures.`); setTarget(''); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <section className="card challenge-panel">
      <div className="card-head"><h3>Challenge rule</h3><span className="pill warn">Provisional</span></div>
      <p className="small">{teamName(teams.get(teamId))} is #{status.position}. Teams in places {rules.challengerFrom}–{rules.challengerTo} can challenge one team in places {rules.targetFrom}–{rules.targetTo} once. Win and you swap places; lose and both stay.</p>
      {status.allowed ? (
        <div className="inline-form">
          <div className="field"><label htmlFor="challenge-target">Team to challenge</label>
            <select id="challenge-target" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="" disabled>Choose a team…</option>
              {status.targets.map(id => <option key={id} value={id}>{teamName(teams.get(id))}</option>)}
            </select>
          </div>
          <button type="button" className="button small" disabled={busy || !target} onClick={issue}>Issue challenge</button>
        </div>
      ) : <ul className="reasons">{status.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
      <Message error>{error}</Message>
    </section>
  );
}

export default function League() {
  const { data, service, user } = useTournament();
  const myTeams = useMyTeams();
  const tiers = orderedTiers(data?.tierConfig || {}).filter(t => Object.keys(data?.tiers?.[t.id]?.teams || {}).length || Object.keys(data?.fixtures?.[t.id] || {}).length);
  const [picked, setPicked] = useState(null), [view, setView] = useState('standings'), [mineOnly, setMineOnly] = useState(false), [message, setMessage] = useState('');
  const tier = tiers.find(t => t.id === picked) || tiers[0];
  const teams = teamIndex(data), mine = new Set(Object.keys(myTeams)), admin = !!user?.admin;
  const all = Object.values(data?.fixtures?.[tier?.id] || {});
  const playoffs = all.filter(f => f.stage), challenges = all.filter(f => f.challenge).sort((a, b) => b.issuedAt - a.issuedAt);
  const fixtures = all.filter(f => !f.stage && !f.challenge).sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  const isMine = f => mine.has(f.home) || mine.has(f.away);
  const shown = mineOnly ? fixtures.filter(isMine) : fixtures;
  const rounds = [...new Set(shown.map(f => f.round))];
  const rows = tier ? standings(Object.values(data?.tiers?.[tier.id]?.teams || {}), data?.fixtures?.[tier.id], data?.leagueRules) : [];
  const played = fixtures.filter(f => f.status === 'final').length;
  const myTierTeams = tier ? [...mine].filter(id => data?.tiers?.[tier.id]?.teams?.[id]) : [];

  async function submit(fixture, entry) {
    await service.submitResult({ tierId: tier.id, fixtureId: fixture.id, ...entry });
    setMessage(admin ? 'Result saved. Standings are updated.' : 'Score submitted. It counts once the admin approves it.');
  }
  async function move(fixture, dueBy) {
    try { await service.moveFixture({ tierId: tier.id, fixtureId: fixture.id, dueBy }); setMessage(`Deadline moved to ${shortDate(dueBy)}.`); } catch (e) { setMessage(e.message); }
  }
  const card = f => <FixtureCard key={f.id} fixture={f} teams={teams} mine={isMine(f)} admin={admin} onSubmit={entry => submit(f, entry)} onMove={dueBy => move(f, dueBy)} />;

  return (
    <section className="page league-screen">
      <header className="page-head">
        <p className="eyebrow">{data?.season?.name || 'This season'} · {played} of {fixtures.length} encounters played</p>
        <h1>The <em>league.</em></h1>
        <p>Live standings and every fixture. Captains submit their scores here; the admin approves them. <Link className="text-link" to="/history">Past seasons →</Link></p>
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
                <button type="button" role="tab" aria-selected={view === 'schedule'} onClick={() => setView('schedule')}>Schedule</button>
                <button type="button" role="tab" aria-selected={view === 'fixtures'} onClick={() => setView('fixtures')}>Fixtures</button>
                <button type="button" role="tab" aria-selected={view === 'playoffs'} onClick={() => setView('playoffs')}>Playoffs</button>
                <button type="button" role="tab" aria-selected={view === 'score'} onClick={() => setView('score')}>Score entry</button>
              </div>
            </div>
          </div>
          <Message>{message}</Message>

          {view === 'standings' && (
            <>
              {myTierTeams.map(id => <ChallengePanel key={id} data={data} tierId={tier.id} teamId={id} teams={teams} service={service} onDone={setMessage} />)}
              {rows.length ? <StandingsTable rows={rows} highlight={mine} rules={data?.leagueRules} /> : <EmptyState title="No teams in this tier yet." />}
            </>
          )}

          {view === 'schedule' && (
            fixtures.length ? (
              <div className="schedule-view">
                {[...new Set(fixtures.map(f => f.round))].map(round => {
                  const inRound = fixtures.filter(f => f.round === round), first = inRound[0];
                  return (
                    <section key={round} className="round schedule-round">
                      <h2 className="round-title">Round {round}{first?.startsOn && <span> · {shortDate(first.startsOn)} – {shortDate(first.dueBy)}</span>}</h2>
                      <ul className="schedule-list">
                        {inRound.map(f => (
                          <li key={f.id} className={isMine(f) ? 'mine' : ''}>
                            <b>{teamName(teams.get(f.home))}</b><i>vs</i><b>{teamName(teams.get(f.away))}</b>
                            <span className={`pill ${f.status === 'final' ? 'good' : ''}`}>{f.status === 'final' ? 'Played' : f.status === 'submitted' ? 'Awaiting approval' : 'Scheduled'}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ) : <EmptyState icon="calendar" title="No schedule yet.">The admin creates the round-robin schedule once the teams are final.</EmptyState>
          )}

          {view === 'score' && (
            <EmptyState icon="calendar" title="Score entry is coming in the next version.">
              A dedicated score-entry screen arrives next. Until then, captains submit scores from their team’s encounter on the <button type="button" className="text-link" onClick={() => setView('fixtures')}>Fixtures tab</button>, and the admin approves them in Admin → League &amp; results.
            </EmptyState>
          )}

          {view === 'playoffs' && (playoffs.length
            ? <Bracket fixtures={playoffs} teams={teams} mine={mine} admin={admin} onSubmit={submit} />
            : <EmptyState icon="trophy" title="Playoffs haven’t started.">The admin creates the bracket once the round robin is over. Every playoff encounter is best of 5.</EmptyState>)}

          {view === 'fixtures' && (
            <>
              {mine.size > 0 && <label className="checkbox"><input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} /><span>Show only my team’s fixtures</span></label>}
              {challenges.length > 0 && (
                <section className="round">
                  <h2 className="round-title">Challenges</h2>
                  <div className="fixture-list">{(mineOnly ? challenges.filter(isMine) : challenges).map(card)}</div>
                </section>
              )}
              {!fixtures.length && <EmptyState icon="calendar" title="No fixtures yet.">The admin creates the round-robin schedule from the Admin dashboard.</EmptyState>}
              {rounds.map(round => {
                const inRound = shown.filter(f => f.round === round), first = inRound[0];
                return (
                  <section key={round} className="round">
                    <h2 className="round-title">Round {round}{first?.startsOn && <span> · {shortDate(first.startsOn)} – {shortDate(first.dueBy)}</span>}</h2>
                    <div className="fixture-list">{inRound.map(card)}</div>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </section>
  );
}
