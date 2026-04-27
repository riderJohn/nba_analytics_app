# Architecture

**Analysis Date:** 2026-04-27

## Pattern Overview

**Overall:** Three-tier client-server architecture with a layered backend

**Key Characteristics:**
- React SPA frontend communicates with FastAPI backend exclusively via `/api/*` REST endpoints
- Nginx reverse proxy in production routes `/api/` traffic to the FastAPI container; Vite dev proxy mirrors this locally
- Backend is organized in four clear layers: routers → services → schemas/DB → data ingestion
- ML inference is synchronous and request-scoped (no async job queue); models are fit on every prediction call using all historical data before the requested game date
- PostgreSQL is the sole data store; SQLAlchemy ORM manages schema and session lifecycle

## Layers

**Routers (HTTP boundary):**
- Purpose: Declare FastAPI routes, validate request/response shapes via Pydantic models, delegate to services
- Location: `backend/app/api/routers/`
- Contains: `games.py`, `schedule.py`, `predict.py`
- Depends on: `api/models/` (Pydantic), `api/services/`, `db/database.py` (session injection)
- Used by: `api/main.py` via `app.include_router()`

**Pydantic Models (API contracts):**
- Purpose: Define request/response shapes for the HTTP layer; separate from SQLAlchemy ORM models
- Location: `backend/app/api/models/`
- Contains: `games.py` (TeamResponse, GameResponse), `predict.py` (all predict shapes), `schedule.py` (ScheduleResponse)
- Depends on: nothing internal
- Used by: routers

**Services (business logic):**
- Purpose: Implement all business logic — DB queries, feature engineering, ML model training, scoring
- Location: `backend/app/api/services/`
- Contains: `games.py`, `schedule.py`, `features.py`, `models.py`, `regression.py`, `predict.py`
- Depends on: `schemas/` (SQLAlchemy ORM classes), `db/database.py`, `nba_api`, `sklearn`, `xgboost`, `scipy`
- Used by: routers

**Schemas (ORM models):**
- Purpose: Define database tables as SQLAlchemy `DeclarativeBase` subclasses
- Location: `backend/app/schemas/`
- Contains: `base.py` (DeclarativeBase), `game.py` (GameOverview → `game_overview_data`), `team.py` (Team → `team_data`)
- Depends on: `sqlalchemy`
- Used by: services, data ingestion, `db/database.py`

**Database Layer:**
- Purpose: Engine creation, session factory, table initialization
- Location: `backend/app/db/database.py`
- Contains: `engine`, `SessionLocal`, `get_db()` (FastAPI dependency), `init_db()`
- Depends on: `app/config.py` (DATABASE_URL), `schemas/base.py`
- Used by: routers (via `Depends(get_db)`), data ingestion (direct `SessionLocal`)

**Data Ingestion:**
- Purpose: Pull data from `nba_api` and upsert into PostgreSQL via SQLAlchemy `Session.merge()`
- Location: `backend/app/data/ingestion/`
- Contains: `team_data_pull.py` (pull_team_data), `game_overview_data_pull.py` (get_games)
- Depends on: `nba_api`, `schemas/`, `db/database.py`
- Used by: `app/__main__.py` (initial seed), `api/main.py` lifespan hook (incremental sync on startup)

**Frontend:**
- Purpose: React SPA — schedule viewer, game log browser, prediction UI with parlay calculator
- Location: `frontend/src/`
- Contains: `App.tsx` (routing), `api.ts` (all fetch calls), `types.ts` (shared TypeScript interfaces), `pages/` (Schedule, Games, Predict), `components/Navbar.tsx`
- Depends on: backend `/api/*` endpoints only

## Data Flow

**Initial Data Seed:**
1. Developer runs `python -m app` (`backend/app/__main__.py`)
2. `init_db()` creates tables from SQLAlchemy models
3. `pull_team_data()` fetches all NBA teams from `nba_api.stats.static.teams`, upserts into `team_data`
4. `get_games(start_date)` fetches game logs from `nba_api.stats.endpoints.leaguegamefinder`, upserts into `game_overview_data`

**Startup Incremental Sync (API server):**
1. `api/main.py` lifespan context manager runs on FastAPI startup
2. Queries `MAX(pull_date)` from `game_overview_data`
3. If stale, calls `get_games(last_pull + 1 day, today)` to fill the gap
4. API starts regardless of whether sync succeeds

**Game Results Request:**
1. Frontend `fetchGames(startDate, endDate)` → `GET /api/games?start_date=...&end_date=...`
2. `routers/games.py` validates params, calls `services/games.get_games(db, ...)`
3. Service queries `GameOverview` via SQLAlchemy filter on `game_date`
4. Returns list of ORM objects; FastAPI serializes via `GameResponse` Pydantic model

