<!-- GSD:project-start source:PROJECT.md -->
## Project

**NBA Analytics Platform**

A sports analytics web app starting with the NBA that bridges advanced predictive modeling with sportsbook odds comparison. Sharp bettors use it to find edge — seeing where platform-provided ML models disagree with Vegas lines, and trusting those models because their historical performance is shown transparently using closing line value (CLV), the gold standard metric no mainstream competitor reports honestly. Built by two part-time developers with a serious product ambition.

**Core Value:** A sharp bettor can see tonight's NBA games, get win probability and point predictions from multiple platform models, compare those to current Vegas lines to find value, and evaluate each model's honest CLV-based track record — because a model's history against the closing line is the only proof that matters.

### Constraints

- **Tech stack**: FastAPI + PostgreSQL + React/TypeScript + Docker — already committed, existing code built on this
- **Team bandwidth**: 2 part-time developers — v1 scope must be achievable without burning out
- **Data**: nba_api for game stats (free, no auth required); odds API TBD (likely has rate limits or cost at scale)
- **Deployment**: Docker Compose → AWS ECS — architecture must support containerized deployment
- **Python version**: Dockerfile uses 3.11-slim but local venv is 3.14 — version mismatch needs resolving
- **No auth yet**: All endpoints currently public — user-specific features require auth layer first
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- Python 3.14 (system) / 3.14.3 venv - Backend API, data ingestion, ML pipeline
- TypeScript 5.0 - Frontend React application
- HTML/CSS - `frontend/index.html`, `frontend/src/index.css`
## Runtime
- Python 3.14.3 (venv at `.venv/`, created from system Python 3.14.3)
- Node.js v24.14.1 (frontend dev/build)
- Python: pip (no lockfile — only `backend/requirements.txt`)
- Node: npm (lockfile not committed per `.gitignore`)
## Frameworks
- FastAPI (unversioned in requirements) - REST API server, `backend/app/api/main.py`
- Uvicorn - ASGI server; CMD in `backend/Dockerfile`: `uvicorn app.api.main:app --host 0.0.0.0 --port 8000`
- SQLAlchemy (unversioned) - ORM for PostgreSQL, `backend/app/db/database.py`
- Pydantic (unversioned) - Request/response validation via FastAPI models
- React 18.2 - UI framework, `frontend/src/App.tsx`
- Vite 5.4.19 - Dev server and build tool, `frontend/vite.config.ts`
- React Router - Not yet present; navigation is page-component based
- scikit-learn (unversioned) - LogisticRegression, Ridge, StandardScaler, Pipeline; `backend/app/api/services/models.py`, `backend/app/api/services/regression.py`
- XGBoost (unversioned, listed twice in requirements) - XGBClassifier, XGBRegressor; same service files
- pandas (unversioned) - DataFrames throughout all service and ingestion layers
- numpy (unversioned) - Used in regression residual std calculations
- scipy (unversioned, listed twice in requirements) - `scipy.stats.norm` for win probability; `backend/app/api/services/regression.py`
- matplotlib / seaborn (unversioned) - Notebooks only
- Playwright (unversioned) - Used in `backend/app/scraping/scrape_data.py` (standalone script, not integrated into API)
- BeautifulSoup4 / bs4 (unversioned) - Used alongside Playwright in same script
- No test framework configured. `backend/app/testing/test.py` exists but uses no framework.
- `@vitejs/plugin-react` 4.0.0 - JSX transform for Vite
- Docker Compose - Local multi-container orchestration, `docker-compose.yml`
## Key Dependencies
- `nba_api` (unversioned) - Primary data source for game stats and schedule; `backend/app/data/ingestion/game_overview_data_pull.py`, `backend/app/api/services/schedule.py`
- `psycopg2-binary` (unversioned) - PostgreSQL adapter used in DATABASE_URL `postgresql+psycopg2://...`; `backend/app/config.py`
- `python-dotenv` (unversioned) - Loads `.env` into environment; `backend/app/config.py`
- `requests` (unversioned) - Listed in requirements; not directly imported in reviewed source (may be transitive dep)
- `jupyter` (unversioned) - Notebook support for `notebooks/` directory
## Configuration
- Configured via `.env` file at project root (existence confirmed, contents not read)
- Loaded by `python-dotenv` in `backend/app/config.py`
- Required vars (constructed into DATABASE_URL): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`
- Docker Compose passes these same vars to `api` and `db` containers via `${VAR}` syntax
- Backend: `backend/Dockerfile` — python:3.11-slim base, pip install, uvicorn CMD
- Frontend: `frontend/Dockerfile` — multi-stage: node:20-alpine build → nginx:alpine serve
- Frontend TypeScript config: `frontend/tsconfig.json` — target ES2020, strict mode enabled, jsx react-jsx
- Vite proxy: `/api` requests proxied to `http://localhost:8000` in dev; `frontend/vite.config.ts`
- Nginx: `/api/` proxied to `http://api:8000` in production; `frontend/nginx.conf`
## Platform Requirements
- Python 3.14+ with venv
- Node.js v24+ and npm
- PostgreSQL 16 (or via Docker: `postgres:16` image)
- Docker + Docker Compose for containerized local dev
- Target: Docker Compose (current) → AWS ECS (planned)
- Three containers: `db` (postgres:16), `api` (python:3.11-slim + uvicorn), `frontend` (nginx:alpine)
- Port exposure: frontend on 3000:80, db on 5432:5432, api internal only (expose 8000)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Modules use `snake_case`: `game_overview_data_pull.py`, `team_data_pull.py`
- Service files named after their domain: `games.py`, `predict.py`, `features.py`
- Schema (SQLAlchemy ORM) files named after domain entity: `game.py`, `team.py`
- Pydantic model (API shape) files named after domain entity: `games.py`, `predict.py`
- ORM models: `PascalCase` — `GameOverview`, `Team`
- Pydantic request/response models: `PascalCase` with `Request`/`Response` suffix — `PredictRequest`, `PredictResponse`, `FullPredictRequest`, `FullPredictResponse`
- Nested Pydantic models: `PascalCase` describing the data shape — `WinProbability`, `PointPrediction`, `ParlayLeg`
- Base classes: `NBAResponse` (in `backend/app/api/models/games.py`) used as shared Pydantic base with `from_attributes=True`
- All `snake_case`
- Private helpers prefixed with underscore: `_sync_games()`, `_orm_to_df()`, `_load_data()`, `_compute_residual_std()`
- Service functions named as verbs: `get_all_teams()`, `get_games()`, `predict_outcome()`, `predict_full()`
- Router endpoints named with `_endpoint` suffix: `get_teams_endpoint()`, `predict_endpoint()`
- Ingestion functions named as actions: `get_games()`, `pull_team_data()`
- `snake_case` throughout
- DataFrame variables conventionally suffixed with `_df`: `game_df`, `team_df`, `games_df`
- Rolling stats variable: `teams_rolling_stats` (plural team prefix)
- Model instances: `classification_models` dict, `regression_models` dict (plural noun)
- Page components: `PascalCase.tsx` in `frontend/src/pages/` — `Games.tsx`, `Predict.tsx`, `Schedule.tsx`
- UI components: `PascalCase.tsx` in `frontend/src/components/` — `Navbar.tsx`
- Utility/API modules: `camelCase.ts` — `api.ts`, `types.ts`
- All `PascalCase` with no `I` prefix: `Team`, `GameResult`, `PredictRequest`
- Union string literal types: `type Page = 'schedule' | 'games' | 'predict'`
- Theme type: `type Theme = 'dark' | 'nba' | 'retro'`
- Optional fields use `?` not `| undefined`: `speed_mode?: boolean`
- Nullable fields use explicit `| null`: `home_points_line: number | null`
- React components: `PascalCase` default exports — `export default function Predict()`
- Utility functions: `camelCase` — `todayStr()`, `formatTime()`, `pct()`, `pts()`
- API client functions: `camelCase` verb + noun — `fetchTeams()`, `fetchGames()`, `predictGame()`, `predictFull()`
- React state pairs: `camelCase` noun + setter `set` + noun — `[loading, setLoading]`, `[error, setError]`
- Abbreviation-based state names accepted: `[homeAbbr, setHomeAbbr]`, `[awayAbbr, setAwayAbbr]`
## Code Style
- No formatter configured (no `.prettierrc`, no `pyproject.toml` with Black/Ruff settings)
- Indentation: 4 spaces
- Blank lines: single blank line between top-level functions in service files; two blank lines absent before class bodies in schemas
- Trailing whitespace: inconsistent (some trailing spaces in `database.py`, `game.py`)
- No ESLint or Prettier config present
- TypeScript strict mode enabled: `"strict": true` in `frontend/tsconfig.json`
- Target: ES2020
- No linter configured on either backend or frontend
- TypeScript compiler (`tsc`) is the only static checker in use
## Import Organization
- Standard library imports first, then third-party, then local `app.*` imports
- Local imports separated by blank line from third-party in most files
- Module-level imports preferred; one exception: deferred import inside lifespan function in `backend/app/api/main.py` (`from app.data.ingestion.game_overview_data_pull import get_games`)
- Comment blocks used to label import groups in ingestion files: `# Python modules`, `# My modules`
- React and third-party hooks first, then local `../api`, `../types`, `./components`
- No path aliases configured — all imports use relative paths
## Error Handling
## Logging
- Progress: `print(f"Syncing games from {start_date} to {today}...")`
- Counts: `print(f"Synced {len(df)} game rows.")`
- Warnings: `print(f"Warning: startup game sync failed ({e}). API will still start.")`
- Success: `print("Database initialized successfully.")`
- Errors: `print("Error writing data to database:", e)`
## Comments
- Used selectively on service-layer functions that have non-obvious signatures or behavior:
- Inline docstrings on router endpoints to describe date format:
- Most functions lack docstrings; short functions are considered self-documenting
- Used heavily in complex service logic to label steps:
- Used in TSX to label sections: `{/* ── Section 1: Input bar ── */}`
- Section dividers in Pydantic models use comment banners: `# ── Full prediction ──────────────────────────────────────────────────────────`
## Function Design
- Short, single-purpose service functions (5–20 lines typical)
- Larger orchestration functions (`predict_full`, `predict_outcome`) are 50–80 lines
- Private helpers extracted when logic is reused: `_load_data()` shared between `predict_full` and `predict_outcome`
- Functions return typed tuples where multiple values needed: `-> tuple[float, float, float, float]`
- `verbose: bool = True` parameter pattern used to toggle between evaluation and prediction mode in `fit_evaluate_model()`
- Small pure formatting helpers extracted to module top level: `pct()`, `pts()`, `todayStr()`, `pm()`
- Async handlers defined as `const name = async () => { ... }` inside components
- No custom hooks yet — all logic lives directly in component bodies
## Module Design
- No `__all__` declarations — all module-level names are implicitly exported
- Modules intended for import export their main objects at module level: `classification_models`, `regression_models` dicts in service files
- All React components use `export default function ComponentName()`
- Types/interfaces use named exports: `export interface Team { ... }`
- API functions use named exports: `export const fetchTeams = ...`
- No barrel `index.ts` files — imports reference files directly
## SQLAlchemy ORM Pattern
## Pydantic Model Pattern
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- React SPA frontend communicates with FastAPI backend exclusively via `/api/*` REST endpoints
- Nginx reverse proxy in production routes `/api/` traffic to the FastAPI container; Vite dev proxy mirrors this locally
- Backend is organized in four clear layers: routers → services → schemas/DB → data ingestion
- ML inference is synchronous and request-scoped (no async job queue); models are fit on every prediction call using all historical data before the requested game date
- PostgreSQL is the sole data store; SQLAlchemy ORM manages schema and session lifecycle
## Layers
- Purpose: Declare FastAPI routes, validate request/response shapes via Pydantic models, delegate to services
- Location: `backend/app/api/routers/`
- Contains: `games.py`, `schedule.py`, `predict.py`
- Depends on: `api/models/` (Pydantic), `api/services/`, `db/database.py` (session injection)
- Used by: `api/main.py` via `app.include_router()`
- Purpose: Define request/response shapes for the HTTP layer; separate from SQLAlchemy ORM models
- Location: `backend/app/api/models/`
- Contains: `games.py` (TeamResponse, GameResponse), `predict.py` (all predict shapes), `schedule.py` (ScheduleResponse)
- Depends on: nothing internal
- Used by: routers
- Purpose: Implement all business logic — DB queries, feature engineering, ML model training, scoring
- Location: `backend/app/api/services/`
- Contains: `games.py`, `schedule.py`, `features.py`, `models.py`, `regression.py`, `predict.py`
- Depends on: `schemas/` (SQLAlchemy ORM classes), `db/database.py`, `nba_api`, `sklearn`, `xgboost`, `scipy`
- Used by: routers
- Purpose: Define database tables as SQLAlchemy `DeclarativeBase` subclasses
- Location: `backend/app/schemas/`
- Contains: `base.py` (DeclarativeBase), `game.py` (GameOverview → `game_overview_data`), `team.py` (Team → `team_data`)
- Depends on: `sqlalchemy`
- Used by: services, data ingestion, `db/database.py`
- Purpose: Engine creation, session factory, table initialization
- Location: `backend/app/db/database.py`
- Contains: `engine`, `SessionLocal`, `get_db()` (FastAPI dependency), `init_db()`
- Depends on: `app/config.py` (DATABASE_URL), `schemas/base.py`
- Used by: routers (via `Depends(get_db)`), data ingestion (direct `SessionLocal`)
- Purpose: Pull data from `nba_api` and upsert into PostgreSQL via SQLAlchemy `Session.merge()`
- Location: `backend/app/data/ingestion/`
- Contains: `team_data_pull.py` (pull_team_data), `game_overview_data_pull.py` (get_games)
- Depends on: `nba_api`, `schemas/`, `db/database.py`
- Used by: `app/__main__.py` (initial seed), `api/main.py` lifespan hook (incremental sync on startup)
- Purpose: React SPA — schedule viewer, game log browser, prediction UI with parlay calculator
- Location: `frontend/src/`
- Contains: `App.tsx` (routing), `api.ts` (all fetch calls), `types.ts` (shared TypeScript interfaces), `pages/` (Schedule, Games, Predict), `components/Navbar.tsx`
- Depends on: backend `/api/*` endpoints only
## Data Flow
- All state is local React `useState` within each page component
- Pages are always mounted; visibility toggled via CSS `display: none` to preserve state across tab switches (see `App.tsx`)
- Prediction history is in-memory `useState` in `Predict.tsx` (session only, not persisted)
## Key Abstractions
- Purpose: Single row = one team's stats for one game (two rows per game — home and away)
- Examples: `backend/app/schemas/game.py`
- Pattern: Composite primary key `(season_id, team_id, game_id)`; matchup string encodes home/away: `"BOS vs. MIA"` = home row, `"MIA @ BOS"` = away row
- Purpose: Decouple HTTP contract from DB schema; `NBAResponse` base class sets `from_attributes=True` for ORM-mode serialization
- Examples: `backend/app/api/models/games.py`, `backend/app/api/models/predict.py`
- Pattern: Request models in same file as response models, grouped by domain
- Purpose: One row per historical matchup with lagged rolling stats for home and away teams; target columns `home_wl` (classification) and `home_pts_actual`/`away_pts_actual` (regression)
- Examples: `backend/app/api/services/features.py` (`build_feature_set`)
- Pattern: Built on every prediction request from raw DB data; not cached or stored
- Purpose: Named dict of unfitted sklearn/xgboost estimators; `copy.deepcopy()` used per request to ensure request isolation
- Examples: `backend/app/api/services/models.py` (`classification_models`), `backend/app/api/services/regression.py` (`regression_models`)
- Pattern: `"xgboost"` and `"logistic"/"ridge"` keys; `speed_mode` flag in `FullPredictRequest` selects lighter models
## Entry Points
- Location: `backend/app/__main__.py`
- Triggers: `python -m app` from `backend/` directory
- Responsibilities: Initialize DB schema, pull team data, pull full game history from a hardcoded start date
- Location: `backend/app/api/main.py`
- Triggers: `uvicorn app.api.main:app` (production via `backend/Dockerfile` CMD)
- Responsibilities: Mount three routers (`/api/teams`, `/api/games`, `/api/schedule/{date}`, `/api/predict`, `/api/predict/full`, `/api/predict/parlay`), run incremental game sync on startup
- Location: `frontend/` (Vite, `npm run dev`)
- Triggers: `npm run dev` in `frontend/`
- Responsibilities: Serve React SPA on port 3000, proxy `/api/*` to `localhost:8000`
- Location: `docker-compose.yml` (project root)
- Triggers: `docker compose up`
- Responsibilities: Starts `db` (Postgres 16), `api` (FastAPI on 8000, internal only), `frontend` (Nginx on 3000:80); Nginx handles `/api/` proxying in production
## Error Handling
- Services raise `ValueError` for invalid input (unknown model name, empty DB, no historical data)
- Routers catch `ValueError` and raise `HTTPException(status_code=400, detail=str(e))`
- Startup sync errors are caught and printed as warnings; API starts regardless
- Frontend catches all API errors in try/catch blocks and sets an `error` state string displayed inline
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
