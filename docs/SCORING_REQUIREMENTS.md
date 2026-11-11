# Triace scoring rules (implemented)

Code: `functions/lib/scoring.js` (rules), `functions/lib/league.js` (fixtures, results, standings),
`src/components/League.jsx` (score entry). Tests: `tests/unit/scoring.test.js`, `tests/unit/league.test.js`.

## Courts
- **Round robin (3):** Singles, Doubles 1, Doubles 2. Win 2 of 3.
- **Playoffs (5):** Singles 1, Doubles 1, Singles 2, Doubles 2, Doubles 3. Win 3 of 5. All five courts need a score.
  Doubles 3 is one 10-point tiebreak (first to 10, win by 2).

## Sets
- **Singles:** one 8-game pro set. Valid: 8-0 … 8-6, and 8-7 (tiebreak played at 7-7, first to 7, win by 2).
- **Doubles:** best of 3 short sets to 4. Valid: 4-0, 4-1, 4-2, 4-3 (4-3 needs a 7-point tiebreak).
  If sets 1–2 are split, a third set is required and its format is chosen: 10-point match tiebreak or full short set.
  If one team wins both sets, no third set may be entered.

## Games and results
- Tiebreak points never count as games; a 4-3 set is 4 and 3 games.
- A match tiebreak (doubles third set, or playoff Doubles 3) counts 1 game for the winner, 0 for the loser.
- Match winner = more courts won. Court score stored as e.g. `2-1` (`3-2` in playoffs), plus game totals.
- Only approved results count (`final`; pending/submitted and rejected are shown, not counted).

## Standings (round robin only)
1 point per win (admin "points per win" setting, default 1, scales the points shown).
Columns: P, W, L, Pts, Courts, Games. Order: points → head-to-head (wins among teams tied on points) →
court difference → game difference → games won.

## Error messages
See `SCORE_ERRORS` in `scoring.js`. Singles messages differ from the draft spec because of the 7-7 tiebreak:
"Invalid pro set score. Singles must end 8-0 to 8-6, or 8-7." and "An 8-7 pro set requires tiebreak points."
