#!/usr/bin/env bash
# One command for everything:  ./run-all.sh
#   1. installs dependencies if needed          4. registers 5 sample teams and validates them
#   2. runs the unit tests                      5. opens the app in your browser and keeps it running
#   3. starts the demo on a free port           (Ctrl-C stops it)
# Add --full to also run the browser tests (downloads Chromium for Playwright the first time).
# Add --no-open to skip opening the browser.
set -uo pipefail
cd "$(dirname "$0")"

FULL=0; OPEN=1
for arg in "$@"; do
  case "$arg" in --full) FULL=1 ;; --no-open) OPEN=0 ;; *) echo "Unknown option: $arg"; exit 1 ;; esac
done

if ! command -v node >/dev/null; then echo "Node.js 22.12+ is required. Install it from https://nodejs.org"; exit 1; fi
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]; then echo "Node $(node -v) is too old; this app needs 22.12 or newer."; exit 1; fi
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
RESULT=0

step "1/5 Dependencies"
if [ ! -d node_modules ]; then npm ci --no-audit --no-fund || exit 1; else echo "already installed"; fi

step "2/5 Unit tests"
npm test 2>&1 | grep -E "^# (tests|pass|fail)" ; [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "Unit tests failed. Run 'npm test' to see why."; RESULT=1; }

step "3/5 Starting the demo"
export TRAICE_ADMIN_PASSWORD="demo-admin-1234"
PORT=$(node -e "
const net=require('net');
const tryPort=p=>new Promise(r=>{const s=net.createServer().once('error',()=>r(false)).listen(p,'127.0.0.1',()=>s.close(()=>r(true)))});
(async()=>{for(const p of [3000,3001,3002,3003,3004,3005]) if(await tryPort(p)){console.log(p);return}console.log(0)})()")
if [ "$PORT" = "0" ]; then echo "No free port between 3000 and 3005. Stop other servers and try again."; exit 1; fi
DATA_DIR=".local-demo/run-$(date +%s)"; mkdir -p .local-demo
TRAICE_DEMO_DATA_DIR="$DATA_DIR" npx vite --mode demo --port "$PORT" > .local-demo/server.log 2>&1 &
SERVER=$!
stop() { trap - EXIT INT TERM; kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null; echo; echo "Stopped."; exit "${1:-0}"; }
trap 'stop' EXIT
trap 'stop 130' INT TERM
URL="http://127.0.0.1:$PORT"
for i in $(seq 1 60); do
  curl -fs "$URL/api/session" >/dev/null 2>&1 && break
  kill -0 $SERVER 2>/dev/null || { echo "The demo failed to start:"; tail -15 .local-demo/server.log; exit 1; }
  sleep 0.5
done
curl -fs "$URL/api/session" >/dev/null 2>&1 || { echo "The demo did not respond in 30s:"; tail -15 .local-demo/server.log; exit 1; }
echo "running at $URL"

step "4/5 Registering 5 sample teams and validating"
DEMO_URL="$URL" node scripts/demo-register-teams.mjs --fixtures || RESULT=1

if [ "$FULL" = 1 ]; then
  step "Browser tests"
  npx playwright install chromium >/dev/null 2>&1
  npx playwright test || RESULT=1
fi

step "5/5 Ready"
echo "  Tier list:      $URL/tiers"
echo "  League:         $URL/league"
echo "  Champions:      $URL/champions"
echo "  Past seasons:   $URL/history"
echo "  Admin:          $URL/admin/login   (username reddi2026, password $TRAICE_ADMIN_PASSWORD)"
[ "$RESULT" = 0 ] && echo "  Result:         ALL CHECKS PASSED" || echo "  Result:         SOME CHECKS FAILED (see above)"
echo "  Press Ctrl-C to stop."
if [ "$OPEN" = 1 ]; then { command -v open >/dev/null && open "$URL/tiers"; } || { command -v xdg-open >/dev/null && xdg-open "$URL/tiers"; } || true; fi >/dev/null 2>&1
wait $SERVER
