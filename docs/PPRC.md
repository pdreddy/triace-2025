# PPRC master data, multi-club layout and rating algorithm

## One place for every player
`pprcMaster` is the single list of people across every club. A person is identified by a **name key**
(lower case, no accents or punctuation, single spaces) and gets the id `p_<name_key>`, so the same name
is always the same person in KOC, Triace and any later club. Contact details never go in this tree.

```
pprcMaster/
  meta/                       algorithm parameters + version, sources
  players/<playerId>          name, nameKey, seed {singles, doubles}, clubs {koc: true}, legacyIds, provisional?
  nameIndex/<nameKey>         playerId            (the lookup used when a captain types a name)
  ratings/<playerId>          singles, doubles, overall, seed, played, wins, losses, record, lastPlayed, version
  ratingHistory/<playerId>/<year>/<matchId>_<n>   one entry per court played (opponents, partner, games, change, after)
  recent/<playerId>           the latest 10 entries, newest first (what a profile loads first)
clubs/<club>/
  meta/
  seasons/<season>/
    meta/  teams/  matches/<matchId>      matches reference players by id; the typed names are kept for traceability
```
Clubs and seasons in the first migration: `koc` s2 and s3 (there is no KOC season 1 data); `triace` s1 (round robin plus the playoffs, including Super 6).

## The rating algorithm (`functions/lib/pprc.js`)
One function, `computePprc({ players, matches })`, rates every court from every club in time order.
- Start from the player's seed UTR (singles and doubles separately); a missing seed uses the other
  discipline, then 3.5. Ratings stay between 1.0 and 16.5.
- For each court the expected share of games comes from the rating gap (logistic, spread 0.75; doubles
  use the pair average). The actual score is 80% game share and 20% win/loss. Tiebreak points are not
  games; a match tiebreak counts as one.
- Change = K × boost × (actual − expected). K is 0.30 singles, 0.24 doubles. Newer players move faster
  (boost 2.5× at their first court, fading with a half-life of about 6 courts).
- A win never lowers a rating and a loss never raises it. Doubles partners move by the same amount.
- `overall` blends singles and doubles, with the seeds counting as one match each.
- Matches can arrive in any order; they are sorted by time, so recomputing everything gives the same answer
  as adding one match at the end. Courts with an unknown player are skipped and reported, never guessed.
- Parameters are versioned (`PPRC_PARAMS.version`); change them and recompute history.

Triace's own ratings (`league.js` → `playerRatings`) call this same function.

## History on a profile
`splitHistory(entries, 10)` returns the latest 10 matches, then everything older grouped by year.
The Triace player page shows the ten and opens a year only when it is clicked.

## Migrating the old databases (dry run)
```bash
node scripts/migrate-pprc.mjs <export.json> <out-dir> scripts/migration/name-decisions.json
```
Writes `multiclub.json` (the tree above), `report.md`, `report.json` and `name-decisions.csv`. It never contacts Firebase.

**Names.** Old matches often have only a first name. They are resolved in this order: your decision, exact name or
alias, a unique match on name parts, then the team's own known players (its other matches, and the KOC season 2/3
rosters and auction teams). Roster and auction names are added as people, and a shorter or reordered version of someone
already known is stored as an alias rather than a second person. Anything still ambiguous or unknown is **not guessed**:
it goes to `name-decisions.csv` (raw name, team, number of matches, candidates). Type the player's full name in the
`decision` column and run again with that file. A decision applies to that name for that team only (leave `team` empty
for a name that always means one person). A full name that is not in the master creates a new person.

Sources: KOC2DB (preferred, full names), KOC2DBPONEW, KOC2DBPO → KOC season 2; the rosters in `koc_s2` are used only to learn full names;
`koc_s3/matches` (approved only) → KOC season 3; TriAceDBNEW, TriAceDB, TriAceDB2 → Triace s1; TriAceDBNEW_Play and
TriAceDBSUPER6 → Triace s1 playoffs. Duplicates (the same match under two paths) are dropped, keeping the first source.

Confirmed decisions live in `scripts/migration/name-decisions.json` (keys are `Team::Name`, or a bare name for "always this person").
Names are compared ignoring capitalisation, so "Durga" and "DURGA" are one name and one row in the fixer page.
A decision that gives a single name (e.g. "Shivaji") creates a profile flagged `needsFullName`; give it a full name later
and re-run, and the same id and history carry over only if the name key is unchanged, so rename by adding the old name as an alias.

## Names
Every stored name is written like "Vivekvardhan Reddy Mereddy": single spaces, each part capitalised, initials kept
(`displayName` in `pprc.js`). Matching ignores capitalisation, so "DINKAR  bhardwaj" is the same person.

## Match history
Every history entry names the game it came from: `competition` (KOC, Triace), `seasonLabel`, `stageLabel` (League or
Playoffs), `title` ("KOC · Season 3 · League"), the date, both team names, the partner and the opponents. A profile shows
the latest 10 (`recent`), then older matches by year (`historyYears` lists the years; one year loads only when opened).

## Importing into the multi-club database
```bash
node scripts/migrate-pprc.mjs <export.json> <out-dir> scripts/migration/name-decisions.json
node scripts/import-pprc.mjs <out-dir>/multiclub.json --database-url https://multiclub-890ea-default-rtdb.firebaseio.com          # plan only
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/import-pprc.mjs <out-dir>/multiclub.json --database-url https://multiclub-890ea-default-rtdb.firebaseio.com --write
```
Plan only is the default and sends nothing. `--write` refuses to touch a section that already has data unless `--replace`
is added, and `--replace` first saves the existing data to `.local-migration/`. It writes in batches of 200 paths and
leaves a record under `importLog/`. Deploy `database.multiclub.rules.json` first (paste it into the Realtime Database
rules of the `multiclub-890ea` project): player data is publicly readable, nothing can be written from a browser, and the
import runs with a service account, which is not bound by the rules. The app reads it from `/pprc` and `/pprc/<playerId>`
(set `VITE_MULTICLUB_DATABASE_URL` to use another database).

## Triace registrations and the PPRC tick
Admin → **PPRC players** lists every registered player. Link each one to their PPRC profile (the player's own choice from
registration is offered first; you can also search, and for a captain type the full name). Linking stores the player's
current PPRC figures privately and puts only this on the public tier list, team page and player page:
- **PPRC 5.87** with a verified seal (a scalloped badge with a tick) when the player has played more than 5 rated matches;
- **PPRC NR** (not rated) for everyone else, including players with 5 or fewer matches or no link.

*Refresh linked* re-reads the figures for every linked player (run it after new matches are rated). *Export for PPRC*
downloads `triace-players.json`; then add those players to the shared list:
```bash
node scripts/import-triace-players.mjs triace-players.json --database-url https://multiclub-890ea-default-rtdb.firebaseio.com          # plan only
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/import-triace-players.mjs triace-players.json --database-url https://multiclub-890ea-default-rtdb.firebaseio.com --write
```
Players already in PPRC are marked as playing in Triace; new players with a full name are created and seeded from their
UTR; anyone with only a first name is skipped until you give a full name in the admin panel. Deploy the new `linkPprc`
Cloud Function (`firebase deploy --only functions`) before using the panel on the live site.
