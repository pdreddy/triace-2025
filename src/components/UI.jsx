import { Link } from 'react-router-dom';
import { formatUtr, publicPprc } from '../../functions/lib/tournament.js';
import { Icon } from './Icons';

export const tierTone = id => (id === 'goat' ? 'goat' : id === 'rising' ? 'rising' : 'other');

export function Message({ children, error = false }) {
  if (!children) return null;
  return <p className={`message${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>;
}

export function Field({ label, id, hint, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

export function Stat({ value, label, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = 'ball', title, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={28} /></span>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

// A combined-UTR scale drawn in SVG: every tier range is a band, the team's rating is the marker.
// Tiers use hundredths, as stored ({ id, name, minCombinedUtr, maxCombinedUtr }).
export function UtrMeter({ tiers, value = 0 }) {
  if (!tiers.length) return null;
  const lo = Math.min(...tiers.map(t => t.minCombinedUtr)), hi = Math.max(...tiers.map(t => t.maxCombinedUtr)), span = Math.max(1, hi - lo);
  const x = v => Math.min(100, Math.max(0, ((v - lo) / span) * 100));
  return (
    <figure className="meter" aria-label={`Tier ranges from ${formatUtr(lo)} to ${formatUtr(hi)}${value ? `, team at ${formatUtr(value)}` : ''}`}>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="meter-bar" aria-hidden="true">
        <rect className="meter-track" x="0" y="0" width="100" height="12" rx="2" />
        {tiers.map(t => <rect key={t.id} className={`meter-band ${tierTone(t.id)}`} x={x(t.minCombinedUtr) + 0.4} y="1.5" width={Math.max(0, x(t.maxCombinedUtr) - x(t.minCombinedUtr) - 0.8)} height="9" rx="1.5" />)}
        {value > 0 && <rect className="meter-marker" x={x(value) - 0.6} y="-1" width="1.2" height="14" rx="0.6" />}
      </svg>
      <figcaption className="meter-legend">
        <span>{formatUtr(lo)}</span>
        {[...tiers].sort((a, b) => a.minCombinedUtr - b.minCombinedUtr).map(t => <span key={t.id} className={`meter-key ${tierTone(t.id)}`}>{t.name} {formatUtr(t.minCombinedUtr)}–{formatUtr(t.maxCombinedUtr)}</span>)}
        <span>{formatUtr(hi)}</span>
      </figcaption>
    </figure>
  );
}

// "6.00 / 6.20": singles then doubles, with a dash for a missing one (older registrations have no doubles UTR).
export const utrPair = u => (u ? `${u.singles != null ? formatUtr(u.singles) : '—'} / ${u.doubles != null ? formatUtr(u.doubles) : '—'}` : '—');
export const pprcPair = info => (info?.verified && info.singles != null ? `${info.singles.toFixed(2)} / ${info.doubles.toFixed(2)}` : 'NR');

// The verified seal (a scalloped badge with a tick), as on social profiles.
export function VerifiedSeal() {
  return (
    <svg className="verified-seal" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z" />
    </svg>
  );
}
// PPRC next to a UTR: the rating with the verified seal once the player has more than 5 rated matches, otherwise NR (not rated).
export function PprcBadge({ info }) {
  const badge = info?.verified
    ? <span className="pprc-badge ok" title={`PPRC verified (more than 5 rated matches). Singles ${info.singles?.toFixed(2) ?? '—'}, doubles ${info.doubles?.toFixed(2) ?? '—'}`} aria-label={`PPRC singles ${info.singles?.toFixed(2) ?? 'not rated'}, doubles ${info.doubles?.toFixed(2) ?? 'not rated'}, verified`}>PPRC {info.singles != null || info.doubles != null ? `S ${info.singles?.toFixed(2) ?? '—'} · D ${info.doubles?.toFixed(2) ?? '—'}` : info.rating.toFixed(2)} <VerifiedSeal /></span>
    : <span className="pprc-badge nr" title="Not rated: fewer than 6 PPRC matches" aria-label="PPRC not rated">PPRC NR</span>;
  return info?.id ? <Link className="pprc-link" to={`/pprc/${info.id}`} title="Open this player’s PPRC profile and match history">{badge}</Link> : badge;
}

export function TeamCard({ team, tierName, tierId, rank, privateView = false, masked = true, captainOnly = false }) {
  const captain = privateView ? team.captain.firstName : team.captainFirstName;
  const ace1 = privateView ? (masked ? 'Ace 1' : team.ace1.fullName) : team.ace1Name || 'Ace 1 (masked)';
  const ace2 = privateView ? (masked ? 'Ace 2' : team.ace2.fullName) : team.ace2Name || 'Ace 2 (masked)';
  const pprc = (privateView ? publicPprc(team) : team.pprc) || {};
  const rows = [
    [`Captain · ${captain}`, privateView ? team.captain.utr : team.captainUtr, pprc.captain, privateView ? { singles: team.captain.singlesUtr, doubles: team.captain.doublesUtr } : team.utrs?.captain],
    ...(captainOnly ? [] : [[ace1, privateView ? team.ace1.utr : team.ace1Utr, pprc.ace1, privateView ? { singles: team.ace1.singlesUtr, doubles: team.ace1.doublesUtr } : team.utrs?.ace1], [ace2, privateView ? team.ace2.utr : team.ace2Utr, pprc.ace2, privateView ? { singles: team.ace2.singlesUtr, doubles: team.ace2.doublesUtr } : team.utrs?.ace2]])
  ];
  const detail = (label, player) => `${label}: ${player.firstName || player.fullName}${player.lastName ? ` ${player.lastName}` : ''} · singles ${formatUtr(player.singlesUtr)}${player.doublesUtr ? ` · doubles ${formatUtr(player.doublesUtr)}` : ''}`;
  return (
    <article className={`team-card ${tierTone(tierId)}`}>
      <div className="team-card-top">
        <span className="badge">{tierName || 'Unassigned'}</span>
        {rank && <span className="rank" aria-label={`Rank ${rank}`}>#{rank}</span>}
      </div>
      <h3>{privateView ? `${captain}’s team` : <Link to={`/team/${team.teamId}`}>{captain}’s team</Link>}</h3>
      <div className="team-name-row" aria-label="Team players">
        <span>{captain}</span>{!captainOnly && <><span>{ace1}</span><span>{ace2}</span></>}
      </div>
      <dl>
        {rows.map(([label, utr, info, pair]) => <div key={label}><dt>{label}</dt><dd>{formatUtr(utr)} <PprcBadge info={info} /><small className="utr-detail">UTR S/D {utrPair(pair)} · PPRC S/D {pprcPair(info)}</small></dd></div>)}
        <div className="combined"><dt>Combined UTR</dt><dd>{formatUtr(team.combinedUtr)}</dd></div>
      </dl>
      {privateView && (
        <>
          <p className="small">Registration {team.teamId}<br />{team.captainUsername ? <>Captain login: <strong className="mono">{team.captainUsername}</strong><br /></> : <>Captain login: <em>not created yet</em> (press Reset login)<br /></>}{new Date(team.registeredAt).toLocaleString()}</p>
          <p className="small">Division choice: <strong>{({ goat: 'GOAT only', rising: 'Rising only', both: 'GOAT + Rising', higher: 'Automatic placement', goat_fallback_rising: 'GOAT preferred; Rising if UTR does not qualify' })[team.selectedTier] || team.selectedTier}</strong></p>
          {[[team.whatsappPhone, 'Captain'], ...(captainOnly ? [] : [[team.ace1Phone, 'Ace 1'], [team.ace2Phone, 'Ace 2']])].map(([phone, label]) => phone && <p key={label} className="small">{label} WhatsApp: <a href={`https://wa.me/${phone.slice(1)}`} target="_blank" rel="noopener noreferrer">{phone}</a></p>)}
          <details open>
            <summary>{captainOnly ? 'Captain registration' : 'Complete private registration'}</summary>
            <p>{detail('Captain', team.captain)}</p>
            {!captainOnly && <><p>{detail('Ace 1', team.ace1)}</p><p>{detail('Ace 2', team.ace2)}</p></>}
          </details>
        </>
      )}
    </article>
  );
}
