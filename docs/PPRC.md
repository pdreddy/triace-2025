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
Clubs and seasons in the first migration: `koc` s1, s2 (teams and schedule only, no results), s3; `triace` s1 (round robin plus the playoffs, including Super 6).

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
node scripts/migrate-pprc.mjs <export.json> <out-dir> [decisions.csv | overrides.json]
```
Writes `multiclub.json` (the tree above), `report.md`, `report.json` and `name-decisions.csv`. It never contacts Firebase.

**Names.** Old matches often have only a first name. They are resolved in this order: your decision, exact name or
alias, a unique match on name parts, then the team's own known players (its other matches, and the KOC season 2/3
rosters and auction teams). Roster and auction names are added as people, and a shorter or reordered version of someone
already known is stored as an alias rather than a second person. Anything still ambiguous or unknown is **not guessed**:
it goes to `name-decisions.csv` (raw name, team, number of matches, candidates). Type the player's full name in the
`decision` column and run again with that file. A decision applies to that name for that team only (leave `team` empty
for a name that always means one person). A full name that is not in the master creates a new person.

Sources: KOC2DB (preferred, full names), KOC2DBPONEW, KOC2DBPO → KOC s1; KOC season 2 teams from `koc_s2`;
`koc_s3/matches` (approved only) → KOC s3; TriAceDBNEW, TriAceDB, TriAceDB2 → Triace s1; TriAceDBNEW_Play and
TriAceDBSUPER6 → Triace s1 playoffs. Duplicates (the same match under two paths) are dropped, keeping the first source.
