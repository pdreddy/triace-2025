# Traice

A mobile-friendly tennis tournament app built with React, Vite, Firebase Authentication, Realtime Database, and callable Cloud Functions. Includes a swipeable rules homepage (`/`), registration (`/register`), public tier lists (`/tiers`), admin login (`/admin/login`), and the protected dashboard (`/admin`).

## Quick local test — no Firebase account required

Use Node.js 22.12+ (Node 24 is also supported for the web app; deployed functions use Node 22).

```sh
npm run setup
cp .env.demo.example .env.demo.local
```

Edit `.env.demo.local` and set `TRAICE_ADMIN_PASSWORD` to a local test password of at least eight characters. Quote values containing `#`, e.g. `TRAICE_ADMIN_PASSWORD="your-local-password"`. Do not prefix this password with `VITE_`; those variables are public browser configuration.

```sh
npm run demo
```

Open the address printed by Vite (default local port 3000). Sign in at `/admin/login` with username **`reddi2026`** and the password you set. In this prepared workspace, `.env.demo.local` already contains the requested temporary local admin password. It is ignored by Git and never sent to the browser.

This mode runs a local server with cookie-based admin sessions, protected APIs, and file persistence in `.local-demo/state.json`. Public responses mask Ace names by default; an admin can publish or hide them by saving the masking setting. It uses exactly the same validation, tier assignment, configuration, and recalculation operations as Firebase Functions. It does **not** use Firebase or establish that your live Firebase project is configured. The banner always identifies it as local demo mode. It binds to loopback and must not be deployed or exposed as a production server.

The local data directory and environment files cannot be served by the Vite server. To reset local test data, stop the server and remove only `.local-demo/`. This deletes local demo registrations, not Firebase data. Demo sessions expire after eight hours or when the server stops. Restart the demo after changing its username or password.

## Automated checks

```sh
npm test
npm run build
```

Install Playwright Chromium once on your own machine:

```sh
npx playwright install chromium
npm run test:browser
```

On a Linux machine with system Chromium, run `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` instead. The browser suite starts its own local demo on port 3100 with an isolated data directory and a test-only password. It tests registration, promotion, public privacy, denied private/admin access, username sign-in, CSV, tier management, safe removal, recalculation, registration closure, sign-out, and mobile layout. It does not touch live Firebase.

`npm run check` runs unit tests, a production build, and browser tests. Browser installation is a prerequisite. Backend rules and deployed callable-function integration are tested separately using Firebase Emulators below.

## Firebase Emulators — real local Firebase integration

Install Java **21+** and use Node **22** for Functions runtime parity. Run `npm run setup` first. Firebase CLI must be able to download its emulator JAR from `storage.googleapis.com`.

Terminal 1:

```sh
npm run emulators
```

Terminal 2: set a local-only seed password securely, then initialize the emulator admin and default configuration:

```sh
# Bash: input is hidden and is not written into shell history.
read -rsp "Local emulator admin password: " TRAICE_ADMIN_PASSWORD
export TRAICE_ADMIN_PASSWORD
npm run seed:emulators
unset TRAICE_ADMIN_PASSWORD
npm run dev:emulators
```

The seed script always targets the **demo-traice-2** project and loopback emulators, never the supplied live project. It creates or updates `reddi2026@traice.local`, grants the admin custom claim, initializes default settings only if no tournament exists, and preserves existing registrations. Restarting emulators without import/export resets emulator data. All browser emulator configuration is in `.env.emulator`; it overrides `.env.local` for this mode. Do not put real credentials into it.

Emulator ports: Auth 9099, Realtime Database 9000, Functions 5001. The Vite app remains on port 3000. Only loopback hostnames and a `demo-` project are accepted in emulator mode.

To run the full Firebase rules and callable integration suite with automatic emulator startup/shutdown:

```sh
FIREBASE_EMULATORS_PATH=/tmp/traice-emulators XDG_CONFIG_HOME=/tmp/traice-config npm run test:rules
```

For Windows PowerShell, set these optional cache variables using `$env:NAME='value'` or omit them if your home cache is writable. Tests create demo users, seed isolated tournament data, test private-read restrictions/direct-write denials, call the actual registration/configuration/recalculation functions, and inspect resulting records. The test runner runs these files sequentially to avoid shared-emulator resets racing.

**Validation in this cloud:** the local demo end-to-end suite, domain tests, and production build have been executed. Downloading the Firebase Database Emulator is currently blocked by the runtime network policy; the Firebase integration suite has not been executed here. Required network changes are saved in the environment draft. This is not a claim of a live Firebase deployment or verified live security.

