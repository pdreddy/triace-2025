import { formatUtr } from '../../functions/lib/tournament.js';
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

export function TeamCard({ team, tierName, tierId, rank, privateView = false, masked = true }) {
  const captain = privateView ? team.captain.firstName : team.captainFirstName;
  const ace1 = privateView ? (masked ? 'Ace 1' : team.ace1.fullName) : team.ace1Name || 'Ace 1 (masked)';
  const ace2 = privateView ? (masked ? 'Ace 2' : team.ace2.fullName) : team.ace2Name || 'Ace 2 (masked)';
  const rows = [
    [`Captain · ${captain}`, privateView ? team.captain.utr : team.captainUtr],
    [ace1, privateView ? team.ace1.utr : team.ace1Utr],
    [ace2, privateView ? team.ace2.utr : team.ace2Utr]
  ];
  const detail = (label, player) => `${label}: ${player.firstName || player.fullName} · singles ${formatUtr(player.singlesUtr)}${player.doublesUtr ? ` · doubles ${formatUtr(player.doublesUtr)}` : ''}`;
  return (
    <article className={`team-card ${tierTone(tierId)}`}>
      <div className="team-card-top">
        <span className="badge">{tierName || 'Unassigned'}</span>
        {rank && <span className="rank" aria-label={`Rank ${rank}`}>#{rank}</span>}
      </div>
      <h3>{captain}’s team</h3>
      <div className="team-name-row" aria-label="Team players">
        <span>{captain}</span><span>{ace1}</span><span>{ace2}</span>
      </div>
      <dl>
        {rows.map(([label, utr]) => <div key={label}><dt>{label}</dt><dd>{formatUtr(utr)}</dd></div>)}
        <div className="combined"><dt>Combined UTR</dt><dd>{formatUtr(team.combinedUtr)}</dd></div>
      </dl>
      {privateView && (
        <>
          <p className="small">Registration {team.teamId}<br />{new Date(team.registeredAt).toLocaleString()}</p>
          <details>
            <summary>Complete private registration</summary>
            <p>{detail('Captain', team.captain)}</p>
            <p>{detail('Ace 1', team.ace1)}</p>
            <p>{detail('Ace 2', team.ace2)}</p>
          </details>
        </>
      )}
    </article>
  );
}
