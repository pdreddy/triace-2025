# Technical review

Scope: Firebase callable authorization and transactions, registration/account lifecycle, database path/rule generation, public/private projections, React subscriptions and admin forms, PWA caching, tests, toolchain pins, and deployment scripts. Changes continue on `codex/tier-card-performance` alongside the earlier performance fixes.

## Confirmed problems fixed

| Priority | Finding and trigger | Change | Regression coverage |
| --- | --- | --- | --- |
| P1 | Visiting `/status` as an admin sent empty commands to live write endpoints. `saveCalendar({})` is a valid reset, not a harmless probe. The password probe also used the active Auth instance. | Diagnostics now receive only read operations and call a dedicated, non-mutating `healthCheck`. They do not attempt sign-in. Provider configuration and per-function deployment remain explicitly unverified. | `tests/unit/setupChecks.test.js`; an additional Firebase integration test is included but requires emulators. |
| P1 | A custom Season 1 path under `withdrawn` could publish names, phone numbers, and ownership data. A tournament root under publicly readable PPRC nodes could inherit public access to all private records. | Block private/local credential namespaces and overlap with the shared public PPRC roots. Reject prototype-sensitive path segments before nested rule construction. | `tests/unit/seasons.test.js`. |
| P1 | `rules:deploy` regenerated the rules immediately before deployment, potentially discarding a previously merged shared-project rules file. | Deployment now requires an explicit project, reviewed merged file, and merge acknowledgement. It checks private subtree permissions and snapshots the validated input before invoking Firebase. Generation and deployment are separate. The old `deploy.sh --rules` path refuses. | `tests/unit/deploy-rules.test.js`. No live rules deployment was performed. |
| P1 | With two simultaneous identical registrations, the request creating Auth credentials could commit second, then delete those credentials as an apparent orphan. An operational error after a successful database commit could also trigger account deletion. | An authorized replay can atomically attach its newly created captain account. Cleanup is limited to definite validation/authorization refusals; uncertain commits retain the account for reconciliation. A newly saved team with in-flight credentials reports `loginPending`. | `tests/unit/registerFlow.test.js` exercises the concurrent interleaving and uncertain commit failure. |
| P2 | The locked Firebase web packages require Node >=24.12, while `.nvmrc`, Netlify, and root engines selected/allowed Node 22. | Align web tooling, lockfile metadata, launcher guards, Netlify, and documentation to Node 24.12–24.x. Functions remain Node 22. | Unit tests/build/preflight run with Node 24; no dependency versions changed. |
| P2 | Impossible early-bird dates could throw a native `RangeError` during validation. | Reject non-finite dates before ISO conversion. | `tests/unit/earlybird.test.js`. |

## Remaining work, in priority order

### P1: strengthen captain credentials and abuse controls

`functions/lib/captainLogin.js:newPassword` combines name-derived text with only four random decimal digits. When the names are known, the remaining search space is 10,000 possibilities. Firebase sign-in throttling helps, but this is a weak long-lived credential.

Use at least 12 randomly generated characters or a reset/invitation flow. Keep existing accounts compatible during migration, then require password rotation. Configure and test App Check and server-side quotas for anonymous registration and partner-board writes; a per-UID limit alone can be bypassed by creating another anonymous identity. Do not enforce App Check until client registration and emulator/deployment tests are prepared.

### P1: complete durable account reconciliation

The concurrent replay and destructive-cleanup bugs are fixed, but Auth and Realtime Database still do not share a transaction. A crash after Auth creation and before registration can leave an account without a team; an uncertain commit may intentionally retain an account. Resetting a captain login can also race with withdrawal.

Introduce an idempotent provisioning record keyed by team ID, track pending/ready/failed states, and reconcile using the actual registration and Auth account before deleting anything. Prevalidate registration before provisioning. Add emulator tests for timeout-after-commit, process interruption, reset versus withdrawal, and simultaneous account creation. Avoid claiming exactly-once behavior from two independent services.

### P1: validate deployed security with Firebase Emulators

