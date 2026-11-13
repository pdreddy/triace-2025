# Traice

A mobile-friendly tennis tournament app built with React, Vite, Firebase Authentication, Realtime Database, and callable Cloud Functions. Includes a swipeable rules homepage (`/`), registration (`/register`), public tier lists (`/tiers`), admin login (`/admin/login`), and the protected dashboard (`/admin`).

## PPRC Player Home and Singles Ladder

The app opens at `/home` (Player Home) with a card for each format: TRIACE 2.0 and the Singles Ladder are active, PO and
KOC are reserved. TRIACE keeps every earlier URL. The Ladder (`/ladder`, organizer tools at `/ladder/admin`) has
per-season configurable rules enforced by the `ladderAction` Cloud Function. Setup, Firebase schema, identity mapping,
rules configuration and versioning, security rules, deployment order and tests are in
[docs/SINGLES_LADDER.md](docs/SINGLES_LADDER.md). To create a draft season from the real Ladder 2026 roster:
`node scripts/ladder-setup.mjs --database-url <url>` (a read-only plan; add `--write` to create it).

## Quick local test — no Firebase account required

Use Node.js 24.12+ (below 25) for the web app and tooling; deployed Functions use Node 22. The locked Firebase web SDK requires Node 24.12 or newer.

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

Install Java **21+** and retain Node **22** for Functions runtime parity; web tooling uses Node **24.12+**. Run `npm run setup` first. Firebase CLI must be able to download its emulator JAR from `storage.googleapis.com`.

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
2. The live project's public web configuration is committed in `.env` (the same values as `netlify.toml`), so `npm run dev` connects to the live project with no setup. To point at a different Firebase project, copy `.env.example` to `.env.local` and fill the seven `VITE_FIREBASE_*` values from Project settings → Your apps → SDK setup; `.env.local` overrides `.env`. Firebase web app identifiers are public, not admin credentials. Never put service-account keys or passwords in any `VITE_` variable. Leave `VITE_USE_EMULATORS=false` for production.
3. In Authentication → Users, create the initial account `reddi2026@traice.local` with a **unique password you choose** (12+ characters). If the account already exists and you are unsure of its password, set a new one with `scripts/set-admin-password.cjs`. Never put the password in frontend code, the README or a commit.
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
npm run rules:deploy -- --project multiclub-890ea --rules /path/to/reviewed-merged.json --confirm-merged
```

The supplied project’s previous rules, users, billing, functions and hosting have not been changed by this work. Before going live, execute the Firebase integration suite, verify the merged rules, test the real admin account and an authorized registration, and confirm public name visibility follows the saved masking setting.

On first visit, the deployed `bootstrapTournament` callable initializes default registration settings and GOAT/Rising tiers if the tournament settings do not exist. Visitors do not need an admin to press Save. It preserves existing configuration and refuses to initialize over existing team data that needs review. Deploy the callable functions before the Netlify web build goes live; Netlify alone cannot initialize Firebase.

### Change admin credentials safely

- Use Firebase Console Authentication → Users to change the admin email or trigger a secure password-reset flow. Revoke refresh tokens if compromise is suspected. Keep the same user UID to preserve its custom claim, or grant the claim to the new account and revoke it from the old account using a trusted Admin SDK owner session.
- Change `VITE_ADMIN_USERNAME` / `VITE_ADMIN_EMAIL`, rebuild, and redeploy to change the login alias. The alias is not an authorization boundary.
- For demo mode, edit `TRAICE_ADMIN_USERNAME`, `TRAICE_ADMIN_EMAIL`, and `TRAICE_ADMIN_PASSWORD` in `.env.demo.local`, then restart the server (which invalidates demo sessions).
- For emulators, reseed with a new local password. It updates the same emulator account and preserves tournament records.

## Firebase project and database paths

Season 2 (the live tournament and its closed seasons) and Season 1 (the imported legacy season) are stored in **one Firebase project**.

| Setting (web app, `.env.local`) | Setting (functions, `functions/.env`) | Default |
| --- | --- | --- |
| `VITE_DB_ROOT` | `TRAICE_DB_ROOT` | `traice2_0` |
| `VITE_DB_SEASON1_PATH` | `TRAICE_DB_SEASON1_PATH` | `<root>/season1` |

- Keep the web and functions values equal, then rebuild and redeploy. Paths use letters, numbers, `-` and `_`, separated by `/`.
- **Season 1 can never overlap live data.** The import replaces everything at its path, so the app, the functions and `npm run preflight` all refuse a Season 1 path that is the root, contains the root, or sits inside a tournament node (`settings`, `tierConfig`, `configRevision`, `tiers`, `registrations`, `teamsByOwner`, `fixtures`, `leagueRules`, `season`, `seasons`, `schedules`, `archive`). The function also refuses to overwrite anything at the path that is not a previous Season 1 import.
- **Rules follow the paths.** `database.rules.json` is generated from `database.rules.template.json`; do not edit it by hand. After changing a path run `npm run rules:generate` (it reads `VITE_DB_*` from `.env`, `.env.local` and the shell), merge the result into the shared project's rules, then `npm run rules:deploy`. `npm run rules:check` and `npm run preflight` fail if the committed rules do not match the configured paths, and the app shows a clear message if the database rejects reads on its root.
- **Admin → Firebase & data paths** shows the project, both paths and where Season 1 is loaded from. Until it is copied into Firebase, Season 1 uses the snapshot bundled with the app; **Copy Season 1 into Firebase** (admin only, calls `importSeason1`) writes it to the Season 1 path, after which the live copy is used.
- Redeploy functions (`firebase deploy --only functions,database`) to get `importSeason1` and the `season1` read rule.

## Database model and privacy

Realtime Database forbids dots in node keys. The requested logical root `traice2.0` therefore uses **`traice2_0`**:

```text
traice2_0/
  settings/                 registrationEnabled, aceNameMaskingEnabled,
                            minPlayerUtr, maxPlayerUtr
  configRevision            optimistic configuration concurrency version
  tierConfig/{tierId}/      name, minCombinedUtr, maxCombinedUtr, sortOrder, active
  registrations/{teamId}/   captain, ace1, ace2, whatsappPhone, ace1Phone, ace2Phone, combinedUtr, selectedTier,
                            assignedTier, registeredAt, ownerUid, teamId
  tiers/{tierId}/teams/{teamId}/
                            captainFirstName, captainUtr, ace1Utr, ace2Utr,
                            combinedUtr, assignedTier, registeredAt, teamId
