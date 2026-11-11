# CLAUDE.md

Guidelines for every coding task in this repo (from https://github.com/multica-ai/andrej-karpathy-skills, MIT). They bias toward
caution over speed; for trivial tasks use judgment.

## 1. Think before coding
- State assumptions explicitly. If uncertain, ask. If several interpretations exist, present them; do not pick silently.
- If a simpler approach exists, say so and push back when warranted. If something is unclear, stop and name what is confusing.

## 2. Simplicity first
- Minimum code that solves the problem. No features, abstractions, configurability or error handling nobody asked for.
- If 200 lines could be 50, rewrite it.

## 3. Surgical changes
- Touch only what the task needs. Do not refactor or reformat adjacent code; match the existing style.
- Mention unrelated dead code, do not delete it. Remove only the imports and functions your own change made unused.
- Every changed line should trace to the request.

## 4. Goal-driven execution
- Turn the task into a verifiable goal: "fix the bug" means a test that reproduces it, then make it pass.
- For multi-step work, state a short plan with a check for each step, and loop until the checks pass.

## This project
- Web tooling needs Node 24.12+ (below 25); Cloud Functions run Node 22. Unit tests: `npm test`; build: `npm run build`.
- One command to deploy: `bash ship.sh` (`--dry-run` first). PPRC data refresh: `bash refresh-pprc.sh`.
- Shared Firebase project `multiclub-890ea`: never read, write or expose `clubs/koc` (live KOC data). PPRC data lives under
  `pprcMaster` and `pprcClubs`.
- Name spellings are settled in `scripts/migration/name-decisions.json`; results and UTRs in `scripts/migration/`.
