#!/usr/bin/env bash
# Production deploy:  ./deploy.sh [--quick] [--only-functions a,b] [--dry-run] [--no-hosting] [--rules] [--skip-browser-tests] [--allow-dirty]
#   (default)            run every check and test, build, then deploy Cloud Functions and Firebase Hosting
#   --quick              only test and deploy what changed since your last successful deploy from this machine.
#                        Unit tests always run (a couple of seconds); browser tests are limited to the affected screens;
#                        functions and hosting are skipped when nothing in them changed. Unsure or first time: it runs everything.
#   --only-functions a,b deploy just those functions (for example registerTeam,createPartnerPost); skips hosting
#   --dry-run            run the checks and the build, print what would be deployed, deploy nothing
#   --no-hosting         functions only (use this when Netlify builds the site from git)
#   --rules              ALSO deploy the Realtime Database rules (read the warning first)
#   --skip-browser-tests skip the browser tests (unit tests, build, PWA and preflight checks still run)
#   --allow-dirty        deploy even though git shows uncommitted files (they are listed first)
# Needs: Node 22+, and `npx firebase login` done once on this machine by someone with deploy rights.
set -uo pipefail
cd "$(dirname "$0")"

DRY=0; HOSTING=1; RULES=0; BROWSER=1; DIRTY_OK=0; QUICK=0; ONLY_FN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;; --no-hosting) HOSTING=0 ;; --rules) RULES=1 ;; --skip-browser-tests) BROWSER=0 ;; --allow-dirty) DIRTY_OK=1 ;; --quick) QUICK=1 ;;
    --only-functions) shift; ONLY_FN="${1:-}"; [ -n "$ONLY_FN" ] || { echo "--only-functions needs a comma-separated list of function names"; exit 1; } ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

PROJECT=$(grep -E '^VITE_FIREBASE_PROJECT_ID=' .env | cut -d= -f2)
[ -n "$PROJECT" ] || fail "VITE_FIREBASE_PROJECT_ID is missing from .env"

# Named functions: check the names exist, and never mark the whole backend as deployed afterwards.
FN_TARGETS=""
if [ -n "$ONLY_FN" ]; then
  KNOWN=$(grep -oE '^export const [A-Za-z0-9]+' functions/index.js | awk '{print $3}')
  IFS=',' read -r -a NAMES <<< "$ONLY_FN"
  for name in "${NAMES[@]}"; do
    echo "$KNOWN" | grep -qx "$name" || fail "Unknown function '$name'. Functions in this project: $(echo $KNOWN | tr ' ' ',')"
    FN_TARGETS="${FN_TARGETS:+$FN_TARGETS,}functions:traice:$name"
  done
  HOSTING=0
fi

step "1/6 Source"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
echo "branch: $BRANCH   project: $PROJECT"
CHANGES=$(git status --porcelain 2>/dev/null)
if [ -n "$CHANGES" ]; then
  echo "Git shows these uncommitted files:"; echo "$CHANGES" | sed 's/^/    /'
  if [ "$DIRTY_OK" = 1 ]; then echo "(continuing because of --allow-dirty)"
  else fail "What you deploy should match git. Commit or stash those files (git stash -u), or re-run with --allow-dirty if they do not matter (for example .firebaserc)."; fi
fi
[ "$BRANCH" = "main" ] || echo "WARNING: you are on '$BRANCH', not 'main'. Production should normally be deployed from main."

# Quick mode: work out what changed since the last deploy from this machine.
Q_FULL=1; Q_WHY=""; Q_FUNCTIONS=1; Q_SITE=$HOSTING; Q_RULES=0; Q_BUILD=1; Q_OFFLINE=1; Q_NOTHING=0; Q_SPECS="all"
if [ "$QUICK" = 1 ]; then
  if [ -n "$ONLY_FN" ]; then eval "$(node scripts/plan-deploy.mjs --quick "$PROJECT" --no-hosting --shell)"; else
    eval "$(node scripts/plan-deploy.mjs --quick "$PROJECT" $([ "$HOSTING" = 0 ] && echo --no-hosting) --shell)"; fi
  if [ "$Q_FULL" = 1 ]; then echo "Quick mode: $Q_WHY, so everything runs."; Q_FUNCTIONS=1; Q_SITE=$HOSTING; Q_BUILD=1; Q_OFFLINE=1; Q_SPECS="all"; Q_NOTHING=0
  else echo "Quick mode: functions=$Q_FUNCTIONS site=$Q_SITE build=$Q_BUILD browser-tests='${Q_SPECS:-none}'"; fi
fi
[ -z "$ONLY_FN" ] || { Q_FUNCTIONS=1; Q_SITE=0; Q_NOTHING=0; Q_BUILD=0; Q_OFFLINE=0; }   # named functions: the site is not touched