```

All UTR values are **integer hundredths** (`1700` = 17.00), including tier configuration. UI, CSV, and messages display normal decimal UTR. This makes range endpoints exact. A player supplies a required UTR/singles rating and an optional doubles rating; the higher counts, unless the two are more than 1.75 apart, in which case their average counts (rounded to the nearest hundredth, `playerUtr` in `functions/lib/tournament.js`). Default tiers are Rising 11.50–17.50 and GOAT 17.50–22.00; a combined 17.50 goes to GOAT by tier order. The captain supplies a first name only. Ace full names remain in private registrations and appear in public tier records only when the admin disables masking. Anonymous browser authentication supplies the owner UID server-side; clients cannot choose it.

The public projection contains no owner UID or player phone numbers. Ace names appear only when the saved masking setting is off; saving the setting immediately rebuilds public name visibility for registrations made with the current name-publication consent. Earlier registrations remain masked. Public pages read only `settings`, `tierConfig`, `configRevision`, and `tiers`. Private records are readable only with `admin: true` or by the team's owner. The `registerTeam` callable authenticates an anonymous or signed-in user and validates their payload before atomically creating both records. `saveConfiguration` and `recalculateTiers` require an admin claim. Direct client writes are denied, so clients cannot bypass assignment validation, alter settings or inject names into public records. This intentionally enforces registration creation through the backend rather than permissive direct-write rules.

The server transaction creates or moves both private/public representations in one commit. Retrying the same team ID with the same payload and owner is idempotent. New registrations use new random IDs, so an anonymous user can register more than one team. Anonymous auth alone is not an anti-spam identity check; enforce appropriate Firebase quotas/App Check or event-specific admission controls before a public event. Full tournament transactions are suitable for a small event; assess transaction size/contention before scaling to very large datasets.

Masking enabled means admin cards hide Ace names by default, with an authenticated reveal control/private details. Masking disabled shows names in the admin dashboard. Admin cards and the private CSV show the division preference and all three WhatsApp numbers; the admin team editor can change names, UTRs, phone numbers and division choice. Public pages never disclose phone numbers. Ace names follow the saved masking setting. CSV is available only to an authenticated admin who has private-record read access. Spreadsheet formula prefixes are escaped.

## Tier assignment and administration

- Exactly three players. Every required UTR must be numeric, positive, and within configured individual bounds (default 0.01–16.50); at most two decimal places.
- Defaults: GOAT 17.50–22.00, Rising 11.50–17.50, inclusive; GOAT takes priority at the shared 17.50 boundary.
- Registration displays checkbox-style choices for one division preference: GOAT only, Rising only, both, or the highest eligible tier. A GOAT-qualified team may enter GOAT, Rising, or both public lists; a Rising-qualified team cannot enter GOAT. GOAT only stays in GOAT regardless of team count. The separate GOAT-preferred fallback uses Rising only when the team's UTR does not qualify for GOAT. Recalculation preserves the chosen preference when still eligible.
- For overlaps, lower `sortOrder` is higher priority; each tier must have a unique order. Tier IDs are immutable; names, ranges, order, and active status are editable. Up to 20 tiers are supported.
- Totals in gaps or outside all active ranges cannot register. Existing teams can become **Unassigned** after a configuration change and recalculation; they stay in private records and disappear from public tier paths.
- Saving masking changes immediately updates public name visibility. Use **Recalculate Tiers** after changing ranges or active tiers to update existing teams. It rebuilds the entire public tier tree from private registrations, removes stale entries, updates private assignments, and returns reviewed/moved/unchanged/unassigned counts. `moved + unchanged = reviewed`; `unassigned` is a subset that may include unchanged unassigned teams.
- To remove a populated tier safely: deactivate it, save, recalculate, then remove it and save again. Removal is checked on the server, not just disabled in the UI.
- Config revisions reject stale writes from another admin session. Reload saved settings to resolve a conflict rather than silently overwriting someone else’s changes.

## League: fixtures, results and standings

- **Fixtures.** In Admin → League & results, *Generate fixtures* builds a round-robin schedule for a tier from its current teams (every team plays every other team once; an odd count gets a bye each round). Regenerating a tier that already has submitted or final results asks for confirmation and clears them.
- **Scores.** Each round-robin encounter has three courts (Singles, Doubles 1, Doubles 2); the team winning two of three wins the encounter. Singles is one 8-game pro set (tiebreak at 7-7); doubles is best of three short sets to 4 (7-point tiebreak at 3-3), and if the first two sets split the third is a 10-point match tiebreak or a full short set. Scores are entered per set and checked by `functions/lib/scoring.js` (unit-tested in `tests/unit/scoring.test.js`); see `docs/SCORING_REQUIREMENTS.md`. The captain is the browser that registered the team (its anonymous Firebase user, stored privately in `traice2_0/teamsByOwner/<uid>`). Either captain can submit a score from the League page; it shows as *Awaiting approval* until the admin approves or rejects it in Admin → League & results. Admin entries and corrections are final immediately. If a captain clears their browser data, the admin enters the score instead.
- **Standings.** Computed from final results: 1 point per encounter win (the admin setting scales the points shown); only approved results count. Ties break on head-to-head, then court difference, game difference and games won. The table shows courts and games won and lost. The playoff line is drawn under 4th place when the tier has more than 7 teams, otherwise under 3rd.
- **Lineups.** Every score includes each team's lineup: the Doubles 1 pair and the Doubles 2 partner. Everything else follows from the rules: in the round robin, Doubles 2 is the player who sat out Doubles 1 plus the chosen partner, and Singles is the Doubles 1 player left out of Doubles 2. In the playoffs (five courts: Singles 1, Doubles 1, Singles 2, Doubles 2, Doubles 3), Singles 1 is the player who sat out Doubles 1, Singles 2 is the one left out of Doubles 2, and the two singles players play Doubles 3, a single 10-point tiebreak. All five courts are scored and the team with 3 wins advances.
- **Playoffs.** Admin → League & results → *Create playoffs* seeds the bracket from the standings: top 3 (Eliminator 2nd v 3rd, then 1st v the winner) or top 4 when the tier has more than 7 teams (SF1 1st v 3rd, SF2 2nd v 4th, then the final). Winners move into the final automatically when results become final; correcting a feeder result resets the final.
- **Team profiles.** `/team/<teamId>` shows the players with counted UTR and live rating, record, position and every fixture.
- **Triace rating and player pages.** Each player starts at their counted UTR. After every final match with a lineup, the rating moves by `K × (games share − expected)`, where the expected share comes from the rating gap (`1 / (1 + e^(−gap / 0.75))`) and K is 0.30 for singles, 0.24 for doubles (pair average, both partners move equally) and 0.12 for the super tiebreak. A match tiebreak to 10 counts as one game. `/players` ranks every player with search, tier filter and sorting; `/player/<teamId>/<role>` shows the rating trend and full match history. This is the league's own rating, not an official UTR.

- **League rules (Admin → League & results).** Every league rule is set there: the singles/doubles gap before averaging (default 1.75), points per encounter win (1), the singles minimum (40% of match days, rounded down), and the playoff size (top 4 above 7 teams, otherwise top 3). They are stored in `traice2_0/leagueRules` and read by the rules cards, registration, standings, playoffs and the singles check. Tier ranges on the rules cards come from the saved tier configuration. Run *Recalculate Tiers* after changing the gap so existing teams are re-rated.
- **Manual playoff mapping.** Under each tier, choose the bracket (top 4, top 3 or a two-team final) and the team in every seed slot. Slots are prefilled from the standings; players below the singles minimum are listed as a warning before you create the bracket.
- **Singles minimum.** Team pages show each player's singles days against the requirement (eligible, needs N more, or can no longer reach it), counted from final results that include a lineup.
- **Seasons and history.** Admin → League & results → Season: rename the current season, or close it. Closing saves a public snapshot to `traice2_0/seasons` (teams, fixtures, playoffs, champions, the rules used) and a private copy of the registrations to `traice2_0/archive` (admin only), then clears teams and fixtures for the next season. Settings, tiers and league rules carry over. `/history` lists past seasons with champions; each season page shows its final standings and playoff bracket.

- **Match dates and deadlines.** Under each tier in Admin → League & results, set the date round 1 starts and the days per round. Round *r* starts `start + (r − 1) × days` and is due `days − 1` later; a deadline lasts to the end of that day anywhere on earth. Fixtures show their due date and turn red when overdue; the admin can move one fixture's deadline. A result counts as on time if the first captain submission (or the admin's entry) arrived by the deadline, and late results are marked.
- **Challenge rule (provisional).** By default, a team in places 5–6 can challenge one team in places 2–4, once per season, before the last 3 rounds, and only if every round already due was completed on time. Match dates must be set. The challenge is a normal three-match encounter with its own deadline; if the challenger wins, the two teams swap places in the table (marked ⇅), and it never adds points. Every limit, and the rule itself, can be changed or switched off in League rules.
- **Captain logins.** Registering asks the captain for a private last name and creates a login that follows a simple pattern: **username** = first 4 letters of the captain's first name + first 3 letters of Ace 2's name (Arjun / Raj Mehta → `arjuraj`; a taken name gets a number, `arjuraj2`), **password** = first 3 letters of the last name + first 3 letters of the first name + 4 random digits (Arjun Rana → `ranarj4172`, 10 characters). The login is shown once with Copy, Download and Print buttons, and the captain must confirm it is saved. Typing is forgiving: capitals, spaces, hyphens and a `#` are ignored. Captains sign in at `/captain` on any device to submit scores and manage their team. It is a Firebase Email/Password account with a made-up address (`<username>@captain.traice.local`) created by the `registerTeam` function; the password is never stored by the app. If the login cannot be created the team is still registered (login pending) and the admin creates it with **Reset login**. The admin sees each team's username and can **Reset login** (new random digits, old sessions signed out, shown once) via `resetCaptainLogin`; withdrawing a team deletes its login. One browser can register at most 3 teams. Because the pattern is built from names, the 4 random digits are the secret: 10,000 possibilities plus Firebase's sign-in limits. There is no email recovery; a captain who loses the login asks the admin. Helpers: `functions/lib/captainLogin.js` (server) and `captainAccount.js` (browser-safe).
- **Editing and withdrawing teams.** The admin can edit any team (names, singles/doubles UTR, tier choice) or withdraw it from the team's card. A captain can do the same from their team page until fixtures are scheduled. A change that would move a team with fixtures to another tier is refused. Withdrawing removes the team and its unplayed fixtures; its finished results stop counting; a private copy is kept under `traice2_0/withdrawn`. A team in an unfinished playoff can't be withdrawn until the playoffs are recreated without it.

