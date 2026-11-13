# PPRC Player Home and Singles Ladder

One app, several formats. `/home` is Player Home; TRIACE 2.0 and the Singles Ladder are active; PO and KOC are reserved
(`/po`, `/koc` show Coming Soon). The Ladder runs on the existing React + Firebase architecture: the reference under
`reference/ladder/` (a FastAPI stub) was used for behaviour only and is not installed or run.

## Routes

| URL | What it is |
| --- | --- |
| `/` → `/home` | Player Home: a card per format. Captain and admin sign-in land here. |
| `/triace` and every earlier TRIACE URL (`/register`, `/tiers`, `/league`, `/team/:id`, `/players`, `/partners`, `/rankings`, `/champions`, `/history`, `/pprc`, `/captain`, `/admin`, `/admin/login`, `/status`) | TRIACE, unchanged, with its own brand and tabs |
| `/ladder` | Standings, your card, your next move |
| `/ladder/matches` | Your active challenges, your history, latest results |
| `/ladder/activity` | Points breakdown, notifications, exemption requests |
| `/ladder/rules` | Rules, written from the season's configuration |
| `/ladder/admin` | Admin dashboard (admins only; enforced on the server). `/ladder/organizer` redirects here |
| `/ladder/2026` | Ladder 2026 as played: champions and playoffs, the four groups with records and results by week. Read-only, built from `scripts/migration/ladder-2026.psv` with names settled by `name-decisions.json`; add new result rows to that file and the page (and the next PPRC refresh) picks them up |
| `/po`, `/koc` | Reserved, Coming Soon |

"All Formats" is in the header of every TRIACE and Ladder page. Netlify (`netlify.toml`) and Firebase Hosting
(`firebase.json`) already rewrite every path to `index.html`, so direct URLs and refreshes work.

## Where the code is

```
src/features/modules.js            the list of formats (add a format: one entry + its routes)
src/features/home/                 Player Home, Coming Soon
src/features/triace/summary.js     what the Home card shows about a captain's team (TRIACE pages stay in src/pages)
src/features/ladder/               LadderContext (data access), selectors (pure), pages, organizer, rules settings
src/services/firebase.js|demo.js   subscribeLadder(path) and ladderAction(payload): the only two ladder calls
functions/lib/singlesLadder/
  config.js                        every business rule: type, limits, INITIAL default, help text, validation, Rules-page text
  time.js                          deadlines in the season timezone (DST-safe); storage is UTC
  engine.js                        applyLadder(state, payload, actor, ctx): all policy, pure, transaction-safe
functions/index.js                 ladderAction (callable) and ladderSweep (hourly)
scripts/ladder-setup.mjs           create a draft season from the real Ladder 2026 roster (dry run by default)
scripts/ladder-dev-fixtures.mjs    DEVELOPMENT ONLY roster for the local demo, emulators and tests
```

Components call `useLadder()`/`act()`; they never touch database paths. The UI and the backend import the same
`config.js`, so a rule value exists in exactly one place. TRIACE pages were not moved: relocating them would have
changed dozens of files for no behaviour change.

## Firebase schema (new, additive)

Everything is under `<root>/ladder` (`<root>` is `VITE_DB_ROOT` / `TRAICE_DB_ROOT`, default `traice2_0`).

```
ladder/
  index/      current, seasons/<seasonId> { name, status: draft|active|frozen|closed, createdAt, activatedAt, closedAt }   public
  public/<seasonId>/                                                                                                    public
    rules            { schema, version, values, updatedAt }          the season's current configuration
    rulesHistory/v<N> { ...rules, actor, reason }                    every version ever saved
    players/<pprcPlayerId>   { name, utr, rank, points, streak, wins, losses, eligible, joinedAt, lastActiveAt, exemptFrom, exemptUntil, ... }
    challenges/<id>  { challengerId, opponentId, status, createdAt, respondBy, acceptedAt, deadline, extensionUntil,
                       ranks {challenger, opponent}, rules { version, values }   <- the snapshot used to judge it
                       result { winnerId, score, kind, submittedBy, submittedAt }, outcome { late, extended, moved, bonuses, points, ranksBefore, ranksAfter } }
    points/<id>      { playerId, amount, type, at, challengeId, rulesVersion, note }   the points ledger
    penalties/<id>   { type: decline|inactivity, playerId, positions, status: pending|applied|waived, rulesVersion, policy {...} }
  private/<seasonId>/
    requests/<playerId>/<id>        exemption / extension requests with the player's reason    that player + admins
    notifications/<playerId>/<id>                                                               that player + admins
  accounts/<firebaseUid> = pprcPlayerId     identity links                                      that account + admins
  audit/<id>  { at (UTC ms), seasonId, action, actor { role, uid, playerId }, reason, target, before, after, rankChanges }   admins only
  ops/<opId>  request ids already applied (pruned after 7 days)                                 nobody
```