step "2/6 Dependencies"
LOCKS=$(cat package-lock.json functions/package-lock.json 2>/dev/null | (shasum 2>/dev/null || sha1sum) | cut -d' ' -f1)
if [ "$QUICK" = 1 ] && [ -d node_modules ] && [ -d functions/node_modules ] && [ "$(cat .firebase/lock-hash 2>/dev/null)" = "$LOCKS" ]; then
  echo "unchanged since the last install, skipping npm ci"
else
  npm ci --no-audit --no-fund || fail "npm ci failed"
  npm --prefix functions ci --no-audit --no-fund || fail "functions npm ci failed"
  mkdir -p .firebase && echo "$LOCKS" > .firebase/lock-hash
fi

step "3/6 Tests"
npm test || fail "Unit tests failed"
if [ "$BROWSER" = 1 ]; then
  if [ "$Q_SPECS" = "all" ]; then
    npx playwright install chromium >/dev/null 2>&1
    npm run test:browser || fail "Browser tests failed"
  elif [ -n "$Q_SPECS" ]; then
    FILES=""; for spec in $Q_SPECS; do [ -f "tests/browser/$spec.spec.js" ] && FILES="$FILES tests/browser/$spec.spec.js"; done
    echo "browser tests for what changed:$FILES"
    npx playwright install chromium >/dev/null 2>&1
    # shellcheck disable=SC2086
    npx playwright test $FILES || fail "Browser tests failed"
  else echo "(no browser tests are affected by these changes)"; fi
else echo "(browser tests skipped)"; fi

step "4/6 Build and checks"
if [ "$Q_BUILD" = 1 ]; then
  npm run build || fail "Build failed"
  npm run check:pwa || fail "PWA checks failed"
else echo "(site unchanged, build skipped)"; fi
npm run preflight || fail "Preflight failed. Fix the items marked ✗ above."
if [ "$BROWSER" = 1 ] && [ "$Q_OFFLINE" = 1 ]; then npm run test:pwa || fail "Offline test failed"; fi

step "5/6 What will be deployed"
TARGETS=""
add() { TARGETS="${TARGETS:+$TARGETS,}$1"; }
if [ -n "$ONLY_FN" ]; then add "$FN_TARGETS"
else
  [ "$Q_FUNCTIONS" = 1 ] && add "functions:traice"
  [ "$HOSTING" = 1 ] && [ "$Q_SITE" = 1 ] && add "hosting"
fi
[ "$RULES" = 1 ] && add "database"
echo "project:  $PROJECT"
echo "deploy:   ${TARGETS:-nothing}"
[ "$HOSTING" = 1 ] || echo "hosting:  not deployed by this script (Netlify builds the site from git)"
if [ "$QUICK" = 1 ] && [ "$Q_FULL" = 0 ]; then
  [ "$Q_FUNCTIONS" = 1 ] || echo "functions: unchanged since the last deploy, skipped"
  [ "$Q_SITE" = 1 ] || [ "$HOSTING" = 0 ] || echo "hosting:  unchanged since the last deploy, skipped"
  [ "$Q_RULES" = 0 ] || [ "$RULES" = 1 ] || echo "!! database rules changed since the last deploy: merge them into the live rules and run again with --rules"
fi
if [ "$RULES" = 1 ]; then
  cat <<'WARN'

  !! DATABASE RULES !!  firebase deploy --only database REPLACES the whole rules file of this project's database.
  If other apps share it, merge database.rules.json into the live rules first, or you will break them.
WARN
else echo "rules:    not deployed (add --rules after merging them into the live rules)"; fi
if [ -z "$TARGETS" ]; then echo; echo "Nothing to deploy: the tests passed and nothing in the backend or site changed."; exit 0; fi
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

# Remember what is live, so --quick can compare next time. Deploying a few named functions does not count as "all functions deployed".
if [ -z "$ONLY_FN" ] && [ "$Q_FUNCTIONS" = 1 ]; then node scripts/plan-deploy.mjs --mark functions "$PROJECT"; fi
if [ "$HOSTING" = 1 ] && [ "$Q_SITE" = 1 ]; then node scripts/plan-deploy.mjs --mark site "$PROJECT"; fi

cat <<EOF2

Deployed. Now, once, on the live site:
  1. Sign in at /admin/login and open the Admin page.
  2. Admin → Firebase & data paths → "Copy Season 1 into Firebase".
  3. Check Registration & privacy, Tier configuration and Early-bird registration (dates and late fee).
  4. Register a test team, sign in as its captain at /captain, then withdraw it. See docs/GO_LIVE.md.
EOF2