League logic lives in `functions/lib/league.js` (unit-tested in `tests/unit/league.test.js`), with the Cloud Functions `generateFixtures`, `generatePlayoffs`, `submitResult`, `reviewResult`, `saveLeagueRules`, `manageSeason`, `setSchedule`, `moveFixture`, `issueChallenge`, `updateTeam`, `withdrawTeam` and `resetCaptainLogin`. After pulling this change, deploy both the functions and the database rules (`firebase deploy --only functions,database`); `fixtures`, `leagueRules`, `season`, `seasons` and `schedules` are publicly readable, each registration is readable by its own captain devices, `teamsByOwner/<uid>` is readable only by that user, and `archive` only by the admin. Running *Recalculate Tiers* once rebuilds the captain index for teams registered before this change.

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

The homepage shows the official rules as ten native flash cards (`src/rules/cards.jsx`), styled by the same design system as the rest of the app (`src/styles/app.css`). Swipe, the arrow keys, the dots or the Next button move between cards. Visitors must view all ten sections and agree below the document before the Register tab and route become available. The backend also requires the rules-accepted flag. The supplied challenge rule remains marked provisional. The web app includes a manifest and production-only service worker for installation and offline access to the app shell; registration still requires a live connection.

## Deploy the web app to Netlify

Connect this repository to Netlify. `netlify.toml` builds with Node 24, publishes `dist`, supplies the public Firebase web configuration, and rewrites client routes to `index.html`. The exact uploaded `triace-rules.html` is included as a static file and cached for the installed PWA. Netlify serves existing static files before the SPA rewrite.

