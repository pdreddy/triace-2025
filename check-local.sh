#!/usr/bin/env bash
# One file to check Triace on your own machine: fetch the code, install, test, build, and optionally open the app.
#
#   bash check-local.sh                      fetch + install + unit tests + build
#   bash check-local.sh --browser            ...and the browser tests (downloads Chromium the first time)
#   bash check-local.sh --demo               ...and start the app at http://127.0.0.1:3000 (Ctrl+C to stop)
#   bash check-local.sh --export export.json ...and a PPRC migration dry run on your database export (sends nothing)
#   With --demo the app starts with sample registered teams and, if you gave --export, your real PPRC players and
#   match history (served locally, nothing is read from or written to Firebase). --reset-demo starts the sample data again.
# Options combine, e.g. bash check-local.sh --browser --demo
# Settings (environment): BRANCH (default codex/tier-card-improvements), DIR (default: this folder if it is a Triace checkout, otherwise ./triace-2025),
#   REPO (default the GitHub repo), TRAICE_ADMIN_PASSWORD (demo admin password, default local-demo-password).
# Needs: git and Node 22+ (https://nodejs.org). Works on macOS, Linux and Windows Git Bash/WSL.
set -uo pipefail

REPO="${REPO:-https://github.com/pdreddy/triace-2025.git}"
BRANCH="${BRANCH:-codex/tier-card-improvements}"
# Run from inside a Triace checkout, it checks that checkout; otherwise it clones into ./triace-2025.
if [ -z "${DIR:-}" ]; then if [ -d .git ] && grep -q '"name": "traice"' package.json 2>/dev/null; then DIR="."; else DIR="triace-2025"; fi; fi
BROWSER=0; DEMO=0; EXPORT=""; RESET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --browser) BROWSER=1 ;;
    --demo) DEMO=1 ;;
    --reset-demo) RESET=1 ;;
    --export) shift; EXPORT="${1:-}" ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
  shift
done

RESULTS=()
say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
step() { # step "name" command...
  local name="$1"; shift
  say "$name"
  if "$@"; then RESULTS+=("PASS  $name"); else RESULTS+=("FAIL  $name"); return 1; fi
}
summary() {
  say "Summary"; printf '%s\n' "${RESULTS[@]}"
  for r in "${RESULTS[@]}"; do case "$r" in FAIL*) exit 1;; esac; done
}

command -v git >/dev/null || { echo "git is not installed."; exit 1; }
command -v node >/dev/null || { echo "Node is not installed. Install Node 22+ from https://nodejs.org"; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node $NODE_MAJOR found; Triace needs Node 22 or newer."; exit 1; }

say "Fetching $REPO ($BRANCH) into $DIR"
if [ -d "$DIR/.git" ]; then
  if [ -n "$(git -C "$DIR" status --porcelain)" ]; then echo "$DIR has uncommitted changes. Commit or stash them, or use another DIR."; exit 1; fi
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout "$BRANCH" && git -C "$DIR" merge --ff-only "origin/$BRANCH" || { echo "Could not update $DIR."; exit 1; }
else
  git clone --branch "$BRANCH" "$REPO" "$DIR" || { echo "Could not clone $REPO. If the repository is private, sign in to GitHub first (gh auth login)."; exit 1; }
fi
cd "$DIR" || exit 1
echo "At $(git log --oneline -1)"

step "Install" bash -c 'npm ci --no-audit --no-fund && npm --prefix functions ci --no-audit --no-fund' || summary
step "Unit tests (rules, scoring, PPRC, registration)" npm test
step "Build" npm run build

if [ "$BROWSER" = 1 ]; then
  if [ -z "${CHROMIUM_PATH:-}" ] && [ -z "${SKIP_BROWSER_INSTALL:-}" ]; then step "Download Chromium for the browser tests" npx playwright install chromium; fi
  step "Browser tests (registration, league, PPRC admin and profiles)" npx playwright test --trace off
fi

if [ -n "$EXPORT" ]; then
  [ -f "$EXPORT" ] || EXPORT="../$EXPORT"   # a relative path is relative to where you started
  if [ -f "$EXPORT" ]; then
    step "PPRC migration dry run" node scripts/migrate-pprc.mjs "$EXPORT" .local-migration scripts/migration/name-decisions.json
    step "PPRC import plan (nothing is sent)" node scripts/import-pprc.mjs .local-migration/multiclub.json --database-url https://multiclub-890ea-default-rtdb.firebaseio.com
    echo "Results are in $(pwd)/.local-migration (report.md lists anything still needing a decision)."
  else
    RESULTS+=("FAIL  PPRC migration dry run: export file not found"); 
  fi
fi

if [ "$DEMO" = 1 ]; then
  if [ ! -f .local-migration/multiclub.json ]; then echo "Note: no PPRC data yet, so /pprc and the PPRC panel stay empty. Add --export <your-export.json> to load it."; fi
  # Port 3000 must be free: a leftover server there (often a non-demo `npm run dev`) shows Firebase errors.
  if command -v lsof >/dev/null && PIDS=$(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null) && [ -n "$PIDS" ]; then
    echo "Port 3000 is already in use by:"; lsof -i tcp:3000 -sTCP:LISTEN | sed 's/^/  /'
    read -r -p "Stop it and continue? [y/N] " ANSWER
    if [[ "$ANSWER" =~ ^[Yy]$ ]]; then kill $PIDS; sleep 1; else echo "Stop it yourself (kill $PIDS) and run this again."; exit 1; fi
  fi
  if [ "$RESET" = 1 ]; then node scripts/seed-demo.mjs --reset; else node scripts/seed-demo.mjs; fi
  summary_text() { printf '%s\n' "${RESULTS[@]}"; }
  say "Results so far"; summary_text
  say "Starting the app: http://127.0.0.1:3000  (admin: /admin/login, user reddi2026, password ${TRAICE_ADMIN_PASSWORD:-local-demo-password})"
  echo "Try: register a team at /register, then Admin > PPRC players. Press Ctrl+C to stop."
  TRAICE_ADMIN_PASSWORD="${TRAICE_ADMIN_PASSWORD:-local-demo-password}" npm run demo
  exit 0
fi

summary
