// A plain-text, human-readable copy of every registration (private details included), for keeping in a notes app or printing.
import { formatUtr } from './tournament.js';
const line = (label, p, phone) => `    ${label}: ${p?.fullName || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '-'}${phone ? `  ${phone}` : ''}  UTR ${formatUtr(p?.utr ?? 0)}`;
export function registrationsText(teams, tiers = {}, { when = new Date() } = {}) {
  const list = Object.values(teams || {}).sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
  const out = [`TRIACE REGISTRATIONS BACKUP`, `Saved ${when.toISOString()} · ${list.length} team${list.length === 1 ? '' : 's'}`, 'PRIVATE: contains phone numbers. Do not share.', ''];
  const groups = new Map();
  for (const t of list) { const id = t.assignedTier || 'unassigned'; groups.set(id, [...(groups.get(id) || []), t]); }
  for (const [id, members] of groups) {
    out.push(`== ${tiers[id]?.name || (id === 'unassigned' ? 'Unassigned' : id)} (${members.length}) ==`);
    members.forEach((t, i) => {
      out.push(`${i + 1}. ${t.captain?.firstName || ''} ${t.captain?.lastName || ''}'s team · combined UTR ${formatUtr(t.combinedUtr ?? 0)} · registered ${t.registeredAt ? new Date(t.registeredAt).toISOString().slice(0, 10) : '-'}`.replace(/\s+/g, ' '));
      out.push(line('Captain', t.captain, t.whatsappPhone), line('Ace 1', t.ace1, t.ace1Phone), line('Ace 2', t.ace2, t.ace2Phone));
      if (t.captainUsername) out.push(`    Login username: ${t.captainUsername}`);
      out.push(`    Team ID: ${t.teamId}`, '');
    });
  }
  return out.join('\n');
}
