import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { groupAPractice, GROUP_A_SEASON } from '../../scripts/group-a-practice.mjs';
import { applyLadder, validateScore } from '../../functions/lib/singlesLadder/engine.js';
import { playerLoginEmail, isPlayerEmail } from '../../functions/lib/playerAccount.js';
const now = Date.parse('2026-11-13T18:00:00Z');

test('Group A uses the real roster, six separate identity links and recorded UTRs without fabricated ratings', () => {
  const { ladder, accounts, practice } = groupAPractice(now), season = ladder.public[GROUP_A_SEASON];
  assert.equal(Object.keys(season.players).length, 15);
  assert.equal(accounts.length, 6);
  assert.equal(new Set(accounts.map(a => a.uid)).size, 6);
  assert.equal(new Set(accounts.map(a => a.username)).size, 6);
  assert.deepEqual(accounts.map(a => a.name), ['Usman Jehangiri', 'Vinod Marakoosham', 'Mahidhar Penigi', 'Nagarjuna Saladi', 'Mohamed Noufal', 'Malla Reddy Cheerke']);
  for (const account of accounts) assert.equal(ladder.accounts[account.uid], account.playerId);
  assert.equal(season.players.p_usman_jehangiri.utr, 6.44);
  assert.equal(season.players.p_vinod_marakoosham.utr, 6.54);
  assert.equal(season.players.p_mohamed_noufal.utr, null);
  assert.equal(ladder.index.seasons[GROUP_A_SEASON].status, 'active');
  assert.equal(practice.matches.length, 3);
  assert.ok(Object.values(season.players).every(p => p.points === 0 && p.wins === 0));
});

test('all three actual Group A references can be accepted, reported and confirmed with their six linked accounts', () => {
  const file = new URL('../../scripts/migration/ladder-2026.psv', import.meta.url), source = fs.readFileSync(file, 'utf8');
  const practice = groupAPractice(now); let state = practice.ladder, count = 0;
  const step = (id, payload) => { state = applyLadder(state, { seasonId: GROUP_A_SEASON, ...payload }, { uid: practice.accounts.find(a => a.playerId === id).uid }, { now: now + 3600000, id: `practice_test_${++count}` }).state; };
  assert.equal(practice.practice.matches[0].score, '7-5 1-6 12-10');
  for (const match of practice.practice.matches) {
    assert.equal(state.public[GROUP_A_SEASON].challenges[match.challengeId].status, 'pending');
    validateScore(match.score, match.winnerId === match.homeId, 'either');
    step(match.awayId, { action: 'respond', challengeId: match.challengeId, accept: true });
    step(match.homeId, { action: 'submit', challengeId: match.challengeId, score: match.score, winnerId: match.winnerId });
    step(match.awayId, { action: 'confirm', challengeId: match.challengeId });
    const completed = state.public[GROUP_A_SEASON].challenges[match.challengeId];
    assert.equal(completed.status, 'completed');
    assert.equal(completed.result.winnerId, match.winnerId);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), source, 'recorded competition results stay unchanged');
  assert.equal(practice.ladder.public[GROUP_A_SEASON].players.p_usman_jehangiri.points, 0, 'the original seed is not mutated');
});

test('player login identifiers are separate from captains and do not imply organizer access', () => {
  assert.equal(playerLoginEmail(' GroupA.Usman '), 'groupa.usman@player.traice.local');
  assert.equal(isPlayerEmail('groupa.usman@player.traice.local'), true);
  assert.equal(isPlayerEmail('captain@captain.traice.local'), false);
  assert.equal(isPlayerEmail(undefined), false);
});


test('the Group A reset refuses to delete an ordinary demo data file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-a-reset-'));
  const file = path.join(directory, 'state.json'), original = JSON.stringify({ registrations: { keep: { name: 'Existing team' } } });
  fs.writeFileSync(file, original);
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/group-a-demo.mjs', import.meta.url)), '--reset'], { env: { ...process.env, TRAICE_DEMO_DATA_DIR: directory }, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Refusing to reset/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
