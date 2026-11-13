import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Message } from '../../components/UI';
import { useTournament } from '../../hooks/useTournament';
import { useLadder, useAction } from './LadderContext';
import { standings, challengeOption, challengesOf, isActive, verifiedLabel } from './selectors';
import { ChallengeCard, Chip } from './ui';
import { Icon } from '../../components/Icons';
import ChallengeDialog from './ChallengeDialog';
import { useRankMotion } from './useRankMotion';

const utr = value => (Number.isFinite(value) ? value.toFixed(2) : '—');
function MyCard() {
  const { me, season, playerId, signedIn, identityLoading, meta } = useLadder(), { user } = useTournament();
  if (!signedIn) return <div className="lcard me"><h2>Play the ladder</h2><p>Sign in to challenge players and report scores.</p><Link className="button small" to="/captain">Sign in</Link></div>;
  if (identityLoading) return null;
  if (!me) return (
    <div className="lcard me" data-testid="not-linked"><h2>Your account is not on the ladder yet</h2>
      <p>An organizer has to verify who you are and link this sign-in to your PPRC player record. A matching name is never enough.</p>
      <p className="lmeta">Give the organizer this account ID: <code>{user.uid}</code></p></div>
  );
  const todo = challengesOf(season, playerId).filter(isActive);
  return (
    <div className="lcard me" data-testid="my-ladder-card">
      <div className="me-rank"><span key={me.rank} className="rank-value">#{me.rank}</span><small>of {Object.keys(season.players).length}</small></div>
      <div className="me-body">
        <h2>{me.name}</h2>
        <div className="me-stats"><div><b key={me.points} className="points-value">{me.points}</b><span>Points</span></div><div><b>{utr(me.utr)}</b><span>UTR</span></div><div><b>{me.wins || 0}–{me.losses || 0}</b><span>Record</span></div><div><b>{me.streak || 0}</b><span>Streak</span></div></div>
        {meta.status !== 'active' && <p className="lmeta">{meta.status === 'frozen' ? 'The season is frozen: standings are final until an organizer reopens it.' : meta.status === 'draft' ? 'The season has not opened yet.' : 'This season is closed.'}</p>}
      </div>
      {todo.length > 0 && <div className="me-todo"><h3>Your active challenges</h3>{todo.map(c => <ChallengeCard key={c.id} challenge={c} />)}</div>}
    </div>
  );
}
function ChallengeFinder({ rows, options, onFind }) {
  const { me, season, playerId, rules, demo } = useLadder(), { busy, error, run } = useAction();
  const available = rows.filter(p => options[p.id]?.ok);
  const candidates = rows.filter(p => p.id !== playerId && options[p.id]?.why !== 'Outside your range');
  const ranks = candidates.map(p => p.rank), active = challengesOf(season, playerId).filter(isActive);
  const atLimit = active.length >= rules.challenge.activeLimit;
  const exempt = rules.challenge.blockExempt && me.exemptUntil > Date.now() && (me.exemptFrom || 0) <= Date.now();
  const title = !me.eligible ? 'You are not eligible to challenge' : exempt ? 'Your exemption is active' : atLimit ? 'Finish your active challenge first' : available.length ? 'Find your next match.' : 'No opponents available right now';
  const detail = !me.eligible ? 'Ask an organizer to review your eligibility.' : exempt ? 'You can challenge again when your approved exemption ends.' : atLimit ? `You have reached this season’s limit of ${rules.challenge.activeLimit} active challenge${rules.challenge.activeLimit === 1 ? '' : 's'}. Open Matches to continue.` : available.length ? `${available.length} opponent${available.length === 1 ? ' is' : 's are'} ready for a challenge. Choose a player below to get started.` : 'The players in your range are busy, exempt, ineligible or on a rematch cooldown. Your challenge options return when they become available.';
  const blockedReasons = me.eligible && !exempt && !atLimit ? [...new Set(candidates.map(p => options[p.id]?.why).filter(Boolean))] : [];
  const demoPlayer = demo && !available.length ? [...rows].reverse().find(p => p.id !== playerId && p.id.startsWith('ladder_demo_') && rows.some(target => challengeOption(season, p.id, target.id).ok)) : null;
  return <section className={`challenge-finder${available.length ? ' ready' : ''}`} aria-labelledby="finder-title">
    <div className="finder-symbol" aria-hidden="true"><Icon name={available.length ? 'ball' : 'lock'} size={30} /></div>
    <div className="finder-body"><p className="eyebrow">Challenge court</p><h2 id="finder-title">{title}</h2><p>{detail}</p>
      {ranks.length > 0 && <div className="finder-facts"><span>Range: #{Math.min(...ranks)}{ranks.length > 1 ? `–#${Math.max(...ranks)}` : ''}</span>{blockedReasons.map(why => <span key={why}>{candidates.filter(p => options[p.id]?.why === why).length} {why.toLowerCase()}</span>)}</div>}
      {demoPlayer && <p className="finder-demo">Want to try a new challenge in this local demo? <button disabled={busy} onClick={() => run(() => demo.loginAs(demoPlayer.id))}>Try as {demoPlayer.name} <Icon name="arrow" size={14} /></button></p>}
      <Message error>{error}</Message>
    </div>
    <div className="finder-actions">{available.length ? <button className="button small" onClick={onFind}>Choose opponent <Icon name="arrow" size={16} /></button> : active.length ? <Link className="secondary small" to="/ladder/matches">View matches <Icon name="arrow" size={16} /></Link> : null}<Link to="/ladder/rules">See challenge rules</Link></div>
  </section>;
}

export default function Standings() {
  const { season, seasonId, playerId, me, meta } = useLadder();
  const [selected, setSelected] = useState(null), [onlyAvailable, setOnlyAvailable] = useState(false), list = useRef(null);
  useEffect(() => { setSelected(null); }, [seasonId, playerId, meta.status]);
  const rows = standings(season), canPlay = me && meta.status === 'active';
  const options = Object.fromEntries(rows.map(p => [p.id, canPlay ? challengeOption(season, playerId, p.id) : { ok: false }]));
  const available = rows.filter(p => options[p.id].ok), filtered = canPlay && onlyAvailable && available.length > 0;
  const shown = filtered ? available : rows;
  useRankMotion(list, seasonId, shown.map(p => `${p.id}:${p.rank}`).join('|'));
  function findOpponent() {
    setOnlyAvailable(true);
    list.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  return (
    <>
      <MyCard />
      {canPlay && <ChallengeFinder rows={rows} options={options} onFind={findOpponent} />}
      <div className="standings-heading"><h2 className="lsection">{filtered ? 'Available opponents' : 'Standings'}</h2>{filtered && <button className="secondary small" onClick={() => setOnlyAvailable(false)}>Show all players</button>}</div>
      {!rows.length ? <EmptyState icon="users" title="No players yet">Players appear here once an organizer enrolls them.</EmptyState> : (
        <ol ref={list} className="ladder-list" aria-label="Ladder standings">
          {shown.map((p, index) => {
            const option = options[p.id];
            return (
              <li key={p.id} data-player-id={p.id} data-rank={p.rank} className={`ladder-row${p.id === playerId ? ' you' : ''}${option.ok ? ' challengeable' : ''}${p.rank <= 3 ? ' podium' : ''}`} style={{ '--row-delay': `${Math.min(index, 12) * 20}ms` }}>
                <span className="lrank" aria-label={`Position ${p.rank}`}>{p.rank}</span>
                <div className="lwho">
                  <strong>{p.name}{p.id === playerId && <em> you</em>}</strong>
                  <span><Chip tone={p.status.tone}>{p.status.label}</Chip><Chip tone={p.verified ? 'sky' : 'muted'}>{verifiedLabel(p)}</Chip>{p.recent.length > 0 && <span className="lform-dots" aria-label={`Recent results: ${p.recent.join(' ')}`}>{p.recent.map((r, i) => <i key={i} className={r}>{r}</i>)}</span>}</span>
                </div>
                <div className="lnums"><b key={p.points} className="points-value">{p.points}</b><small>pts</small></div>
                <div className="lnums utr"><b>{utr(p.utr)}</b><small>UTR</small></div>
                <div className="lgo">
                  {canPlay && p.id !== playerId && <><button className={option.ok ? 'button small challenge-trigger' : 'secondary small challenge-unavailable'} disabled={!option.ok} aria-label={`Challenge ${p.name}${option.ok ? '' : `: ${option.why}`}`} onClick={() => setSelected(p)}><Icon name={option.ok ? 'bolt' : 'lock'} size={15} />Challenge</button>{!option.ok && <small>{option.why}</small>}</>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {selected && <ChallengeDialog key={`${seasonId}:${playerId}:${selected.id}`} opponent={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
