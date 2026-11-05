# Build prompt: Triace 2.0 league app

A prompt for Claude (or another coding agent) to build the complete Triace 2.0 app on a new
branch, with every league rule configurable in the Admin tab. Most of it already exists on
`claude/redesign-v3`; the main extra work is making match formats, scoring order and rating
settings configurable.

```text
You are working in the GitHub repo pdreddy/triace-2025 (React + Vite front end, Firebase
Realtime Database + Cloud Functions back end, Netlify hosting, local demo mode via
`npm run demo`). Create a new branch from main named `feature/triace-league-v2` and build the
complete Triace 2.0 tennis league app described below. Commit in logical steps, push the
branch, and open a pull request when done.

## Goal
A complete league app for three-player tennis teams, covering registration, rules, fixtures,
score submission, standings, playoffs, player ratings and season history.
EVERY rule must be configurable by the admin in the Admin tab. Nothing about the league
format may be hard-coded; code holds only defaults.

## Non-negotiable engineering rules
- One design system: a single stylesheet (src/styles/app.css) with CSS variables. No inline
  styles anywhere (`style=` must not appear in src). Self-hosted fonts (Barlow Condensed for
  display, Inter for body). Dark navy + tennis-ball lime theme, sporty look.
- Mobile-first: bottom tab bar on phones, every key screen usable on a 375×667 phone.
- PWA: manifest, service worker with offline page, install prompt, "update ready" banner.
- All league logic lives in pure, unit-tested functions under functions/lib/ (shared by Cloud
  Functions and the local demo server). The front end never trusts itself: every write goes
  through a Cloud Function that re-validates.
- Runs on Firebase free tiers except Cloud Functions (Blaze plan).
- Tests: Node unit tests for all logic (`npm test`) and Playwright browser tests for every
  main flow (`npx playwright test`, demo mode). Both must pass before you push.
- Accessible: labels on every input, keyboard navigation, reduced-motion support.

## 1. Admin configuration (everything editable, saved to the database)
Build an Admin tab with sections; each setting validates on the server and takes effect
everywhere immediately (rules cards, registration, standings, playoffs, ratings).
- Registration: open/closed, individual UTR min/max, Ace-name masking on/off, consent text.
- Tiers: add/rename/remove/reorder tiers, min/max combined UTR, active flag, tier artwork.
- Player rating rule: higher of singles/doubles, with a configurable gap above which the
  average is used instead (default 1.75).
- Team size and roles: default 3 players (Captain, Ace 1, Ace 2); configurable labels.
- Round-robin match format: configurable list of matches per encounter (type, order, label)
  and lineup rules (default: Doubles 1 any pair, Doubles 2 = third player + one Doubles 1
  player, Singles = the player left out). Encounter winner = majority.
- Playoff match format: configurable list (default best of 5: Doubles 1, Singles 1,
  Doubles 2, Singles 2, Super tiebreak only at 2–2), "first to N" stop rule, who plays the
  tiebreak.
- Scoring: points per win, per loss/draw, tiebreak order (match difference, matches won,
  combined UTR, head-to-head).
- Playoffs: team-count threshold, spots above/below it (2, 3 or 4), bracket shape.
- Singles minimum for playoff eligibility: percentage of match days, rounding rule.
- Challenge rule: on/off, challenger places, target places, uses per season, cutoff (last N
  rounds), on-time requirement, outcome (swap places).
- Calendar: per tier start date, days per round, per-fixture deadline override, deadline
  timezone rule.
- Score approval: captain submissions need admin approval (on/off), who may submit.
- Rating engine: starting rating source, K-factors per match type, spread constant;
  a "recompute all ratings" button.
- Season: rename, close season (archive), start next season.
Show an "unsaved changes" bar and a per-section Save; protect against two admins overwriting
each other (revision check).

## 2. Rules (public)
Native React swipeable flash cards generated from the saved configuration (no iframe, no
hard-coded numbers). Progress bar, Next/Previous, dots, keyboard arrows, a racquet-and-
bouncing-balls animation on card change. Visitors must view every card and tick "I agree"
before Register unlocks.

## 3. Registration
Step-by-step form (Tier → each player → Confirm) with a live preview: each player's counted
UTR ("AVG" tag when averaged), combined UTR, SVG tier meter, assigned tier, and the exact
reason when registration is unavailable. On success show the captain's generated username and 8-character password once (copy, download, print;
the captain confirms it is saved) and links to the team page.

## 4. Captains and teams
- Captain = the device that registered, plus any device signed in with the team's username and password (`/captain`).
- The admin sees each team's username and can reset its password.
- Captains can edit or withdraw their team until fixtures exist; the admin can at any time
  (tier changes blocked once fixtures exist; withdrawal removes unplayed fixtures and its
  results stop counting; keep a private archive).
- Team page: players with counted UTR and live rating, record, position, fixtures, and a
  per-player singles-minimum tracker.

## 5. League play
- Admin generates a round-robin schedule per tier (circle method, byes for odd counts),
  dated from the tier calendar.
- League page per tier: Standings, Fixtures (by round with dates, due/overdue/late badges,
  "only my team" filter), Challenges, Playoffs.
- Score entry: each side picks its lineup; the form shows who plays each match and follows
  the configured format. Captain submissions wait for admin approval; admin entries are
  final; on-time is judged by first submission.
- Standings use the configured points and tiebreaks, show form (last 5), mark the playoff
  line and challenge swaps.

## 6. Playoffs
Admin maps the bracket manually (size and team per seed slot, prefilled from standings,
warnings for players below the singles minimum). Winners advance automatically; correcting a
feeder result resets later rounds.

## 7. Players and ratings
A league rating ("Triace rating", clearly not an official UTR) seeded from counted UTR and
updated after every approved match from games won vs. the rating-gap expectation. Players
page (rank, search, tier filter, sort) and player profiles (SVG rating trend,
singles/doubles record, match history with partners, opponents, scores, rating change).

## 8. Seasons and history
Closing a season (type the season name to confirm) stores a public snapshot (teams, fixtures,
standings, bracket, champions, rules used) and a private registration archive, then clears
the season. /history lists past seasons; each season page shows standings and the bracket.

## 9. Security and data
Database rules: public read only for public league data; each registration readable by its
own captain devices and the admin; private archive admin-only; all writes via Cloud
Functions. Admin access via a Firebase custom claim (script to grant it). Public Firebase web
config in .env; never commit secrets or passwords.

## Definition of done
- Every setting in section 1 is editable in Admin and visibly changes behaviour.
- `grep -rn "style=" src` returns nothing.
- `npm test` and `npx playwright test` pass, including browser tests for: rules gate,
  registration with averaging, captain login on a second device and admin reset, captain edit/withdraw,
  admin config reflected in rules cards, fixtures with dates, score submission with lineups
  and approval, a challenge swap, manual playoffs to a champion, closing a season and
  viewing history.
- README documents every feature, every setting and the deploy steps
  (`firebase deploy --only functions,database`, granting the admin claim).
- Desktop (1440×900) and phone (390×844) screenshots of every main screen on the PR.
```
