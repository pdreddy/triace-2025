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
pprcClubs/<club>/
  meta/
  seasons/<season>/
    meta/  teams/  matches/<matchId>      matches reference players by id; the typed names are kept for traceability
```
The club history is stored under `pprcClubs`, never under `clubs`: the project's own `clubs` node holds the live KOC season data and admin settings (including a password), so the import never reads, writes or exposes it, and it must not be made publicly readable.
Clubs and seasons in the first migration: `koc` s2 and s3 (there is no KOC season 1 data); `triace` s1 (round robin plus the playoffs, including Super 6).

## The rating algorithm (`functions/lib/pprc.js`, version 2: UTR-style)
One function, `computePprc({ players, matches })`, rates every court from every club together. It works the way UTR does:
- **A court's performance** is the opponents' level plus a margin from the share of games won: an even share is the same
  level, winning 92% of the games is 2.0 above (the share is limited to 8%..92%, so one 8-0 cannot say more than that).
  A win is never rated below the opponents' level. Tiebreak points are not games; a match tiebreak counts as one.
- **Doubles** performances are worked out from the pair's level and split between the partners, so a strong partner does
  not inflate your rating. Singles and doubles are rated **separately**; `overall` blends them by the evidence behind each.
- **The rating is a weighted average of performances.** Recent courts count more (half as much every 150 days), courts with
  more games count more (up to 16), and courts against opponents whose own rating is still uncertain count less.
- **The seed (UTR) is the starting point** and counts like 24 games of evidence, so a new player stays near it and moves
  away as evidence builds. That share is the rating's **reliability** (0 to 1). A rating is *verified* in Triace once the
  player has more than 5 rated courts.
- **Ratings depend on each other** (you are measured against your opponents), so they are solved together over every match
  from every club until they settle. The result does not depend on the order matches were entered; a new match refines it.
  Ratings are worked out as of the latest match, so with no new matches they do not change.
- Courts with an unknown player are skipped and reported, never guessed. Ratings stay between 1.0 and 16.5.
- Parameters are versioned (`PPRC_PARAMS.version`); change them and recompute history, then re-import with
  `node scripts/import-pprc.mjs .local-migration/multiclub.json --database-url <url> --only pprcMaster --replace --write`
  (it saves a backup of the old `pprcMaster` first and never touches `pprcClubs` or `clubs`).

Triace's own ratings (`league.js` > `playerRatings`) call this same function. Players show **UTR singles / doubles** and
**PPRC singles / doubles** on the tier list, team page and player page; PPRC shows as NR until verified.

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
leaves a record under `importLog/`.

**Rules first, and add them, never replace.** The Triace app lives in the same Firebase project (`multiclub-890ea`) and
has its own rules, so pasting a different rules file into the console would break the live site. In Firebase console >
Realtime Database > Rules, add these two blocks next to the existing ones (inside `"rules": { ... }`) and publish:
```json
"pprcMaster": { ".read": true },
"pprcClubs": { ".read": true }
```
The repo's `database.rules.template.json` / `database.rules.json` already contain them (so `./deploy.sh --rules` would also
add them, but it replaces the whole project's rules, so compare with the console first if anything else uses this database).
Player data is then publicly readable, nothing can be written from a browser, and the import runs with a service account,
which is not bound by the rules. The app reads it from `/pprc` and `/pprc/<playerId>` (set `VITE_MULTICLUB_DATABASE_URL`
to use another database).

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

## Uploading UTRs (admin → PPRC → "Update UTR from a file")
Upload a CSV or JSON file (`name` or `first name` + `last name`, `singles`, `doubles`; a UTR export works as is). The page
matches each name to a PPRC player, previews what changes (update / new / same / ambiguous / skipped) and saves nothing
until you press Apply. Apply calls the `syncPprcUtr` function, which stores the new UTRs (with history under
`pprcMaster/utrHistory`), adds new full-name players, and recalculates every rating from the stored matches. Afterwards
press "Refresh linked" so Triace's stored badges update. Deploy functions after pulling: `./deploy.sh --no-hosting --skip-browser-tests`.
The full player list and each profile are public at `/pprc` and `/pprc/<id>`.
