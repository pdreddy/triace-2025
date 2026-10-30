import { formatUtr } from '../../functions/lib/tournament.js';
import { Icon } from './Icons';
export function Message({ children, error = false }) { return children ? <p className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null; }
export function Field({ label, id, hint, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><input id={id} {...props} />{hint && <small className="field-hint">{hint}</small>}</div>; }
export const tierTone = id => id === 'goat' ? 'goat' : id === 'rising' ? 'rising' : 'other';
export function Stat({ value, label, tone }) { return <div className={`stat ${tone || ''}`}><strong>{value}</strong><span>{label}</span></div>; }
// Combined UTR on a scale with every active tier's range drawn as a band.
export function UtrMeter({ tiers, value }) {
  if (!tiers.length) return null;
  const lo = Math.min(...tiers.map(t => t.minCombinedUtr)), hi = Math.max(...tiers.map(t => t.maxCombinedUtr)), span = Math.max(1, hi - lo);
  const pos = v => `${Math.min(100, Math.max(0, (v - lo) / span * 100))}%`;
  return <div className="meter" role="img" aria-label={`Team rating ${formatUtr(value)} against tier ranges ${formatUtr(lo)} to ${formatUtr(hi)}`}>
    <div className="meter-track">{tiers.map(t => <span key={t.id} className={`meter-band ${tierTone(t.id)}`} style={{ left: pos(t.minCombinedUtr), width: `calc(${pos(t.maxCombinedUtr)} - ${pos(t.minCombinedUtr)})` }}><em>{t.name}</em></span>)}{value > 0 && <i className="meter-marker" style={{ left: pos(value) }} />}</div>
    <div className="meter-scale"><span>{formatUtr(lo)}</span><span>{formatUtr(hi)}</span></div>
  </div>;
}
export function TeamCard({ team, tierName, tierId, rank, privateView = false, masked = true }) {
  const captain = privateView ? team.captain.firstName : team.captainFirstName;
  const ace1 = privateView ? !masked ? team.ace1.fullName : 'Ace 1' : team.ace1Name || 'Ace 1 (masked)';
  const ace2 = privateView ? !masked ? team.ace2.fullName : 'Ace 2' : team.ace2Name || 'Ace 2 (masked)';
  return <article className={`team-card ${tierTone(tierId)}`}>
    <div className="team-card-top"><span className="badge">{tierName || 'Unassigned'}</span>{rank && <span className="rank" aria-label={`Rank ${rank}`}>#{rank}</span>}</div>
    <h3>{captain}’s team</h3>
    <div className="team-name-row" aria-label="Team players"><span>{captain}</span><span>{ace1}</span><span>{ace2}</span></div>
    <dl><div><dt>Captain · {captain}</dt><dd>{formatUtr(privateView ? team.captain.utr : team.captainUtr)}</dd></div>
      <div><dt>{ace1}</dt><dd>{formatUtr(privateView ? team.ace1.utr : team.ace1Utr)}</dd></div>
      <div><dt>{ace2}</dt><dd>{formatUtr(privateView ? team.ace2.utr : team.ace2Utr)}</dd></div>
      <div className="combined"><dt>Combined UTR</dt><dd>{formatUtr(team.combinedUtr)}</dd></div></dl>
    {privateView && <><p className="small">Registration {team.teamId}<br />{new Date(team.registeredAt).toLocaleString()}</p><details><summary>Complete private registration</summary><p>Captain: {team.captain.firstName} · singles {formatUtr(team.captain.singlesUtr)}{team.captain.doublesUtr ? ` · doubles ${formatUtr(team.captain.doublesUtr)}` : ''}</p><p>Ace 1: {team.ace1.fullName} · singles {formatUtr(team.ace1.singlesUtr)}{team.ace1.doublesUtr ? ` · doubles ${formatUtr(team.ace1.doublesUtr)}` : ''}</p><p>Ace 2: {team.ace2.fullName} · singles {formatUtr(team.ace2.singlesUtr)}{team.ace2.doublesUtr ? ` · doubles ${formatUtr(team.ace2.doublesUtr)}` : ''}</p></details></>}
  </article>;
}
export function EmptyState({ icon = 'ball', title, children }) { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={28} /></span><strong>{title}</strong>{children}</div>; }