Timestamps are UTC milliseconds. Player ids are the existing `pprcMaster/players` ids, so a person is the same person
in TRIACE, the PPRC ratings and the Ladder. Nothing existing is renamed, moved or rewritten.

### Migration plan (non-disruptive)

1. Deploy the Cloud Functions (`ladderAction`, `ladderSweep`) and the merged database rules. No existing node changes;
   `ladder` simply does not exist until an organizer creates a season, and the UI says "No ladder season yet".
2. Create the season: either in `/ladder/admin`, or from the real roster:
   `node scripts/ladder-setup.mjs --database-url <url>` (read-only plan), then add `--write`. It matches the 62 players
   of `scripts/migration/ladder-2026.psv` through `pprcMaster/nameIndex`, seeds by PPRC singles UTR, lists anyone it
   could not match, writes only under `<root>/ladder`, and leaves the season a draft.
3. Review Rules settings, link each player's sign-in, then Open season.
   After deploying, press "Refresh names and UTRs from PPRC" once so players enrolled earlier get their verified status.
4. Rollback is deleting nothing: unpublish the routes or leave the season in draft. TRIACE data is never touched (the
   ladder transaction is scoped to the `ladder` node).

An earlier commit on this branch used `<root>/singlesLadder` and `<root>/ladderAccounts`. I could not check whether
that version was ever deployed. If either node exists in your database, this version ignores it and does not modify
it, and the generated rules no longer make it readable; tell me and I will add an import step.

## Identity

Sign-in is the existing Firebase Email/Password accounts (captain logins and admin accounts); the Ladder creates no
accounts. An organizer links one sign-in to one PPRC player (`ladder/accounts/<uid>`), after confirming with the person;
the player reads their account ID on `/ladder` to pass on. A matching name never grants anything, and a captain's
ability to edit a TRIACE team does not make them that team's players on the Ladder. Every player action is checked
against this link inside the transaction.

**Gap to know about:** TRIACE has logins for captains only. Ladder players who are not captains have no sign-in yet.
Creating player logins (who issues them, how they are delivered) is a decision for you; until then such players can be
enrolled and ranked, and an organizer records their results from the dashboard.

## Rules configuration and versioning

`config.js` defines 14 groups (challenge range, top players, win streak, rematches, responding, deadline, match format,
position changes, late results, extensions, points, declines, inactivity, no-shows). `DEFAULT_RULES` are the initial defaults
and are only used when a season is created; an existing season's rules are never replaced by them.

- **Typed and validated**: every field has a type and limits; unknown or missing fields are refused; contradictory
  combinations are refused (for example a streak that unlocks no more than the normal range, a loss worth more than a
  win, a position drop triggered by a decline that is still free, an inactivity period shorter than the response window).
- **Organizers only**, checked on the server; the settings screen shows help for each rule, validates as you type with
  the same function, and previews the before/after table and the Rules-page sentences that will change. A reason is required.
- **Versioned and audited**: each save is `version + 1`, kept in `rulesHistory`, and audited with actor, UTC time,
  reason and before/after values. Two organizers editing at once: the second is refused and asked to reload.
- **Snapshots**: every challenge stores the rules version and values in force when it was sent, and is judged by that
  snapshot until it ends. Completed results keep it. Each ledger line and each penalty records the rules version (a
  penalty also stores the policy values used). A rule change applies to new challenges only; nothing already recorded
  is ever recalculated.
- **Not configurable**: authentication, organizer authorization, ownership checks, audit logging and data-integrity
  checks. They are code, not settings.

### Defaults that needed a decision (all changeable in Rules settings unless noted)