Unit tests and the local demo do not exercise Firebase IAM, callable token verification, actual RTDB rules, or Auth revocation. The emulator suite remains blocked by the environment's denied `storage.googleapis.com` download; that domain addition was previously saved in the environment draft.

Apply the network setting, execute `npm run test:rules`, and add the suite to CI. Verify unauthenticated/private-read denials, forged ownership, concurrent registration, revoked admins, and the new health endpoint before production rollout. No live security verification or production deployment has been performed during this review.

### P2: define and enforce admin revocation latency

`functions/index.js:requireAuth` trusts the admin claim in the presented ID token. `removeAdmin` changes claims and revokes refresh tokens, but an already issued ID token can remain usable until expiry unless revocation is checked. RTDB reads need their own revocation design as well.

Choose the required revocation window. For immediate removal, check revoked/disabled identities for privileged callables and use server-maintained revocation timestamps or membership records in RTDB rules. Verify both writes and private reads with a previously issued token.

### P2: reduce transaction contention before scaling

`functions/index.js:mutate` listens to and transacts on the entire tournament root; domain operations clone that state. Withdrawn registrations and archived seasons grow the same tree. Unrelated registrations, scores, board posts, and configuration writes therefore contend and transfer increasingly large snapshots.

Separate immutable history/private archives from active state first. Then move operations to narrower transaction boundaries while preserving atomic invariants, such as tier capacity plus registration placement. Measure retries, root size, latency, and download volume before and after. Capture timestamps and random IDs once per request so transaction retries use deterministic inputs.

### P2: add revisions to admin forms and surface subscription errors

`AdminCalendar` and `EarlyBirdAdmin` synchronize drafts from subscriptions and clear `dirty` after saving. A late snapshot can replace a freshly saved draft, and multiple admins can overwrite each other because these records have no expected-revision check. Several optional Firebase subscriptions silently substitute missing data on errors.

Apply the revision pattern already used by tournament configuration to calendar, early-bird, and league-rule updates. Keep the acknowledged save visible until a matching/newer subscription arrives. Surface unavailable data separately from an empty record; do not offer writable defaults when a saved record has not loaded or cannot be read. Test delayed and out-of-order snapshots without fixed waits.

### P2: make verification repeatable in CI

No GitHub Actions workflow is present. Add separate unit/build, demo-browser, and Firebase-emulator jobs using Node 24 for web tools and Node 22 for the Functions runtime. Cache dependencies and emulator artifacts with versioned keys, preserve test exit codes, and upload failure traces. Require these checks before merging. Keep production deployment separate, with least-privilege credentials and a reviewable target plan.

## Rollout notes

1. Review the source and run local checks on this branch.
2. Run the Firebase integration suite once emulator downloads are available.
3. Deploy `healthCheck` with the backend before or alongside the new frontend. An older backend will show a failed health check rather than falling back to mutating probes.
4. If deploying database rules, generate separately, merge into the existing project rules, and pass the reviewed merged file explicitly. The validator cannot recover or infer unrelated live rules that were omitted by the operator.
5. Monitor pending login provisioning and failed writes after rollout; retain recoverable backups before any later data-model migration.

## Validation evidence

- Unit tests: 197 passed, none failed or skipped.
- Production build, PWA checks, preflight, shell syntax, and `git diff --check`: passed. Preflight's one warning is the absent optional `functions/.env`; configured default paths match.
- Full demo-browser run: 61 passed and two registration cases failed during development-server restarts while source changes were still being made. The complete affected registration spec was rerun against the final code: all 20 passed, including both failed cases. All 63 distinct browser cases therefore have passing results across these runs; a single fresh full-suite pass was not repeated after that focused rerun.
- Production offline/deep-link browser tests: 2 passed.
- Firebase integration tests: not run for the final changes; emulator download remains denied by the enforced environment network policy. The new health endpoint integration test is included for execution once that prerequisite is available.
- Production Functions, Hosting, Netlify, and database rules: not deployed.
