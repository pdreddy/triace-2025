# PPRC Singles Ladder

Production-oriented monorepo with a deployable static frontend and an independent FastAPI/PostgreSQL API.

## Structure

- `dist/` — dependency-free frontend; deploy this folder to Netlify.
- `backend/` — FastAPI service, PostgreSQL schema, rule validation, test suite, and seed data.

## Frontend deployment

Deploy `dist` directly to Netlify. Update `window.PPRC_API_URL` in `dist/app.js` (or the `/api` redirect in `netlify.toml`) to the deployed API. The preview intentionally works in demo mode when no API is configured.

## Backend setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://pprc:pprc@localhost:5432/pprc_ladder
uvicorn app.main:app --reload
pytest
```

Run `python -m app.seed` after migrations to create a sample 16-player season. Use Alembic in production and set CORS origins to the Netlify hostname.

## Architecture

The browser uses REST only. FastAPI owns authorization and every ladder rule; PostgreSQL owns transactions, audit events, rule snapshots, and durable records. Dates are stored as UTC and rendered in America/Chicago. A challenge snapshots season rules at creation, so later rule edits do not rewrite history.

## API surface

`GET /health`, `GET /seasons/{id}/standings`, `POST /challenges`, `POST /challenges/{id}/respond`, `POST /matches/{id}/submit`, `POST /extensions`, and admin endpoints under `/admin` for ranking actions, exemptions, disputes, exports, and season closure.

## Core data model

`seasons`, `season_rules`, `players`, `ladder_entries`, `challenges`, `matches`, `extensions`, `audit_log`. Every rank change records before/after positions and an actor in `audit_log`.