| Question | Default chosen |
| --- | --- |
| "One active challenge": sent, received, or both? | Both count (`challenge.activeLimit` = 1) |
| When is the deadline set? | On acceptance: the next Sunday 23:59 season time, even if that is tomorrow (`deadline.minDays` = 0) |
| What makes a result late? | The time the score was first reported, not when it was confirmed (fixed) |
| Unanswered challenge | Lapses with no penalty (`response.onExpire` = void; can count as a decline or a walkover) |
| "Swap" | The two players exchange positions (`swap.mode`; alternative: winner takes the place, others shift down) |
| Lower-ranked player beats a downward challenge | Keeps position, earns defense + upset bonus (`swap.lowerDefenderWin`) |
| Upset bonus | By positions when the challenge was sent; the swap uses positions at confirmation (fixed) |
| Rematch cooldown | Also after a declined or lapsed challenge (`rematch.afterUnplayed`) |
| Decline and inactivity position drops ("can trigger") | Raised for an organizer to apply or waive (`*.review`; can be automatic). The 2-point deduction is immediate |
| After a decline drop | The decline count starts again (`decline.resetAfterDrop`) |
| Inactivity clock | From the last completed match, joining, season opening, the end of an exemption, or the last inactivity decision |
| No-show | Reported by the player who was there; an organizer decides (`noShow.requireOrganizer`). 0 points; walkover win 3, no bonuses, positions can change |
| Walkover wins | Count towards a win streak (fixed) |
| Frozen season | Players and automatic rules stop; organizers can still settle disputes and adjust. Closed is permanent |
| Voiding a result | Reverses its points with new ledger lines; positions are moved back only by an explicit organizer adjustment (fixed) |

## How the written specification maps to this implementation

Two parts of the specification were implemented differently on purpose. Both are decisions you can reverse; say so and
I will restructure.

**Data paths.** The specification lists `players/{uid}` and `ladder/seasons/{seasonId}/...` keyed by Firebase uid.
This implementation keys players by their existing PPRC player id and keeps the sign-in link separately, because (a)
only TRIACE captains have sign-ins today, so the 62 real ladder players could not be enrolled under a uid, (b) the
existing player profiles are `pprcMaster/players`, and a new root `players` node in the shared project would duplicate
them, and (c) Realtime Database rules cannot hide a private child under a public parent, so public and private data
live in separate branches.

| Specified path | Where it is |
| --- | --- |
| `players/{uid}` | `pprcMaster/players/{playerId}` (existing) + `ladder/accounts/{uid} = playerId` |
| `ladder/seasons/{seasonId}` | `ladder/index/seasons/{seasonId}` (name, status, dates) |
| `.../rules` | `ladder/public/{seasonId}/rules` (+ `rulesHistory`) |
| `.../entries/{uid}` | `ladder/public/{seasonId}/players/{playerId}` |
| `.../challenges/{challengeId}` | `ladder/public/{seasonId}/challenges/{id}` |
| `.../matches/{matchId}` | the same challenge record: `result`, `outcome` and its rules snapshot (one record per match, so a result can never detach from its challenge) |
| `.../extensions/{extensionId}` | `ladder/private/{seasonId}/requests/{playerId}/{id}` (`type`, `category`, `until`, `reason`, `status`) |
| `.../disputes/{disputeId}` | the challenge record: `status: disputed`, `review`, then `resolution`; the organizer's reasoning is in the audit log |
| `.../auditLog/{eventId}` | `ladder/audit/{id}` with `seasonId` |
| `.../notifications/{uid}/{id}` | `ladder/private/{seasonId}/notifications/{playerId}/{id}` |

Entry fields: `currentRank` → `rank`, `consecutiveLadderWins` → `streak`, `lastMatchAt` → `lastActiveAt`,
`validDeclineCount` → counted from the declined challenges (so the counting window in the rules always applies),
`updatedAt` → the audit entry of the change; `points`, `utr`, `verified`, `eligible`, `wins`, `losses` as specified.

**Commands.** All thirteen specified commands exist as actions of one callable, `ladderAction`, rather than thirteen
separately deployed functions. Each one authenticates the caller, checks role or ownership, validates the season's
rules, applies the change in one transaction, notifies the players involved and writes an audit entry.

| Specified command | `ladderAction` action |
| --- | --- |
| `createChallenge` | `challenge` |
| `respondToChallenge` | `respond` (accept / decline), `withdraw` |
| `expireChallenges` | `sweep` (hourly `ladderSweep`, and "Run time-based checks now") |
| `submitMatchScore` | `submit` (played, or no-show report) |
| `confirmMatchScore` | `confirm`; `dispute` opens a score dispute |
| `resolveScoreDispute` | `resolve` |
| `approveExtension` | `decideRequest` (approve / deny), `grant` |
| `applyWalkover` | `resolve` with `kind: walkover` or `noShow` |
| `applyInactivityReview` | `decidePenalty` (apply / waive the drop raised by `sweep`) |
| `manualRankAdjustment` | `adjust` (position, points, UTR, eligibility, verification) |
| `freezeSeasonStandings` | `setStatus: frozen` |
| `closeSeason` | `setStatus: closed` |
| `exportSeasonData` | CSV built in the admin's browser from data the rules already let an admin read (standings, players, matches, points, audit log) |

