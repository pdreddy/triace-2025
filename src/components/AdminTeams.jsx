import { PPRC_VERIFIED_AFTER, formatUtr } from '../../functions/lib/tournament.js';
import { TeamEditForm } from './TeamTools';

// Registered teams as a compact table: one line per team with players, UTR, PPRC and login status. On a phone each
// row turns into a small card (see the CSS), with the same buttons.
export default function AdminTeams({ teams, tiers, data, masked, captainOnly, editing, setEditing, onSave, onResetLogin, onWithdraw, busy }) {
  const tierName = id => tiers.find(t => t.id === id)?.name || 'Unassigned';
  const order = id => { const i = tiers.findIndex(t => t.id === id); return i < 0 ? 99 : i; };
  const rows = [...teams].sort((a, b) => order((a.listedTiers || [a.assignedTier])[0]) - order((b.listedTiers || [b.assignedTier])[0]) || (a.registeredAt || 0) - (b.registeredAt || 0));
  return (
    <div className="table-wrap pane pane-teams">
      <table className="team-table" data-testid="admin-team-table">
        <thead><tr><th scope="col">Team</th><th scope="col">Tier</th><th scope="col">Players</th><th scope="col" className="num">UTR</th><th scope="col">PPRC</th><th scope="col">Login</th><th scope="col">Registered</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.map(team => {
            const tierId = (team.listedTiers || [team.assignedTier])[0], waitlisted = data?.tiers?.[tierId]?.waitlist?.[team.teamId];
            const links = Object.values(team.pprcLinks || {}), verified = links.filter(l => l.matches > PPRC_VERIFIED_AFTER).length;
            if (editing === team.teamId) return <tr key={team.teamId}><td colSpan={8}><TeamEditForm registration={team} tierConfig={data?.tierConfig} onSave={onSave} onCancel={() => setEditing(null)} /></td></tr>;
            const captain = `${team.captain.firstName}${team.captain.lastName ? ` ${team.captain.lastName}` : ''}`;
            return (
              <tr key={team.teamId} data-testid={`team-row-${team.teamId}`}>
                <td data-label="Team"><b>{captain}</b><span className="muted"> · captain</span></td>
                <td data-label="Tier">{tierName(tierId)}{waitlisted && <> <span className="pill">Waitlist</span></>}</td>
                <td data-label="Players">{captainOnly ? <span className="muted">hidden</span> : masked ? <span className="muted">Ace 1 · Ace 2</span> : `${team.ace1.fullName} · ${team.ace2.fullName}`}</td>
                <td data-label="UTR" className="num"><b>{formatUtr(team.combinedUtr)}</b><small className="muted"> {formatUtr(team.captain.utr)} + {formatUtr(team.ace1.utr)} + {formatUtr(team.ace2.utr)}</small></td>
                <td data-label="PPRC">{links.length}/3 linked{links.length ? <> · <span className={`pprc-badge ${verified ? 'ok' : 'nr'}`}>{verified} verified</span></> : null}</td>
                <td data-label="Login">{team.captainUsername ? <code>{team.captainUsername}</code> : <span className="pill warn">Pending</span>}</td>
                <td data-label="Registered">{team.registeredAt ? new Date(team.registeredAt).toLocaleDateString() : '—'}</td>
                <td className="row-actions">
                  <button type="button" className="secondary small" disabled={busy} onClick={() => setEditing(team.teamId)}>Edit</button>
                  <button type="button" className="secondary small" disabled={busy} onClick={() => onResetLogin(team)}>Reset login</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => onWithdraw(team)}>Withdraw</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
