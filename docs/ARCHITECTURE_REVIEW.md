# Architecture review

## Changed in this branch
- **One command to go live:** `bash ship.sh` (install, tests, build, deploy functions). `--hosting` also publishes to Firebase
  Hosting, `--data` also rebuilds and loads the PPRC data, `--dry-run` checks everything and deploys nothing.
- **PPRC list downloaded once:** `fetchPlayerList` caches the shared list for five minutes (the directory, profile ranks,
  Champions names and admin all used to download it separately). Admin always asks for a fresh copy. Failures are never cached.
- **CI:** `.github/workflows/ci.yml` runs unit tests, build and PWA checks on Node 24, then the browser tests, and uploads the
  report when they fail. Make the `unit-and-build` job a required check on `main`.
- **Cleanup:** unused imports and exports removed (`React` in main, `Icon` in Admin, `publicRecord`, `statSync`, `MATCHES`,
  `POINTS_PER_WIN`).

## Open items, in priority order
1. **Captain passwords** (`functions/lib/captainLogin.js`): name-derived text plus four random digits is a weak credential.
   It is deliberately guessable today so captains can recover it, so changing it needs a product decision (random 12+ characters
   plus a reset flow) and a migration that keeps existing accounts working.
2. **Registration accounts**: Auth and the database do not share a transaction. Add a provisioning record per team and
   reconcile before deleting anything.
3. **Admin revocation**: a removed admin keeps working until their ID token expires. Decide the window; for immediate removal
   check revoked/disabled identities in privileged callables.
4. **Transaction contention**: `mutate` transacts on the whole tournament root. Separate archives from active state, then narrow
   the transactions.
5. **Admin forms** (calendar, early bird, league rules): add expected-revision checks and show load errors separately from
   empty data.
6. **Emulator suite** (`npm run test:rules`) is not run in CI yet: it needs the emulator download.
7. **firebase-functions** is one major version behind; upgrade separately with its breaking changes reviewed.