**Verified PPRC Player.** Set by the server when a player is enrolled or refreshed, from `pprcMaster/ratings` (any
match on record in TRIACE, KOC or the Ladder), and switched on when a ladder match is confirmed. An admin can change
it with a reason. Everyone else shows "Unverified".

**Match format.** Best of three, no-ad, tiebreak at 6–6, and a 10-point match tiebreak at one set all. Reported scores
are checked against it (a full third set is refused unless Rules settings allow it).

**Reasons.** Every admin action requires a reason (3 to 500 characters) and writes an audit entry; only the automatic
hourly sweep has none. Extension and exemption requests carry one of: injury, travel, weather, court closure, scheduling.

**Sample season.** `scripts/ladder-dev-fixtures.mjs` builds 16 players and an active season through the real engine,
for the local demo and the emulators only.

## Security and authorization

- **Database rules** (`database.rules.template.json` → `npm run rules:generate`): `ladder/index` and `ladder/public`
  are world-readable; `accounts/<uid>` only by that account; `private/<season>/requests|notifications/<playerId>` only
  by the account linked to that player; `audit`, all `private` and `accounts` by admins. There is no `.write` rule
  anywhere: no client, admin included, can write ladder data. Merge these into the shared project's rules as
  described in the README; never add a rule for `clubs/koc`.
- **`ladderAction` callable**: requires a non-anonymous sign-in; resolves the admin role from the live account record
  (the existing `currentAdmin`); looks up names and UTRs itself in `pprcMaster` (the request cannot supply them);
  verifies a linked account exists and is enabled; then runs `applyLadder` in one transaction on `<root>/ladder`.
  The engine checks the organizer role for every organizer action and the identity link for every player action.
- **Atomic and retry-safe**: one transaction per action, so concurrent challenges, confirmations and position changes
  are applied one after another against the latest state; the time and ids are fixed per request so a retried
  transaction computes the same result; each request carries an `opId` and a repeated one is answered without being
  applied twice; a result can only be confirmed once.
- **Audit**: every action writes an entry; position changes are listed as `from → to` per player. Players' own request
  reasons are private and never copied into the audit log or public data. Organizer reasons are visible to admins only.

## Organizer guide

Season: create (initial defaults or a copy of another season's rules), open, freeze, unfreeze, close; "Run time-based
checks now" (also runs hourly). Players: enroll from the PPRC list, seed positions from UTR (before the first
challenge), refresh names/UTRs/verified from PPRC, move position, adjust points, edit UTR, eligibility, verification,
record activity, grant an exemption, link/unlink a sign-in. Matches: decide a result (played, walkover, no-show), extend a deadline, cancel,
void. Requests: approve/deny exemptions and extensions, apply/waive penalties. Rules settings. Audit. Export
(standings, players, matches, points and the audit log as CSV; UTC times; no player request reasons or account ids).

## Local development

```sh
npm run demo            # no Firebase. Sign in at /admin/login, open /ladder/admin, "Create demo season",
                        # then "Sign in as Demo Player N" to act as a player.
```

The demo server (`scripts/demo-plugin.mjs`) runs the same engine and applies the same read rules. Its players come
from `scripts/ladder-dev-fixtures.mjs`, which nothing in `src/` or `functions/` imports: the live site has no demo
roster and no fallback data. With no season, or when the database cannot be read, the UI says so.

Emulators: `npm run emulators`, `npm run seed:emulators`, `node scripts/seed-ladder-emulators.mjs`, `npm run dev:emulators`.

## Tests

```sh
npm test                                  # unit: tests/unit/ladder{Config,Engine,Selectors}.test.js and the rest
npx playwright test tests/browser/ladder.spec.js tests/browser/player-home.spec.js
npm run test:rules                        # emulators: callable authorization, concurrency, database rules
npm run build && npm run rules:check
```

## What could not be verified from the development sandbox

- **Live database**: the sandbox's network policy blocks `multiclub-890ea-default-rtdb.firebaseio.com`, so no live
  path was read (and none written). Whether `pprcMaster/nameIndex` resolves all 62 Ladder 2026 names, and which of
  them have a singles UTR on file, is shown by the read-only run of `scripts/ladder-setup.mjs`.
- **Existing live ladder state**: the Ladder 2026 results in the repo are a group round-robin with playoffs, stored as
  history under `pprcClubs/ladder`. There is no existing challenge-ladder season, ranking, points table or rules node
  to connect to; the new season starts at 0 points, seeded by UTR.
- **Player sign-ins** for non-captains (see Identity).
- **Emulator suite** (`npm run test:rules`) could not run in the sandbox; run it locally or in CI before deploying.
- **Deployment**: functions and rules are not deployed. Until they are, `/ladder` on the live site shows the
  unavailable state.
