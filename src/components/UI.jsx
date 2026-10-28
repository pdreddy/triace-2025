import { formatUtr } from '../../functions/lib/tournament.js';
export function Message({ children, error = false }) { return children ? <p className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null; }
export function Field({ label, id, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><input id={id} {...props} /></div>; }
export function TeamCard({ team, tierName, privateView = false, masked = true }) {
  const captain = privateView ? team.captain.firstName : team.captainFirstName;
  const ace1 = privateView ? !masked ? team.ace1.fullName : 'Ace 1' : team.ace1Name || 'Ace 1 (masked)';
  const ace2 = privateView ? !masked ? team.ace2.fullName : 'Ace 2' : team.ace2Name || 'Ace 2 (masked)';
  return <article className="team-card"><span className="badge">{tierName || 'Unassigned'}</span><h3>{captain}’s team</h3><div className="team-name-row" aria-label="Team players"><span>{captain}</span><span>{ace1}</span><span>{ace2}</span></div>
    <dl><div><dt>Captain · {captain}</dt><dd>{formatUtr(privateView ? team.captain.utr : team.captainUtr)}</dd></div>
      <div><dt>{ace1}</dt><dd>{formatUtr(privateView ? team.ace1.utr : team.ace1Utr)}</dd></div>
      <div><dt>{ace2}</dt><dd>{formatUtr(privateView ? team.ace2.utr : team.ace2Utr)}</dd></div>
      <div className="combined"><dt>Combined UTR</dt><dd>{formatUtr(team.combinedUtr)}</dd></div></dl>
    {privateView && <><p className="small">Registration {team.teamId}<br />{new Date(team.registeredAt).toLocaleString()}</p><details><summary>Complete private registration</summary><p>Captain: {team.captain.firstName} · singles {formatUtr(team.captain.singlesUtr)}{team.captain.doublesUtr ? ` · doubles ${formatUtr(team.captain.doublesUtr)}` : ''}</p><p>Ace 1: {team.ace1.fullName} · singles {formatUtr(team.ace1.singlesUtr)}{team.ace1.doublesUtr ? ` · doubles ${formatUtr(team.ace1.doublesUtr)}` : ''}</p><p>Ace 2: {team.ace2.fullName} · singles {formatUtr(team.ace2.singlesUtr)}{team.ace2.doublesUtr ? ` · doubles ${formatUtr(team.ace2.doublesUtr)}` : ''}</p></details></>}
  </article>;
}