**ML Prediction Request (Full):**
1. Frontend `predictFull(req)` → `POST /api/predict/full`
2. `routers/predict.py` validates `FullPredictRequest`, calls `services/predict.predict_full(request, db)`
3. Service loads all `GameOverview` and `Team` rows from DB into pandas DataFrames
4. `services/features.get_team_rolling_stats()` computes 3/5/7/10-game rolling windows for every team
5. `services/features.build_feature_set()` constructs one row per historical game with home/away lagged features
6. `services/models.predict_game()` fits classifier on data before game_date, predicts win probability
7. `services/regression.predict_game_points()` fits separate home/away regressors, produces point predictions + residual std
8. `services/regression.monte_carlo_win_prob()` derives regression-based win probability via closed-form normal CDF
9. Ensemble = average of classifier and regression probabilities
10. Returns `FullPredictResponse`

**State Management (Frontend):**
- All state is local React `useState` within each page component
- Pages are always mounted; visibility toggled via CSS `display: none` to preserve state across tab switches (see `App.tsx`)
- Prediction history is in-memory `useState` in `Predict.tsx` (session only, not persisted)

## Key Abstractions

**GameOverview (SQLAlchemy ORM):**
- Purpose: Single row = one team's stats for one game (two rows per game — home and away)
- Examples: `backend/app/schemas/game.py`
- Pattern: Composite primary key `(season_id, team_id, game_id)`; matchup string encodes home/away: `"BOS vs. MIA"` = home row, `"MIA @ BOS"` = away row

**Pydantic API Models:**
- Purpose: Decouple HTTP contract from DB schema; `NBAResponse` base class sets `from_attributes=True` for ORM-mode serialization
- Examples: `backend/app/api/models/games.py`, `backend/app/api/models/predict.py`
- Pattern: Request models in same file as response models, grouped by domain

**Feature Set DataFrame:**
- Purpose: One row per historical matchup with lagged rolling stats for home and away teams; target columns `home_wl` (classification) and `home_pts_actual`/`away_pts_actual` (regression)
- Examples: `backend/app/api/services/features.py` (`build_feature_set`)
- Pattern: Built on every prediction request from raw DB data; not cached or stored

**Classification/Regression Model Registries:**
- Purpose: Named dict of unfitted sklearn/xgboost estimators; `copy.deepcopy()` used per request to ensure request isolation
- Examples: `backend/app/api/services/models.py` (`classification_models`), `backend/app/api/services/regression.py` (`regression_models`)
- Pattern: `"xgboost"` and `"logistic"/"ridge"` keys; `speed_mode` flag in `FullPredictRequest` selects lighter models

## Entry Points

**Manual Data Seed:**
- Location: `backend/app/__main__.py`
- Triggers: `python -m app` from `backend/` directory
- Responsibilities: Initialize DB schema, pull team data, pull full game history from a hardcoded start date

**FastAPI Application:**
- Location: `backend/app/api/main.py`
- Triggers: `uvicorn app.api.main:app` (production via `backend/Dockerfile` CMD)
- Responsibilities: Mount three routers (`/api/teams`, `/api/games`, `/api/schedule/{date}`, `/api/predict`, `/api/predict/full`, `/api/predict/parlay`), run incremental game sync on startup

**Frontend Dev Server:**
- Location: `frontend/` (Vite, `npm run dev`)
- Triggers: `npm run dev` in `frontend/`
- Responsibilities: Serve React SPA on port 3000, proxy `/api/*` to `localhost:8000`

**Docker Compose:**
- Location: `docker-compose.yml` (project root)
- Triggers: `docker compose up`
- Responsibilities: Starts `db` (Postgres 16), `api` (FastAPI on 8000, internal only), `frontend` (Nginx on 3000:80); Nginx handles `/api/` proxying in production

## Error Handling

**Strategy:** Raise Python exceptions in services; catch at router boundary and convert to HTTP errors

**Patterns:**
- Services raise `ValueError` for invalid input (unknown model name, empty DB, no historical data)
- Routers catch `ValueError` and raise `HTTPException(status_code=400, detail=str(e))`
- Startup sync errors are caught and printed as warnings; API starts regardless
- Frontend catches all API errors in try/catch blocks and sets an `error` state string displayed inline

## Cross-Cutting Concerns

**Logging:** `print()` statements only — no structured logging framework
**Validation:** Pydantic models handle input validation automatically at the router layer; no manual validation in services
**Authentication:** None — all endpoints are public
**DB Sessions:** Injected via FastAPI `Depends(get_db)` for router-invoked services; direct `SessionLocal()` context manager used in data ingestion scripts

---

*Architecture analysis: 2026-04-27*
