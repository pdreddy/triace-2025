import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDecisionPage } from '../../scripts/name-decisions-page.mjs';
import { buildMultiClub } from '../../functions/lib/pprcMigrate.js';

test('the decision page embeds its rows safely and offers the player list', () => {
  const html = renderDecisionPage({ rows: [{ raw: 'Vinod </script><b>', team: 'Team A', count: 3, kind: 'ambiguous', candidates: ['Vinod Aripaka'], examples: [] }], players: ['Vinod Aripaka'] });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('</script><b>'), 'row text cannot close the script tag');
  assert.ok(html.includes('Vinod Aripaka') && html.includes('Copy decisions') && html.includes('every team'));
});

test('unknown names get the closest KOC season 3 names as suggestions', () => {
  const data = {
    koc_users_grades: [{ name: 'Vamsi Atluri', s: 5, d: 5 }, { name: 'Dinkar Bhardwaj', s: 6, d: 6 }],
    TriAceDBNEW: { x: { ts: 1, t1: 'Team A', t2: 'Team B', g1: 8, g2: 1, s1: 1, s2: 0, lines: [{ label: 'S1', type: 'singles', players: { team1: ['Vamshi'], team2: ['Dinkar'] }, g1: 8, g2: 1, winnerTeamNum: 1 }] } }
  };
  const row = buildMultiClub(data).report.decisions.find(d => d.raw === 'Vamshi');
  assert.equal(row.kind, 'unknown');
  assert.deepEqual(row.candidates, ['p_vamsi_atluri']);
  assert.equal(row.ctx.court, 'S1'); assert.deepEqual(row.ctx.against, ['Dinkar']);
});
