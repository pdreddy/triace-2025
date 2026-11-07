# Scoring Format & Rules — Requirements

Source: `pdreddy/koc-upgrade`, branch `claude/captain-capacity-issues-k83w69`.
Derived from: `utils/tennisScoreRules.js`, `utils/standings.js`, `utils/matchTeams.js`,
`utils/eligibilityRules.js`, `services/ScoreProcessingService.js`, `pages/ScoreEntry.js`,
`pages/Rules.js`, `utils/ptrx.js`, `utils/ptlRating.js`.

## 1. Match structure (courts / "lines")
- **Round-robin: 5 courts** — 1 Singles, Doubles 1, Doubles 1 Reverse, Doubles 2, Doubles 2 Reverse.
  Doubles pair 1 and pair 2 each play both opposing pairs (hence "Reverse").
- **Playoffs: 7 courts** — Singles 1/2/3 plus the same 4 doubles courts.
- Each court is scored independently; every court has a winner.
- No-ad scoring: deciding point at deuce, receiver chooses side.

## 2. Set / court scoring
| Court | Format | Winner |
|---|---|---|
| Singles | Best of 5 sets, each set to 4 games | First to win **3 sets** |
| Doubles | Best of 3 | First to win **2 sets** |

- **Valid set scores:** 4-0, 4-1, 4-2, 4-3 only (no other values).
- **4-3 requires a set tiebreak:** winner of the tiebreak is the set winner, must reach **7** and win by **2**.
- **Doubles third set** is played only if sets 1–2 are split, and is a **10-point match tiebreak**
  (winner reaches 10, win by 2). If sets 1–2 are not split, a third set must not be entered.
- Match tiebreak is stored as a deciding set of 1-0 (e.g. 10-5 → set 1-0); its points are
  **excluded from game totals**.
- Validation error messages (keep verbatim):
  - Only 4-0, 4-1, 4-2 or 4-3 are valid set scores.
  - 4-3 requires a tiebreak score.
  - Tiebreak winner must reach 7 points and win by 2.
  - Match tiebreak winner must reach 10 points and win by 2.
  - Singles winner must win 3 sets.
  - Doubles winner must win 2 sets.
  - Third set in doubles must be a 10-point match tiebreak.

## 3. Match result
- Match winner = team that **wins more courts**. A tie in courts is invalid
  ("match winner is tied or unclear"); stored `winnerId` must agree with court results.
- Required to save: both teams, different teams, ≥1 scored court, determinable winner.
- Court winner resolution order: set wins (`setWins`) → stored `winner` name/abbr → total games.
- Stored per match: `g1/g2` (games), `s1/s2` (sets), per-line `sets`, `setWins`, `players`, `type`, `label`.
- Only **approved** matches (status APPROVED / ADMIN_APPROVED / empty) count toward any stats.

## 4. Standings (per group)
- **1 point per match win** (not per court). Losses = 0. Zero points if a fixture is not completed.
- Tracked: matches, wins, losses, sets for/against, games for/against, singles wins, points.
- **Tiebreak order (UI, `standings.js`):** points → sets for → games for → singles-court wins →
  head-to-head → set diff → game diff → team name.
- Backend `computeStandings` uses a different order (points → sets won → singles wins → head-to-head →
  game diff → name). **Requirement: unify on one order** (decide which; see open questions).
- Playoffs: top 4 of each group qualify. QF1 A1–B4, QF2 A2–B3, QF3 A3–B2, QF4 A4–B1;
  SF1 QF1–QF3, SF2 QF2–QF4; Final SF1–SF2.

## 5. Score submission rules
- Winning captain posts the score by **Monday EOD** after the match (split days still due that Monday).
- Lineups due **7:00 PM** on match day (Sat/Sun); admins set lines if missed.
- No lineup changes once play starts; all lines finish the same day.
- Quick-paste format: first line `TEAM1 vs TEAM2`, then per court
  `S1: A vs B` / `D1: A/B vs C/D` followed by `4-3(7-5), 4-2 (won) TEAM`.

## 6. Weather / penalties
- Full washout: teams reschedule, play and post. Not completed → **0 points** for fixture.
- Non-weather postponement/no-show without mutual agreement → penalty of **4 games (or a set)** deducted;
  match still played later.

## 7. Eligibility (affects valid lineups)
- Regular season: each player plays **min 3, max 6 match days**.
- Max **2 singles** per player.
- Same doubles pair max **3 times** (3 match days / 6 matches).
- Injury replacement: similar UTR or 0.5 lower, committee approval (playoffs: only if 2+ players out).
- Configurable defaults: `maxSinglesDays 2`, `maxTotalMatchDays 6`, `maxPartnerDays 3`.

## 8. Player ratings (PTRX / PTL)
- **PTRX:** per-court rating = opponent rating + 2.0 × (2·gameShare − 1); recency half-life 60 days;
  reliability blend ~20 games for 50% trust; clamped 1.0–16.5; separate singles/doubles.
- **PTL rating (`ptlRating.js`):** expected win = 1/(1+10^((opp−self)/4)); court score =
  win(1/0) + 0.18 × game margin, clamped 0–1; default base 3.5; clamp 1.0–16.5.

## Open questions
1. Which standings tiebreak order is canonical (UI vs backend)?
2. Is the 4-game/set penalty modelled in code? (Not found; rules text only.)
3. Playoff majority: 4 of 7 courts assumed — confirm.
