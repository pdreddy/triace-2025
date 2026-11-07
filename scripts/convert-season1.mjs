// Converts the Season 1 Realtime Database export (a flat list of submitted match results) into the
// archived-season shape the History page already reads, and writes src/data/season1.json.
// Usage: node scripts/convert-season1.mjs <export.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input] = process.argv;
if (!input) { console.error('Usage: node scripts/convert-season1.mjs <export.json>'); process.exit(1); }
const raw = Object.entries(JSON.parse(readFileSync(input, 'utf8'))).map(([key, v]) => ({ key, ...v })).sort((a, b) => a.ts - b.ts);

const teamId = name => name.replace(/^Team\s+/i, '').toLowerCase();               // "Team A3" -> "a3"
const tierOf = name => teamId(name)[0];                                             // group letter: a or b
const clean = name => String(name).replace(/[:\s]+$/, '').trim();
const scoreOf = line => line.sets.filter(s => s.team1 || s.team2).map(s => `${s.team1}-${s.team2}`).join(' ');
const lineResult = lines => lines.map(l => ({
  key: l.label.toLowerCase(), label: l.label, type: l.type, winner: l.winnerTeamNum === 1 ? 'home' : 'away', score: scoreOf(l),
  home: l.players.team1.map(clean), away: l.players.team2.map(clean)
}));
const fixture = (r, extra) => ({
  home: teamId(r.t1), away: teamId(r.t2), status: 'final', format: 'rr', completedAt: r.ts,
  result: { winner: r.win === r.t1 ? 'home' : 'away', matches: lineResult(r.lines), approvedAt: r.ts }, ...extra
});

const tierConfig = { a: { name: 'Group A', sortOrder: 1, active: true }, b: { name: 'Group B', sortOrder: 2, active: true } };
const tiers = { a: { teams: {} }, b: { teams: {} } }, fixtures = { a: {}, b: {} };
const addTeam = name => { tiers[tierOf(name)].teams[teamId(name)] = { teamId: teamId(name), name }; };

const round = {};
for (const r of raw) {
  addTeam(r.t1); addTeam(r.t2);
  if (r.isPlayoff) continue; // the single playoff record is left out on purpose; winners are announced separately
  const tier = tierOf(r.t1), id = r.key;
  fixtures[tier][id] = { id, tierId: tier, round: (round[tier] = (round[tier] || 0) + 1), ...fixture(r) };
}

const season = {
  id: 's1', name: 'Season 1', legacy: true,
  startedAt: raw[0].ts, archivedAt: raw.at(-1).ts,
  tierConfig, tiers, fixtures,
  leagueRules: { pointsPerWin: 2, playoffThreshold: 99, playoffSpotsLarge: 1, playoffSpotsSmall: 1 }
};
writeFileSync(new URL('../src/data/season1.json', import.meta.url), `${JSON.stringify(season)}\n`);
const count = Object.values(fixtures).reduce((n, f) => n + Object.keys(f).length, 0);
console.log(`Season 1: ${Object.keys(tiers.a.teams).length} + ${Object.keys(tiers.b.teams).length} teams, ${count} league encounters`);
