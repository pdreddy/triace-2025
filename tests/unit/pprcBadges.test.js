import test from 'node:test';
import assert from 'node:assert/strict';
import { playerBadges, clubRanks, isVerified, seasonLabel } from '../../functions/lib/pprcBadges.js';

const rating = (extra = {}) => ({ singles: 5.8, doubles: 6.2, played: { singles: 7, doubles: 22 }, record: { singles: { wins: 6, losses: 1 }, doubles: { wins: 17, losses: 5 } },
  seasons: { koc_s2: { club: 'koc', season: 's2' }, koc_s3: { club: 'koc', season: 's3' }, triace_s1: { club: 'triace', season: 's1' } }, ...extra });

test('verified means more than five rated courts', () => {
  assert.equal(isVerified(rating()), true);
  assert.equal(isVerified(rating({ played: { singles: 2, doubles: 3 } })), false);
  assert.equal(isVerified(rating({ played: { singles: 3, doubles: 3 } })), true);
});

test('season badges read KOC S2, KOC S3 and Triace S1', () => {
  assert.equal(seasonLabel('koc', 's3'), 'KOC S3');
  const labels = playerBadges({ rating: rating(), info: { clubs: { koc: true, triace: true } } }).filter(b => b.kind === 'season').map(b => b.label);
  assert.deepEqual(labels, ['KOC S2', 'KOC S3', 'Triace S1']);
});

test('older data without seasons falls back to the recent matches', () => {
  const labels = playerBadges({ rating: rating({ seasons: undefined }), info: { clubs: { koc: true } }, recent: [{ club: 'koc', season: 's3', won: true }] }).filter(b => b.kind === 'season').map(b => b.label);
  assert.deepEqual(labels, ['KOC S3']);
});

test('stars for the top three of a club, top 10 after that, plus specialist and streak', () => {
  const recent = Array.from({ length: 5 }, () => ({ club: 'koc', season: 's3', won: true }));
  const names = rank => playerBadges({ rating: rating(), info: { clubs: { koc: true } }, recent, rank }).map(b => b.label);
  assert.ok(names({ koc: 2 }).includes('★ KOC star #2'));
  assert.ok(names({ koc: 8 }).includes('KOC top 10'));
  assert.ok(!names({ koc: 40 }).some(l => /star|top 10/.test(l)));
  assert.ok(names({}).includes('Doubles specialist'));
  assert.ok(names({}).includes('On a 5-court streak'));
});

test('club ranks only count verified players of that club', () => {
  const list = [
    { id: 'a', clubs: ['koc'], overall: 7, played: 20 }, { id: 'b', clubs: ['koc'], overall: 8, played: 3 },
    { id: 'c', clubs: ['koc', 'triace'], overall: 6, played: 12 }
  ];
  assert.deepEqual(clubRanks(list, 'c'), { koc: 2, triace: 1 });
  assert.deepEqual(clubRanks(list, 'b'), {});
});