## Live Firebase configuration

1. Choose your project (the supplied public configuration uses `multiclub-890ea`). Enable Realtime Database and Firebase Authentication **Email/Password** and **Anonymous** providers. Anonymous users can register through the callable backend; Email/Password is for admin sign-in. Add the deployed hostname to Authentication’s authorized domains.
2. Copy `.env.example` to `.env.local` and fill the seven `VITE_FIREBASE_*` values from Project settings → Your apps → SDK setup. Firebase web app identifiers are public, not admin credentials. The supplied values are already present in the ignored `.env.local` of this prepared workspace. Never put service-account keys or passwords in any `VITE_` variable. Leave `VITE_USE_EMULATORS=false` for production.
3. In Authentication → Users, manually create the initial account `reddi2026@traice.local` with the requested **temporary** password `Winter#2026!`. Do not add the password to frontend code. Use a unique replacement before a public launch.
4. Grant that user the **admin custom claim** from a trusted owner terminal. Configure Google Application Default Credentials there (`gcloud auth application-default login`, or a platform-managed service identity). With `GOOGLE_CLOUD_PROJECT` set to your project, run:

   ```sh
   GOOGLE_CLOUD_PROJECT=multiclub-890ea node scripts/grant-admin.cjs reddi2026@traice.local
   ```

   The helper preserves other custom claims. It requires an owner/IAM identity authorized for Firebase Authentication management. Do not download or commit service-account keys. Sign out/in to refresh the claim. An email address or hidden dashboard alone does not grant admin privileges.
5. The login form maps the public alias in `VITE_ADMIN_USERNAME` (default `reddi2026`) to `VITE_ADMIN_EMAIL` (default `reddi2026@traice.local`). It also accepts a full email address. No password is hardcoded in browser source.
6. Enable the billing plan required for deploying Cloud Functions, select the correct project in Firebase CLI, and review the rules and functions before deployment. All client writes go through server-validated functions; direct Realtime Database writes are denied even to admin browser clients.

### Build and deploy

```sh
npm run setup
npm run check
# Run npm run test:rules where emulator downloads are available.
npx firebase login
npm run build
npx firebase deploy --project multiclub-890ea --only functions:traice,hosting
```

`dist/` is the production static app; Firebase Hosting rewrites routes to `index.html`. Never deploy Vite’s dev server, demo mode, `.env` files, or `.local-demo/`.

Deploy database rules after merging them with the shared project’s existing rules. **Do not blindly replace a shared database’s rules with this repository’s whole rules file.** Preserve other apps’ paths, and ensure no permissive parent read/write grants cover `traice2_0`. RTDB permissions cascade; a public root read would expose private records despite restrictive child rules. After reviewing the merged file, deploy it with:

```sh
npx firebase deploy --project multiclub-890ea --only database
```

The supplied project’s previous rules, users, billing, functions and hosting have not been changed by this work. Before going live, execute the Firebase integration suite, verify the merged rules, test the real admin account and an authorized registration, and confirm public name visibility follows the saved masking setting.

Once deployed, sign in and **Save configuration** in the admin dashboard to initialize a fresh tournament. Existing settings are not overwritten during deployment. Do not deploy over incompatible legacy data without a reviewed migration and backup.

### Change admin credentials safely

- Use Firebase Console Authentication → Users to change the admin email or trigger a secure password-reset flow. Revoke refresh tokens if compromise is suspected. Keep the same user UID to preserve its custom claim, or grant the claim to the new account and revoke it from the old account using a trusted Admin SDK owner session.
- Change `VITE_ADMIN_USERNAME` / `VITE_ADMIN_EMAIL`, rebuild, and redeploy to change the login alias. The alias is not an authorization boundary.
- For demo mode, edit `TRAICE_ADMIN_USERNAME`, `TRAICE_ADMIN_EMAIL`, and `TRAICE_ADMIN_PASSWORD` in `.env.demo.local`, then restart the server (which invalidates demo sessions).
- For emulators, reseed with a new local password. It updates the same emulator account and preserves tournament records.

## Database model and privacy

Realtime Database forbids dots in node keys. The requested logical root `traice2.0` therefore uses **`traice2_0`**:

```text
traice2_0/
  settings/                 registrationEnabled, aceNameMaskingEnabled,
                            minPlayerUtr, maxPlayerUtr
  configRevision            optimistic configuration concurrency version
  tierConfig/{tierId}/      name, minCombinedUtr, maxCombinedUtr, sortOrder, active
  registrations/{teamId}/   captain, ace1, ace2, combinedUtr, selectedTier,
                            assignedTier, registeredAt, ownerUid, teamId
  tiers/{tierId}/teams/{teamId}/
                            captainFirstName, captainUtr, ace1Utr, ace2Utr,
                            combinedUtr, assignedTier, registeredAt, teamId
```

