#!/usr/bin/env bash
# One command to run Traice locally in demo mode:  ./run-local.sh
# Options:  --test   run the unit tests first      --no-open   don't open the browser
# Set TRAICE_ADMIN_PASSWORD (8+ chars) to choose your own admin password.
set -euo pipefail
cd "$(dirname "$0")"

RUN_TESTS=0; OPEN=1
for arg in "$@"; do
  case "$arg" in
    --test) RUN_TESTS=1 ;;
    --no-open) OPEN=0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if ! command -v node >/dev/null; then echo "Node.js 22.12+ is required. Install it from https://nodejs.org"; exit 1; fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then echo "Node $(node -v) is too old; this app needs 22.12 or newer."; exit 1; fi

if [ ! -d node_modules ]; then echo "Installing dependencies…"; npm ci --no-audit --no-fund; fi

# Use the caller's password if it is long enough, otherwise a fixed local one (the demo only listens on 127.0.0.1).
PW="${TRAICE_ADMIN_PASSWORD:-}"
if [ "${#PW}" -lt 8 ]; then export TRAICE_ADMIN_PASSWORD="demo-admin-1234"; fi

# Port 3000 must be free. A leftover server there (often a non-demo `npm run dev`) shows Firebase errors.
if command -v lsof >/dev/null && PIDS=$(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null) && [ -n "$PIDS" ]; then
  echo "Port 3000 is already in use by:"; lsof -i tcp:3000 -sTCP:LISTEN | sed 's/^/  /'
  read -r -p "Stop it and continue? [y/N] " ANSWER
  if [[ "$ANSWER" =~ ^[Yy]$ ]]; then kill $PIDS; sleep 1; else echo "Stop it yourself (kill $PIDS) and run this again."; exit 1; fi
fi

if [ "$RUN_TESTS" = 1 ]; then npm test; fi

URL="http://127.0.0.1:3000"
echo
echo "  Traice demo:      $URL"
echo "  Champions page:   $URL/champions"
echo "  Past seasons:     $URL/history"
echo "  Admin password:   $TRAICE_ADMIN_PASSWORD"
echo
if [ "$OPEN" = 1 ]; then
  (sleep 3; { command -v open >/dev/null && open "$URL/champions"; } || { command -v xdg-open >/dev/null && xdg-open "$URL/champions"; } || true) >/dev/null 2>&1 &
fi
exec npm run demo
