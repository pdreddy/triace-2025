#!/usr/bin/env bash
# One command to rebuild the PPRC data and load it into the shared database.
#   bash refresh-pprc.sh                 finds the KOC export and the multiclub key file by itself
#   bash refresh-pprc.sh <export.json>   use this export file
#   bash refresh-pprc.sh --dry-run       build and show the plan, write nothing
# Only the pprcMaster part of multiclub-890ea is replaced (a backup is saved first). KOC's live data is never touched.
set -uo pipefail
cd "$(dirname "$0")"
DB="https://multiclub-890ea-default-rtdb.firebaseio.com"
DRY=0; EXPORT=""
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; *) EXPORT="$a" ;; esac; done
fail() { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a===24&&b>=12?0:1)' || fail "Needs Node 24.12+ (below 25). You have $(node --version). Switch first: export PATH=\"/opt/homebrew/opt/node@24/bin:\$PATH\""

KEY=$(ls -t "$HOME"/Desktop/multiclub-890ea-firebase-adminsdk-*.json "$HOME"/Downloads/multiclub-890ea-firebase-adminsdk-*.json 2>/dev/null | head -1)
[ -n "$KEY" ] || fail "Could not find multiclub-890ea-firebase-adminsdk-*.json in Desktop or Downloads."

if [ -z "$EXPORT" ]; then
  EXPORT=$(ls -t "$HOME"/Downloads/*rtdb*export*.json "$HOME"/Desktop/*rtdb*export*.json "$HOME"/Downloads/*rtdb*.json "$HOME"/Desktop/*rtdb*.json 2>/dev/null | grep -v adminsdk | head -1)
fi
[ -n "$EXPORT" ] && [ -f "$EXPORT" ] || fail "Could not find the KOC export. Run: bash refresh-pprc.sh /full/path/to/the-export.json"

echo "Key file:    $KEY"
echo "KOC export:  $EXPORT"
echo "Database:    $DB (pprcMaster only)"
echo

echo "== 1/2 Rebuild the PPRC data"
node scripts/migrate-pprc.mjs "$EXPORT" .local-migration scripts/migration/name-decisions.json || fail "The migration failed (see above). Nothing was written."

echo; echo "== 2/2 Load it into the database"
if [ "$DRY" = 1 ]; then
  GOOGLE_APPLICATION_CREDENTIALS="$KEY" node scripts/import-pprc.mjs .local-migration/multiclub.json --database-url "$DB" --only pprcMaster
  echo; echo "Dry run only: nothing was written. Run without --dry-run to load it."
else
  GOOGLE_APPLICATION_CREDENTIALS="$KEY" node scripts/import-pprc.mjs .local-migration/multiclub.json --database-url "$DB" --only pprcMaster --replace --write || fail "The import failed (see above)."
  echo; echo "Done. Open /pprc on the live site to check the players, ratings and badges."
fi
