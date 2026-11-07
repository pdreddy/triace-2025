#!/usr/bin/env bash
# One command to go live (or redeploy):  bash ship.sh
#   (default)       install, test, build, deploy the Cloud Functions
#   --hosting       also publish the site to Firebase Hosting (leave this off if Netlify builds the site from git)
#   --data          also rebuild and load the PPRC data (runs refresh-pprc.sh; needs the KOC export and key file)
#   --dry-run       run every check and show the plan; deploy and write nothing
#   --skip-install  do not run npm ci first
#   --browser-tests also run the browser tests before deploying (slower)
# Needs Node 24.12+ (below 25) and `npx firebase login` done once. Commit your changes first: deploy.sh refuses a dirty tree.
set -uo pipefail
cd "$(dirname "$0")"
HOSTING=0; DATA=0; DRY=0; INSTALL=1; BROWSER=0
for a in "$@"; do case "$a" in
  --hosting) HOSTING=1 ;; --data) DATA=1 ;; --dry-run) DRY=1 ;; --skip-install) INSTALL=0 ;; --browser-tests) BROWSER=1 ;;
  *) echo "Unknown option: $a"; exit 1 ;; esac; done
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===24&&b>=12?0:1)' || fail "Needs Node 24.12+ (below 25); you have $(node --version). Try: export PATH=\"/opt/homebrew/opt/node@24/bin:\$PATH\""

if [ "$INSTALL" = 1 ]; then step "1. Install dependencies"; npm ci && npm --prefix functions ci || fail "Install failed."; fi

step "2. Deploy (tests, build and checks run first)"
ARGS=()
[ "$HOSTING" = 1 ] || ARGS+=(--no-hosting)
[ "$BROWSER" = 1 ] || ARGS+=(--skip-browser-tests)
[ "$DRY" = 1 ] && ARGS+=(--dry-run)
./deploy.sh "${ARGS[@]}" || fail "Deploy stopped (see above). Nothing after this point was run."

if [ "$DATA" = 1 ]; then
  step "3. PPRC data"
  if [ "$DRY" = 1 ]; then bash refresh-pprc.sh --dry-run; else bash refresh-pprc.sh; fi || fail "The PPRC data step failed (see above)."
fi

step "Done"
[ "$DRY" = 1 ] && echo "Dry run: nothing was deployed or written."
[ "$HOSTING" = 1 ] || echo "The site itself is built by Netlify from git: push this branch and set it as Netlify's production branch (or use --hosting for Firebase Hosting)."
