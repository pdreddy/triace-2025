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
- **Admin revocation (callables):** every admin function now checks the account record, not just the token's `admin` claim
  (`functions/lib/adminAccess.js`): the claim must still be set, the account enabled, and the token issued after the last session
  revocation. Removing an admin takes effect on their very next call. Reading *private* registrations straight from the database is
  still decided by the token in the security rules, so a removed admin can keep reading until their ID token expires (at most one
  hour). Closing that gap needs a rules-side revocation list; not done.
- **Transaction inputs and measurement:** the time and random ids for a request are fixed once, so every retry computes the same
  result. Retries and slow transactions are logged (`Tournament transaction`, with attempts, elapsed ms and root size on a retry), so
  contention can be measured from the function logs before the data model is changed.
- **Admin form revisions:** calendar, early bird and league rules carry a `revision`; a save names the revision it was based on and a
  stale save is refused ("changed in another session"). The forms keep the acknowledged save on screen until a matching or newer
  snapshot arrives, show a conflict banner with "Discard my changes and reload", and turn saving off when the saved record could not
  be read (instead of offering writable defaults). A request without a revision is still accepted so an older page keeps working
  during a rollout.

## Open items, in priority order
1. **Captain passwords** (`functions/lib/captainLogin.js`): name-derived text plus four random digits is a weak credential.
   It is deliberately guessable today so captains can recover it, so changing it needs a product decision (random 12+ characters
   plus a reset flow) and a migration that keeps existing accounts working.
2. **Registration accounts**: Auth and the database do not share a transaction. Add a provisioning record per team and
   reconcile before deleting anything.
3. **Transaction contention (data model):** every update still transacts on the whole tournament root, and that root includes Season 1
   (`traice2_0/season1`), archived seasons and withdrawn registrations. Plan: move immutable history to a sibling path outside the
   transaction root (rules, the History pages and the Season 1 import follow), then narrow the transactions that do not need
   cross-record atomicity. Do this with the emulator suite and a backup; look at the `Tournament transaction` log lines first.
4. **Private-read revocation latency** (see above): rules-side revocation list.
5. **Emulator suite** (`npm run test:rules`) is not run in CI yet: it needs the emulator download.
6. **firebase-functions** is one major version behind; upgrade separately with its breaking changes reviewed.
