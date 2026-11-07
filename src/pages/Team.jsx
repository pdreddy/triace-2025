import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTournament, useMyTeams } from '../hooks/useTournament';
import { EmptyState, Message, Stat, tierTone } from '../components/UI';
import { CaptainClaim, TeamEditForm } from '../components/TeamTools';
import { FixtureCard, teamIndex, teamName, playerName } from '../components/League';
import { Icon } from '../components/Icons';
import { orderedTiers, formatUtr } from '../../functions/lib/tournament.js';
import { standings, playerId, singlesEligibility, ROLES } from '../../functions/lib/league.js';
import { useRatings } from './Players';

// A team profile: players and ratings, league record, and every fixture, like a player card in the UTR app.
export default function Team() {
  const { teamId } = useParams();
  const { data, service, user } = useTournament();
  const myTeams = useMyTeams();
  const { players: rated } = useRatings();
  const navigate = useNavigate(), [editing, setEditing] = useState(null), [note, setNote] = useState('');
  const owned = Object.hasOwn(myTeams, teamId);
  const scheduled = Object.values(data?.fixtures || {}).some(t => Object.values(t || {}).some(f => f.home === teamId || f.away === teamId));
  useEffect(() => { setEditing(null); }, [teamId]);
  async function startEdit() { try { setEditing(await service.getMyRegistration(teamId)); } catch (e) { setNote(e.message); } }
  async function saveTeam(payload) { await service.updateTeam(payload); setEditing(null); setNote('Team updated.'); }
  async function withdraw() {
    if (!window.confirm('Withdraw your team from this season? This can’t be undone from the app.')) return;
    try { await service.withdrawTeam({ teamId }); navigate('/tiers'); } catch (e) { setNote(e.message); }
  }
  const team = teamIndex(data).get(teamId), teams = teamIndex(data);
  if (!data) return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading team…</div>;
  if (!team) return <section className="page"><EmptyState title="Team not found.">This team isn’t in any tier right now. <Link className="secondary" to="/tiers">Back to the lineup</Link></EmptyState></section>;

  const tiers = orderedTiers(data.tierConfig || {}).filter(t => data.tiers?.[t.id]?.teams?.[teamId]);
  const records = tiers.map(t => ({ tier: t, row: standings(Object.values(data.tiers[t.id].teams), data.fixtures?.[t.id], data.leagueRules).find(r => r.team.teamId === teamId), fixtures: Object.values(data.fixtures?.[t.id] || {}).filter(f => f.home === teamId || f.away === teamId).sort((a, b) => a.round - b.round) }));
  const total = records.reduce((sum, r) => ({ won: sum.won + (r.row?.won || 0), lost: sum.lost + (r.row?.lost || 0) }), { won: 0, lost: 0 });
  const mine = owned;
  const players = [['captain', 'Captain', team.captainFirstName, team.captainUtr], ['ace1', 'Ace 1', team.ace1Name || 'Ace 1 (masked)', team.ace1Utr], ['ace2', 'Ace 2', team.ace2Name || 'Ace 2 (masked)', team.ace2Utr]];
  const ratingOf = role => rated.find(p => p.id === playerId(teamId, role));

  return (
    <section className="page team-screen">
      <header className={`team-hero ${tierTone(tiers[0]?.id)}`}>
        <div>
          <p className="eyebrow">{tiers.map(t => t.name).join(' · ')}{mine && ' · Your team'}</p>
          <h1>{teamName(team)}</h1>
          <p className="team-hero-utr"><b>{formatUtr(team.combinedUtr)}</b> combined UTR</p>
        </div>
        <span className="team-hero-badge" aria-hidden="true"><Icon name="trophy" size={40} /></span>
      </header>

      <Message>{note}</Message>
      {owned && !user?.admin && (
        <section className="card manage-team">
          <div className="card-head"><h2>Manage your team</h2>{scheduled && <span className="pill">Fixtures scheduled</span>}</div>
          {scheduled
            ? <p className="small">Fixtures are scheduled, so changes now go through the admin.</p>
            : editing
              ? <TeamEditForm registration={editing} tierConfig={data.tierConfig} onSave={saveTeam} onCancel={() => setEditing(null)} />
              : <div className="card-actions"><button type="button" className="secondary small" onClick={startEdit}>Edit players</button><button type="button" className="danger" onClick={withdraw}>Withdraw team</button></div>}
        </section>
      )}
      {!owned && !user?.admin && <CaptainClaim teamId={teamId} service={service} onClaimed={() => setNote('This device is now linked to your team. You can submit scores and manage the team here.')} />}
      <div className="stat-row">
        <Stat value={`${total.won}–${total.lost}`} label="Win–loss" tone="accent" />
        {records.map(r => <Stat key={r.tier.id} value={r.row ? `#${r.row.position}` : '—'} label={`${r.tier.name} position`} />)}
        <Stat value={records.reduce((s, r) => s + (r.row?.points || 0), 0)} label="Points" />
      </div>

      <section className="card team-players">
        <h2>Players</h2>
        <ul>{players.map(([role, label, name, utr]) => {
          const r = ratingOf(role);
          return <li key={role}><span>{label}</span><Link to={`/player/${teamId}/${role}`}><b>{name}</b></Link><small>UTR {formatUtr(utr)}</small><em>{r ? r.rating.toFixed(2) : formatUtr(utr)}</em></li>;
        })}</ul>
        <p className="small">Right: live Triace rating. Starting point is the counted UTR: the higher of singles and doubles, or their average when they are more than {formatUtr(data.leagueRules?.utrGapLimit ?? 175)} apart.</p>
      </section>

      {records.map(({ tier, row, fixtures }) => (
        <section key={tier.id} className="tier-group">
          <div className="tier-head"><div><h2>{tier.name} fixtures</h2>{row && <span>Form {row.form.join(' ') || '—'} · {row.matchesWon}–{row.matchesLost} courts</span>}</div></div>
          {!fixtures.length && <EmptyState icon="calendar" title="No fixtures yet." />}
          {fixtures.length > 0 && (() => {
            const check = singlesEligibility(teamId, data.fixtures?.[tier.id], data.leagueRules), pct = data.leagueRules?.singlesMinPercent ?? 40;
            return (
              <div className="singles-check">
                <p className="small">Singles minimum: {pct}% of {check.matchDays} match days = <strong>{check.required}</strong> singles days each{check.left ? ` · ${check.left} match days left` : ''}.</p>
                <ul>{ROLES.map(r => { const p = check.players[r], state = p.met ? 'met' : p.possible ? 'open' : 'missed'; return <li key={r} className={state}><b>{playerName(team, r)}</b><span>{p.days}/{check.required}</span><em>{state === 'met' ? 'Eligible' : state === 'open' ? `Needs ${check.required - p.days} more` : 'Can’t reach the minimum'}</em></li>; })}</ul>
              </div>
            );
          })()}
          <div className="fixture-list">
            {fixtures.map(f => <FixtureCard key={f.id} fixture={f} teams={teams} mine={mine} admin={!!user?.admin} onSubmit={entry => service.submitResult({ tierId: tier.id, fixtureId: f.id, ...entry })} />)}
          </div>
        </section>
      ))}
    </section>
  );
}
