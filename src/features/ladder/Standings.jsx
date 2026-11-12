import { Link } from 'react-router-dom';
import { EmptyState, Message } from '../../components/UI';
import { useTournament } from '../../hooks/useTournament';
import { useLadder, useAction } from './LadderContext';
import { standings, challengeOption, challengesOf, isActive, nextStep } from './selectors';
import { ChallengeCard, Chip } from './ui';

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
  const todo = challengesOf(season, playerId).filter(c => isActive(c) && ['respond', 'report', 'confirm'].includes(nextStep(c, playerId)));
  return (
    <div className="lcard me" data-testid="my-ladder-card">
      <div className="me-rank"><span>#{me.rank}</span><small>of {Object.keys(season.players).length}</small></div>
      <div className="me-body">
        <h2>{me.name}</h2>
        <div className="me-stats"><div><b>{me.points}</b><span>Points</span></div><div><b>{utr(me.utr)}</b><span>UTR</span></div><div><b>{me.wins || 0}–{me.losses || 0}</b><span>Record</span></div><div><b>{me.streak || 0}</b><span>Streak</span></div></div>
        {meta.status !== 'active' && <p className="lmeta">{meta.status === 'frozen' ? 'The season is frozen: standings are final until an organizer reopens it.' : meta.status === 'draft' ? 'The season has not opened yet.' : 'This season is closed.'}</p>}
      </div>
      {todo.length > 0 && <div className="me-todo"><h3>Your move</h3>{todo.map(c => <ChallengeCard key={c.id} challenge={c} />)}</div>}
    </div>
  );
}
export default function Standings() {
  const { season, playerId, me, meta, act } = useLadder(), { busy, error, run } = useAction();
  const rows = standings(season), canPlay = me && meta.status === 'active';
  return (
    <>
      <MyCard />
      <Message error>{error}</Message>
      <h2 className="lsection">Standings</h2>
      {!rows.length ? <EmptyState icon="users" title="No players yet">Players appear here once an organizer enrolls them.</EmptyState> : (
        <ol className="ladder-list" aria-label="Ladder standings">
          {rows.map(p => {
            const option = canPlay ? challengeOption(season, playerId, p.id) : { ok: false };
            return (
              <li key={p.id} className={`ladder-row${p.id === playerId ? ' you' : ''}`}>
                <span className="lrank" aria-label={`Position ${p.rank}`}>{p.rank}</span>
                <div className="lwho">
                  <strong>{p.name}{p.id === playerId && <em> you</em>}</strong>
                  <span><Chip tone={p.status.tone}>{p.status.label}</Chip>{p.recent.length > 0 && <span className="lform-dots" aria-label={`Recent results: ${p.recent.join(' ')}`}>{p.recent.map((r, i) => <i key={i} className={r}>{r}</i>)}</span>}</span>
                </div>
                <div className="lnums"><b>{p.points}</b><small>pts</small></div>
                <div className="lnums utr"><b>{utr(p.utr)}</b><small>UTR</small></div>
                <div className="lgo">
                  {option.ok ? <button className="button small" disabled={busy} aria-label={`Challenge ${p.name}`} onClick={() => run(() => act({ action: 'challenge', opponentId: p.id }))}>Challenge</button>
                    : option.why ? <small title={option.why}>{option.why}</small> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
