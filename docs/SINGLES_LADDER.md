# Player Home and Singles Ladder

The root `/` redirects to Player Home at `/home` for all visitors; `/triace` opens the existing TRIACE rules and all prior TRIACE routes remain available. Successful captain and admin sign-in opens Player Home. All Formats stays in the main navigation. PO and KOC are visibly Coming Soon.

## Architecture and identity

This implementation adapts the policy in `reference/ladder/backend/app/rules.py` to the existing React/Firebase architecture. It does not install or run the reference Python application, whose API endpoints are largely placeholders. No frontend design files were supplied under the reference directory.

UI: `src/pages/Home.jsx`, `src/pages/SinglesLadder.jsx`. Subscription/action state: `src/hooks/useSinglesLadder.js`. Firebase transport: existing `src/services/firebase.js`. Server business policy: `functions/lib/singlesLadder.js`. Callable entry point: `singlesLadderAction` in `functions/index.js`.

The configured tournament root contains `singlesLadder/{status,rules,entries,challenges,audit}` and private `ladderAccounts/{firebaseUid}: canonicalPprcPlayerId`. Enrollment resolves names from existing `pprcMaster/players`; clients cannot choose authoritative names or ranks. Organizers verify account ownership outside the app and explicitly link an existing enabled Firebase sign-in account. A captain's ability to edit multiple team members does not grant those members' Ladder identities. Links are one account per player and are never inferred by spelling. Players can copy their own UID from the dashboard. Existing captain usernames/passwords and admin detection are reused; no account creation or password copying occurs in Ladder.

Public Ladder data contains names, canonical IDs, results, standings and audit entries. Account UIDs stay in the separate private mapping. Do not enter private medical/contact information in organizer decision reasons: audit reasons are public. Direct writes to both nodes are denied even for admin clients. The callable checks the current Firebase admin account through existing `currentAdmin`, rejects anonymous sign-ins and runs mutations in the existing root transaction. IDs and request time are fixed before transaction retries. Confirmed results cannot be applied again. No production data has been read or changed by this implementation.

## Policy and assumptions

- One current season is supported at the configured root. Start in draft, enroll canonical players, link verified accounts, then open. Closed seasons are immutable; export the JSON with audit history before any future season migration. Multi-season archival is future work.
- Initial ranks follow organizer enrollment order. Organizers may adjust rank or approve up to 90-day exemptions with a reason while no match is active. Rank changes shift intervening players to preserve unique contiguous positions.
- Top three players may challenge within three ranks in either direction. Others challenge up three ranks; two consecutive wins unlock any higher rank. Both players must be available and not exempt. Rematches require 14 days, measured from completion (creation for an unfinished challenge).
- Players have 48 hours to respond. Overdue pending challenges can explicitly be expired by a participant or organizer; no background job or automatic punishment is assumed. First decline is free; each subsequent decline costs two points and drops one position when possible. Declines are season cumulative.
- Challenge creation snapshots rules and initial ranks. The match deadline is the end of the current Chicago Sunday, including DST. A challenge near Sunday may have a response window beyond its play deadline; organizer-approved extensions handle this case. Extensions require a participant request and organizer approval, at most 14 days beyond the original deadline.
- Scores are best of three, entered from the challenger's side, including an optional deciding match tiebreak such as `6-4 3-6 10-8`. The selected winner must agree with the score. The submitting player cannot confirm their own result. Disputes freeze points until an organizer selects a winner and records a reason. Walkovers and retirements require organizer cancellation/rank decisions; they are not recorded as played scores.
- Confirmation awards three winner points, one challenge/defense bonus and one upset bonus if the winner started below the opponent; late submission loses bonuses. Loser receives one point. Only an upward challenger victory moves the winner into the opponent's rank, shifting intervening players down. A defending winner keeps position. Two-week inactivity is displayed, with no automatic demotion assumed.
- Results remain independent of historical PPRC rating imports. This change does not feed unreviewed live Ladder results into the master rating calculation.

## Local testing

Navigation only, without Firebase:

```sh
npm run demo
# Open the URL Vite prints, then /home, /triace and /ladder.
```

Demo mode previews navigation; match operations require Firebase emulators. The dashboard explicitly reports this limitation in demo mode.

Full local Ladder, using the existing emulator configuration and a `demo-` project only:

```sh
# Terminal 1 (requires Java and installed functions dependencies)
npm run emulators

# Terminal 2
TRAICE_ADMIN_PASSWORD=local-testing-password npm run seed:emulators
node scripts/seed-ladder-emulators.mjs
npm run dev:emulators
```

Open the Vite URL at `/captain`. Sign in as `ladder4` with password `ladder1234`; challenge `Demo Player 2`. In a separate browser profile sign in as `ladder2`, accept, then submit or confirm a result. Switch back to the other player to confirm; check standings and the audit export. Admin login is `reddi2026` with the password you selected above; Player Home links to TRIACE administration and the Ladder dashboard reveals organizer controls. The Ladder seed refuses to replace an existing local ladder, preserves other tournament state and hardcodes loopback emulators and `demo-traice-2`. Newly created player passwords are local fixtures only.

Checks:

```sh
npm test
npm run build
npm run rules:check
npx playwright test tests/browser/player-home.spec.js
npm run test:rules
```

Do not run emulator tests against an emulator holding work you want to keep: existing integration tests clear test data. Start an isolated emulator when ports are occupied. Integration tests accept `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_DATABASE_EMULATOR_HOST` and `FIREBASE_FUNCTIONS_EMULATOR_HOST` for isolated ports. No deployment is part of local testing. New callables and database rules must eventually be reviewed and deployed together through the repository's existing deployment process before live Ladder operations can work.

Verification for this change: 253 unit tests, 13 isolated Firebase callable/security tests and 2 Player Home navigation/login browser tests passed; production build and generated rules consistency passed. The full historical browser/PWA suite was not run.
