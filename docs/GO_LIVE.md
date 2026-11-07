# Go-live checklist

Run the automated part first, then work through the accounts-only steps.

```bash
npm run build
npm run check:pwa     # installable + works offline
npm run test:pwa      # real browser: installs, then every page opens offline
npm run preflight     # config, rules, secrets, paths
npm run check         # everything: unit, build, PWA, browser tests
```

`npm run preflight` fails on anything that would break production and warns on anything to double-check.

## 0. Deploy in one command

```bash
./deploy.sh --dry-run     # runs every check and the build, deploys nothing
./deploy.sh               # checks, build, then deploys Cloud Functions and Firebase Hosting after you type the project id
./deploy.sh --no-hosting  # functions only, when Netlify builds the site from git
npm run rules:deploy -- --project <project> --rules <reviewed-merged.json> --confirm-merged
```

It refuses to deploy with uncommitted changes, failing tests, a failing PWA or preflight check. Database rules use the separate command above, which requires an explicit reviewed merged file and project. Never regenerate the merged file during deployment; the database may be shared with other apps.

## Where to enter data (live site)

All of this is in the browser, on the **Admin** page (sign in at `/admin/login`). Nothing below needs a rebuild or deploy unless it says so.

| What | Where |
| --- | --- |
| Registration open or closed, name privacy, minimum and maximum player rating | Admin → **Registration & privacy** |
| **Early bird**: on/off, opening date, last day, late fee in dollars | Admin → **Early-bird registration** (saved instantly; shown on the rules, the registration page and a bar on every page) |
| Tier names and rating ranges, add or remove tiers | Admin → **Tier configuration**, then **Recalculate tiers** |
| Registered teams: view, edit, search, export, withdraw | Admin → **Private registrations**; **Captain only** hides the other players |
| A captain lost their login | Admin → **Private registrations** → the team's card → **Reset login** (shown once; send it to the captain) |
| League rules (points, playoff spots, challenge rule), season name, schedule dates, create fixtures, approve scores, playoffs, close a season | Admin → **League & results** |
| Scores | Captains: **Captain** sign-in, then **League → Fixtures**. Admin: enter or approve in **League & results** |
| **Partner board** (players looking for a team, teams needing a player) | The public **Partners** page. **Only the admin can remove posts**: signed in as admin you see a **Remove** button on every post. Posters cannot remove their own, so posts also disappear on their own after 30 days. The poster or the admin can mark a post **Picked** (and say by whom), which shows it publicly under the Picked tab for 14 days and frees the poster's slot. Poster and replier numbers are private (only the poster and the admin can read them) |
| Season 1 history in the database | Admin → **Firebase & data paths** → **Copy Season 1 into Firebase** (once) |
| Season 1 winners, squads, Super Six details | `src/data/season1-table.json`, then deploy (these are code files) |
| Firebase project, database paths | `.env` / `functions/.env` (see README), then deploy |
| The admin password | Firebase Console → Authentication → Users |

> **After adding the partner board you must redeploy the backend and the rules:** `./deploy.sh --no-hosting` (new functions `createPartnerPost`, `expressInterest`, `closePartnerPost`) and publish the updated rules (`npm run rules:deploy -- --project <project> --rules <reviewed-merged.json> --confirm-merged` after merging them into the live rules). New nodes: `partnerPosts` (public read), `partnerPrivate` and `partnerByOwner` (owner or admin only).

> **Registration safeguards:** one browser can register at most 3 teams (ask the admin for more). If a captain login cannot be created (for example Email/Password is switched off), the team is still registered with a "login pending" note and the admin creates the login later with **Reset login** on the team card. Teams without a login show "not created yet" there.

> **Quickest way to see what is wrong on the live site:** open `/status` (also linked from the admin sign-in page and from Admin → Firebase & data paths). It checks the database rules, Anonymous and Email/Password sign-in, every function, and the account in this browser, and shows the fix for anything that fails. **Copy report** gives you text to paste.

## 1. Firebase project (needs your Firebase account)

- [ ] Realtime Database enabled; Authentication → **Email/Password** and **Anonymous** enabled.
- [ ] Authentication → Settings → **Authorized domains**: add your live hostname (Netlify or Firebase Hosting).
- [ ] Billing plan that allows Cloud Functions (Blaze).
- [ ] Captain logins are Email/Password accounts created by the `registerTeam` function, so Email/Password sign-in must be on and the functions' service account needs the default Firebase Auth admin access (it has it unless you changed IAM). Run `npm run test:rules` somewhere the emulators work to check the login tests.
- [ ] Decide the database paths. Defaults are fine (`traice2_0`, `traice2_0/season1`). If you change them, set `VITE_DB_*` for the web app and `TRAICE_DB_*` in `functions/.env` to the same values, run `npm run rules:generate`, and deploy the rules (`npm run rules:deploy`). The Season 1 path may not overlap the root or any tournament node; preflight and the functions refuse it.

## 2. Admin account (needs your Firebase account)