Netlify hosts only the web app. Before live registration, deploy the Firebase callable functions (including `bootstrapTournament`) and reviewed Realtime Database rules described above, enable Anonymous and Email/Password Authentication, and add the Netlify hostname to Firebase Authentication authorized domains. Create the admin account with the admin claim for later rule changes; initial GOAT/Rising setup happens automatically. Set `VITE_ADMIN_EMAIL` in Netlify if the admin's actual Authentication email differs from the app default, then rebuild. Netlify environment variables are build-time values. Do not use `npm run demo` as the Netlify build command; demo data stays local.

The supplied HTML shows GOAT 17.50–22.00 and Rising 11.50–17.00 and says teams are always placed in the highest eligible tier. Current saved registration defaults are GOAT 17.00–22.00 and Rising 11.50–16.50, with an option to enter both. The uploaded document is preserved exactly, so these differences must be resolved by the tournament owner before publishing live enrollment. Admin tier changes do not edit the HTML file.

### Faster local checks and Functions deployments

Browser tests start a demo server only for each worker actually used. A single spec starts one server; the full suite keeps separate state per spec file, reusing a server within each file. Use `PW_WORKERS=1` to reduce resource usage, or `PW_BASE_PORT=3300` to run a separate suite without colliding with the default ports. `CHROMIUM_PATH=/usr/bin/chromium` reuses system Chromium without a download.

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- tests/browser/pwa-ui.spec.js
./deploy.sh --quick --no-hosting --dry-run
./deploy.sh --only-functions registerTeam --dry-run
```

Deployment caches web and Functions dependency installs separately, keyed by each manifest and lockfile plus Node/npm versions. Remove `.firebase/install-web-hash` or `.firebase/install-functions-hash` to force a fresh install if dependencies were manually altered. The first run installs dependencies; later runs reuse unchanged installs, including outside quick mode. Named Functions deployments retain unit/browser validation while skipping the site build and hosting. Remove `--dry-run` to use the existing production confirmation flow after reviewing the plan.

Quick deployment selection requires committed changes. With `--allow-dirty`, quick mode falls back to full validation/selection and does not record a successful commit marker, so later deployments cannot silently miss uncommitted changes. Changing shared browser fixtures runs the full browser suite.

### Deploying shared database rules safely

`npm run rules:generate` writes the tournament rules for review. It does not deploy. Merge that output into a separate copy of the project's existing rules, preserving every other application's nodes, then use:

```sh
npm run rules:deploy -- --project multiclub-890ea --rules /path/to/reviewed-merged.json --confirm-merged
```

For a custom database root or Season 1 location, also pass `--root <root>` and `--season1 <path>` matching the generated rules. The command validates the tournament subtree and inherited permissions, uses the reviewed file directly, and never regenerates it. The former `deploy.sh --rules` path now refuses deployment and points to this command. Review the whole merged file before setting `--confirm-merged`; the validator cannot know which unrelated rules exist in the live project.

The live setup checker now uses the read-only `healthCheck` callable. Deploy that function with this change. It no longer sends test writes or attempts to sign in; sign-in provider configuration and individual endpoint behavior require separate verification.