All UTR values are **integer hundredths** (`1700` = 17.00), including tier configuration. UI, CSV, and messages display normal decimal UTR. This makes range endpoints exact. A player supplies a required UTR/singles rating and an optional doubles rating; the higher counts. The captain supplies a first name only. Ace full names remain in private registrations and appear in public tier records only when the admin disables masking. Anonymous browser authentication supplies the owner UID server-side; clients cannot choose it.

The public projection contains no owner UID. Ace names appear only when the saved masking setting is off; saving the setting immediately rebuilds public name visibility for registrations made with the current name-publication consent. Earlier registrations remain masked. Public pages read only `settings`, `tierConfig`, `configRevision`, and `tiers`. Private records are readable only with `admin: true`. The `registerTeam` callable authenticates an anonymous or signed-in user and validates their payload before atomically creating both records. `saveConfiguration` and `recalculateTiers` require an admin claim. Direct client writes are denied, so clients cannot bypass assignment validation, alter settings or inject names into public records. This intentionally enforces registration creation through the backend rather than permissive direct-write rules.

The server transaction creates or moves both private/public representations in one commit. Retrying the same team ID with the same payload and owner is idempotent. New registrations use new random IDs, so an anonymous user can register more than one team. Anonymous auth alone is not an anti-spam identity check; enforce appropriate Firebase quotas/App Check or event-specific admission controls before a public event. Full tournament transactions are suitable for a small event; assess transaction size/contention before scaling to very large datasets.

Masking enabled means admin cards hide Ace names by default, with an authenticated reveal control/private details. Masking disabled shows names in the admin dashboard. **Public pages never disclose Ace names in either mode.** CSV includes all private names and is available only to an authenticated admin who has private-record read access. Spreadsheet formula prefixes are escaped.

## Tier assignment and administration

- Exactly three players. Every required UTR must be numeric, positive, and within configured individual bounds (default 0.01–16.50); at most two decimal places.
- Defaults: GOAT 17.00–22.00, Rising 11.50–16.50, inclusive.
- Options are all active tiers plus “Interested in a higher UTR tier.” A GOAT-qualified team may enter GOAT, Rising, or both public lists; a Rising-qualified team cannot enter GOAT. The higher-tier option assigns the highest eligible tier. Recalculation preserves the chosen tier when still eligible.
- For overlaps, lower `sortOrder` is higher priority; each tier must have a unique order. Tier IDs are immutable; names, ranges, order, and active status are editable. Up to 20 tiers are supported.
- Totals in gaps or outside all active ranges cannot register. Existing teams can become **Unassigned** after a configuration change and recalculation; they stay in private records and disappear from public tier paths.
- Saving masking changes immediately updates public name visibility. Use **Recalculate Tiers** after changing ranges or active tiers to update existing teams. It rebuilds the entire public tier tree from private registrations, removes stale entries, updates private assignments, and returns reviewed/moved/unchanged/unassigned counts. `moved + unchanged = reviewed`; `unassigned` is a subset that may include unchanged unassigned teams.
- To remove a populated tier safely: deactivate it, save, recalculate, then remove it and save again. Removal is checked on the server, not just disabled in the UI.
- Config revisions reject stale writes from another admin session. Reload saved settings to resolve a conflict rather than silently overwriting someone else’s changes.

## Source organization

- `src/pages/`: registration, public tier list, login, dashboard.
- `src/components/`: shared fields, messages, privacy-aware team cards.
- `src/hooks/`: authentication, public tournament and private-registration subscriptions.
- `src/services/`: Firebase and local demo adapters.
- `functions/lib/tournament.js`: shared pure validation, assignment, atomic state transformations, and CSV logic.
- `functions/index.js`: authenticated callable endpoints and atomic database transactions.
- `scripts/`: local demo server plugin, emulator seed, trusted admin-role helper.
- `tests/unit/`, `tests/browser/`, `tests/firebase/`: domain, local end-to-end, and real emulator integration checks.

## Rules homepage and mobile installation

The homepage presents the uploaded match and playoff rules as swipeable cards with a reduced-motion-aware flash transition. Tier ranges come from saved admin settings so the page stays accurate. Registration requires a separate rules acceptance checkbox, validated again by the backend. The supplied challenge rule remains marked provisional. The web app includes a manifest and production-only service worker for installation and offline access to the app shell; registration still requires a live connection.
