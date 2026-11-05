#!/usr/bin/env bash
# Production deploy:  ./deploy.sh [--dry-run] [--no-hosting] [--rules] [--skip-browser-tests]
#   (default)            run the checks, build, then deploy Cloud Functions and Firebase Hosting
#   --dry-run            run every check and the build, print what would be deployed, deploy nothing
#   --no-hosting         functions only (use this when Netlify builds the site from git)
#   --rules              ALSO deploy the Realtime Database rules (read the warning first)
#   --skip-browser-tests skip the 40+ browser tests (unit tests, build, PWA and preflight checks still run)
# Needs: Node 22+, and `npx firebase login` done once on this machine by someone with deploy rights.
set -uo pipefail
cd "$(dirname "$0")"

DRY=0; HOSTING=1; RULES=0; BROWSER=1
for arg in "$@"; do
  case "$arg" in --dry-run) DRY=1 ;; --no-hosting) HOSTING=0 ;; --rules) RULES=1 ;; --skip-browser-tests) BROWSER=0 ;; *) echo "Unknown option: $arg"; exit 1 ;; esac
done
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

PROJECT=$(grep -E '^VITE_FIREBASE_PROJECT_ID=' .env | cut -d= -f2)
[ -n "$PROJECT" ] || fail "VITE_FIREBASE_PROJECT_ID is missing from .env"

step "1/6 Source"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
echo "branch: $BRANCH   project: $PROJECT"
[ -z "$(git status --porcelain 2>/dev/null)" ] || fail "You have uncommitted changes. Commit or stash them so what you deploy matches git."
[ "$BRANCH" = "main" ] || echo "WARNING: you are on '$BRANCH', not 'main'. Production should normally be deployed from main."

step "2/6 Dependencies"
npm ci --no-audit --no-fund || fail "npm ci failed"
npm --prefix functions ci --no-audit --no-fund || fail "functions npm ci failed"

step "3/6 Tests"
npm test || fail "Unit tests failed"
if [ "$BROWSER" = 1 ]; then
  npx playwright install chromium >/dev/null 2>&1
  npm run test:browser || fail "Browser tests failed"
else echo "(browser tests skipped)"; fi

step "4/6 Build and checks"
npm run build || fail "Build failed"
npm run check:pwa || fail "PWA checks failed"
npm run preflight || fail "Preflight failed. Fix the items marked ✗ above."
if [ "$BROWSER" = 1 ]; then npm run test:pwa || fail "Offline test failed"; fi

step "5/6 What will be deployed"
TARGETS="functions:traice"; [ "$HOSTING" = 1 ] && TARGETS="$TARGETS,hosting"; [ "$RULES" = 1 ] && TARGETS="$TARGETS,database"
echo "project:  $PROJECT"
echo "deploy:   $TARGETS"
[ "$HOSTING" = 1 ] || echo "hosting:  not deployed (Netlify builds the site from git)"
if [ "$RULES" = 1 ]; then
  cat <<'WARN'

  !! DATABASE RULES !!  firebase deploy --only database REPLACES the whole rules file of this project's database.
  If other apps share it, merge database.rules.json into the live rules first, or you will break them.
WARN
else echo "rules:    not deployed (add --rules after merging them into the live rules)"; fi
if [ "$DRY" = 1 ]; then echo; echo "Dry run: nothing deployed."; exit 0; fi

step "6/6 Deploy"
read -r -p "Type the project id ($PROJECT) to deploy to PRODUCTION: " ANSWER
[ "$ANSWER" = "$PROJECT" ] || fail "Cancelled."
if [ "$RULES" = 1 ]; then
  npm run rules:check || fail "database.rules.json does not match the configured paths. Run: npm run rules:generate"
  read -r -p "Type MERGED to confirm the rules were merged with the live ones: " MERGED
  [ "$MERGED" = "MERGED" ] || fail "Cancelled."
fi
npx firebase deploy --project "$PROJECT" --only "$TARGETS" || fail "Deploy failed"

cat <<EOF2

Deployed. Now, once, on the live site:
  1. Sign in at /admin/login and open the Admin page.
  2. Admin → Firebase & data paths → "Copy Season 1 into Firebase".
  3. Check Registration & privacy, Tier configuration and Early-bird registration (dates and late fee).
  4. Register a test team, sign in as its captain at /captain, then withdraw it. See docs/GO_LIVE.md.
EOF2
