import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useNameResolver } from '../services/names';
import { VerifiedSeal } from './UI';
import { teamName } from './League';
import { tierTone } from './UI';

export function Trophy({ size = 110 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="trophy-art" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Gold trophy">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3a8" /><stop offset=".45" stopColor="#f6c93b" /><stop offset="1" stopColor="#b8801a" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b4a5e" /><stop offset="1" stopColor="#1b2634" /></linearGradient>
      </defs>
      <path d="M30 26c-14 0-20 10-17 21 3 11 14 18 27 19" fill="none" stroke={`url(#${id}g)`} strokeWidth="6" strokeLinecap="round" />
      <path d="M90 26c14 0 20 10 17 21-3 11-14 18-27 19" fill="none" stroke={`url(#${id}g)`} strokeWidth="6" strokeLinecap="round" />
      <path d="M30 14h60v26c0 22-13 38-30 38S30 62 30 40z" fill={`url(#${id}g)`} />
      <path d="M38 20h8v22c0 14 5 24 13 29-14-3-21-16-21-32z" fill="#fff" opacity=".35" />
      <path d="M60 33l4.2 8.6 9.5 1.4-6.9 6.7 1.6 9.4L60 54.600l-8.500 4.500 1.600-9.400-6.900-6.700 9.500-1.400z" fill="#fff8d6" opacity=".9" />
      <rect x="55" y="76" width="10" height="14" rx="2" fill={`url(#${id}g)`} />
      <path d="M44 90h32l4 8H40z" fill={`url(#${id}g)`} />
      <rect x="34" y="98" width="52" height="14" rx="4" fill={`url(#${id}b)`} />
      <rect x="44" y="102" width="32" height="2.500" rx="1.200" fill="#f6c93b" opacity=".8" />
      <rect x="50" y="107" width="20" height="2" rx="1" fill="#f6c93b" opacity=".5" />
    </svg>
  );
}

export function Medal({ size = 34 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="medal-art" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Silver medal">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4f8fb" /><stop offset=".5" stopColor="#b9c6d2" /><stop offset="1" stopColor="#7f8fa0" /></linearGradient></defs>
      <path d="M11 2h7l4 12h-7zM29 2h-7l-4 12h7z" fill="#4aa8ff" />
      <circle cx="20" cy="26" r="11" fill={`url(#${id})`} />
      <circle cx="20" cy="26" r="8" fill="none" stroke="#fff" strokeOpacity=".6" />
      <text x="20" y="31" textAnchor="middle" fontFamily="var(--display)" fontSize="14" fontWeight="700" fill="#4b5a6a">2</text>
    </svg>
  );
}

// One player's name, spelled as in the shared PPRC list and linked to the public profile when there is one.
export function PlayerName({ name, teamId }) {
  const resolve = useNameResolver(), who = resolve(name, teamId);
  const link = who.id ? <Link className="player-name" to={`/pprc/${who.id}`}>{who.name}</Link> : <>{who.name}</>;
  return who.verified ? <>{link} <span className="pprc-badge ok" title={`PPRC verified rating ${who.rating.toFixed(2)}`} aria-label={`PPRC ${who.rating.toFixed(2)}, verified`}>{who.rating.toFixed(2)} <VerifiedSeal /></span></> : link;
}

// A squad written as "A · B · C" (or "A / B / C"), one name per line so full names stay readable.
export function Squad({ names, big = false, teamId }) {
  const list = String(names || '').split(/\s*[·/]\s*/).filter(Boolean);
  return list.length ? <ul className={`squad${big ? ' big' : ''}`}>{list.map(n => <li key={n}><PlayerName name={n} teamId={teamId} /></li>)}</ul> : null;
}

// Winner and runner-up of one tier. `members(team)` returns the squad line to show.
export function WinnerCard({ tier, result, teams, members, large = false, empty = 'Winners to be announced.', children }) {
  const name = id => teamName(teams.get(id));
  return (
    <article className={`winner-card ${tierTone(tier.id)}${large ? ' large' : ''}`}>
      <span className="winner-ribbon">{tier.name}</span>
      {result ? (
        <>
          <div className="winner-hero">
            <Trophy />
            <p className="winner-label">Champions</p>
            <h3>{name(result.winner)}</h3>
            <Squad names={members(teams.get(result.winner))} big={large} teamId={result.winner} />
          </div>
          <div className="runner-up">
            <Medal />
            <div><span>Runner-up</span><b>{name(result.runnerUp)}</b><Squad names={members(teams.get(result.runnerUp))} teamId={result.runnerUp} /></div>
          </div>
        </>
      ) : <p className="muted winner-empty">{empty}</p>}
      {children}
    </article>
  );
}
