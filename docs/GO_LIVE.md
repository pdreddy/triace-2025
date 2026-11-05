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

## 1. Firebase project (needs your Firebase account)

- [ ] Realtime Database enabled; Authentication → **Email/Password** and **Anonymous** enabled.
- [ ] Authentication → Settings → **Authorized domains**: add your live hostname (Netlify or Firebase Hosting).
- [ ] Billing plan that allows Cloud Functions (Blaze).
- [ ] Captain logins are Email/Password accounts created by the `registerTeam` function, so Email/Password sign-in must be on and the functions' service account needs the default Firebase Auth admin access (it has it unless you changed IAM). Run `npm run test:rules` somewhere the emulators work to check the login tests.
- [ ] Decide the database paths. Defaults are fine (`traice2_0`, `traice2_0/season1`). If you change them, set `VITE_DB_*` for the web app and `TRAICE_DB_*` in `functions/.env` to the same values, run `npm run rules:generate`, and deploy the rules (`npm run rules:deploy`). The Season 1 path may not overlap the root or any tournament node; preflight and the functions refuse it.

## 2. Admin account (needs your Firebase account)

- [ ] Authentication → Users: create `reddi2026@traice.local` with a **new, unique password**. The temporary password in the README is only for testing; remove it from the README.
- [ ] Grant the admin claim: `GOOGLE_CLOUD_PROJECT=<project> node scripts/grant-admin.cjs reddi2026@traice.local`
- [ ] Sign in on the live site; confirm the **Admin** page opens.

## 3. Deploy (needs the Firebase CLI logged in)

Rules first, merged with any other apps' rules in the same database (never replace a shared rules file blindly).

```bash
npx firebase deploy --project <project> --only database
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