- [ ] Authentication → Users: create `reddi2026@traice.local` with a **new, unique password**. The temporary password in the README is only for testing; remove it from the README.
- [ ] If the account already exists and you are unsure of its password, set a new one (typed twice, never saved): `GOOGLE_CLOUD_PROJECT=<project> node scripts/set-admin-password.cjs reddi2026@traice.local`
- [ ] Grant the admin claim: `GOOGLE_CLOUD_PROJECT=<project> node scripts/grant-admin.cjs reddi2026@traice.local`
- [ ] Sign in on the live site; confirm the **Admin** page opens.

## 3. Deploy (needs the Firebase CLI logged in)

Rules first, merged with any other apps' rules in the same database (never replace a shared rules file blindly).

```bash
npm run rules:deploy -- --project <project> --rules <reviewed-merged.json> --confirm-merged
npx firebase deploy --project <project> --only functions:traice
npm run build
npx firebase deploy --project <project> --only hosting      # or let Netlify build from git
```

Deploy the functions **before** the web app goes live: the first visit calls `bootstrapTournament`.

## 4. Load the data

- [ ] Open **Admin → Firebase & data paths**: it should show your project and both paths.
- [ ] Press **Copy Season 1 into Firebase** once. The panel then says "Firebase · 73 matches".
- [ ] **Admin → Registration & privacy**: set registration open/closed, name masking, and check tier ranges.
- [ ] **Admin → League & results**: rename the current season (Season 2).

## 5. Smoke test on the live site (phone and laptop)

- [ ] Rules page → agree → Register a test team → save the shown username and password → tier list shows the team.
- [ ] On a second phone: **Captain** → sign in with that login → League shows the team's fixtures and score entry. In Admin, **Reset login** gives a new password and the old one stops working. Then withdraw the test team (its login is deleted with it).
- [ ] Champions and Past seasons show Season 1 (and the Super Six).
- [ ] Install the app (Android Chrome: menu → Install app; iPhone Safari: Share → Add to Home Screen). Switch to airplane mode: pages still open and show the "saved data" banner.
- [ ] Admin → Teams → **Captain only** hides the other players and the CSV export.
- [ ] Update test: deploy a small change and confirm the "A new version is ready" banner appears in the installed app.

## 6. After launch

- [ ] Remove any test teams. Keep Firebase budget alerts on.
- [ ] Watch Functions logs for the first registrations.
- [ ] Next version: dedicated Schedule and Score entry screens (placeholders are in the League page).

## Dates, auto-schedule and more admins (Admin → Dates / Admins)

- **Dates tab**: registration opens / last registration day (registration closes itself), season start, days per round, weeks before playoffs, and **buffer weeks** written as `round:weeks` (for example `3:1, 6:2` = one free week after round 3, two after round 6). Early-bird dates stay in Settings.
- **Auto-schedule all tiers** creates round-robin fixtures for every tier with two or more teams and dates every round from the calendar. Run it again after changing the calendar: fixtures with results are never deleted, and a tier whose teams changed after results exist is skipped (regenerate it by hand).
- **Add buffer** pushes every later round back by the weeks you choose (rain-off, holiday). A single match can still be moved from the League tab.
- **Admins tab**: add an administrator by sign-in name (they sign in at `/admin/login` with that name); the 12-character password is shown once. Reset password and Remove are there too; you cannot remove yourself or the last admin.
- New backend functions: `saveCalendar`, `autoSchedule`, `addBufferWeeks`, `listAdmins`, `createAdmin`, `resetAdminPassword`, `removeAdmin`. Deploy Functions with `./deploy.sh --no-hosting`. Deploy a reviewed merged rules file separately (the `calendar` node needs the new rule), then the site.

## Backups

- **Admin → Teams → Save as text file**: a readable `.txt` list of every team with phone numbers, grouped by tier (open it in Notes or print it). `npm run backup` writes the same `.txt` next to the JSON.
- **Admin → Teams → Download full backup**: one JSON file with every registration (private details), fixtures, results, calendar and rules, saved on the device you are using. Do this before and after registration closes, and before every deploy.
- **From your Mac (complete copy, including Season 1 and the partner board)**: `npm run backup` (after `gcloud auth application-default login`). It writes `backups/traice-backup-<time>.json`; the folder is git-ignored because it holds phone numbers. Keep a copy somewhere private (iCloud, Drive).
- Also turn on Firebase's own safety net: Console → Realtime Database → Backups (daily, needs the Blaze plan).

### Automatic backups (every 6 hours)

The `scheduledBackup` function saves the whole tournament to your project's Cloud Storage bucket every 6 hours, as `traice-backups/traice-<time>.json` and a readable `.txt` (newest 80 of each are kept). **Admin → Teams → Back up now (cloud)** does it on demand.

One-time setup: Firebase Console → **Storage → Get started** (needs the Blaze plan you already use) and keep the Storage rules closed. Deploy with `./deploy.sh --no-hosting`; the first deploy enables Cloud Scheduler. To fetch a file: Console → Storage → `traice-backups`. If "Back up now" says Storage is not set up, do the one-time step above.
