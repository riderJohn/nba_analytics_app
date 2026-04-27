# Codebase Structure

**Analysis Date:** 2026-04-27

## Directory Layout

```
nba_analytics_app/
├── backend/                    # Python FastAPI application
│   ├── app/
│   │   ├── __main__.py         # CLI entry point: seed DB + pull initial data
│   │   ├── config.py           # DATABASE_URL built from env vars
│   │   ├── api/
│   │   │   ├── main.py         # FastAPI app instance, router registration, lifespan
│   │   │   ├── models/         # Pydantic request/response models (API contracts)
│   │   │   │   ├── games.py
│   │   │   │   ├── predict.py
│   │   │   │   └── schedule.py
│   │   │   ├── routers/        # FastAPI route handlers
│   │   │   │   ├── games.py
│   │   │   │   ├── predict.py
│   │   │   │   └── schedule.py
│   │   │   └── services/       # Business logic, ML pipeline, DB queries
│   │   │       ├── features.py
│   │   │       ├── games.py
│   │   │       ├── models.py
│   │   │       ├── predict.py
│   │   │       ├── regression.py
│   │   │       └── schedule.py
│   │   ├── data/
│   │   │   └── ingestion/      # nba_api data pull + DB upsert scripts
│   │   │       ├── game_overview_data_pull.py
│   │   │       └── team_data_pull.py
│   │   ├── db/
│   │   │   └── database.py     # SQLAlchemy engine, SessionLocal, get_db, init_db
│   │   ├── schemas/            # SQLAlchemy ORM table definitions
│   │   │   ├── base.py
│   │   │   ├── game.py
│   │   │   └── team.py
│   │   ├── scraping/           # Playwright/BeautifulSoup scraping (stub)
│   │   │   └── scrape_data.py
│   │   └── testing/            # Ad-hoc test script (not pytest)
│   │       └── test.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # TypeScript + React SPA (Vite)
│   ├── src/
│   │   ├── main.tsx            # React root mount
│   │   ├── App.tsx             # Top-level component, page routing, theme state
│   │   ├── api.ts              # All fetch calls to backend (single source of truth)
│   │   ├── types.ts            # All shared TypeScript interfaces
│   │   ├── index.css           # Global styles + CSS custom properties (themes)
│   │   ├── components/
│   │   │   └── Navbar.tsx
│   │   └── pages/
│   │       ├── Schedule.tsx
│   │       ├── Games.tsx
│   │       └── Predict.tsx
│   ├── Dockerfile
│   ├── nginx.conf              # Prod: serves static files + proxies /api/ to FastAPI
│   ├── vite.config.ts          # Dev: proxy /api/ to localhost:8000
│   ├── tsconfig.json
│   ├── package.json
│   └── index.html
├── notebooks/                  # Jupyter notebooks for data exploration / ML prototyping
│   ├── test.ipynb
│   ├── NB1_SQL_Practice.ipynb
│   ├── NB2_Pandas_Practice.ipynb
│   └── NB3_Applied_Stats_UseCases.ipynb
├── docs/
│   └── vision_board.html
├── .planning/
│   └── codebase/               # GSD codebase analysis documents
├── docker-compose.yml          # Local multi-container: db + api + frontend
├── .env                        # DB credentials (not committed)
├── .gitignore
└── README.md
```

## Directory Purposes

**`backend/app/api/routers/`:**
- Purpose: HTTP boundary — declare routes, inject DB session, call services
- Contains: One file per domain (`games.py`, `schedule.py`, `predict.py`)
- Key files: `backend/app/api/routers/predict.py` (most complex: 3 endpoints)

**`backend/app/api/models/`:**
- Purpose: Pydantic models for HTTP request/response validation and serialization
- Contains: Input request classes, output response classes, nested sub-models
- Key files: `backend/app/api/models/predict.py` (7 Pydantic classes covering all predict variants)
- Note: "models" here means Pydantic API contracts, NOT ML models or ORM models

**`backend/app/api/services/`:**
- Purpose: All business logic lives here — DB queries, pandas feature engineering, sklearn/xgboost training and inference
- Contains: Domain services (`games.py`, `schedule.py`), ML pipeline (`features.py`, `models.py`, `regression.py`), orchestrator (`predict.py`)
- Key files: `backend/app/api/services/predict.py` (main predict orchestrator), `backend/app/api/services/features.py` (rolling window + feature set construction)

**`backend/app/schemas/`:**
- Purpose: SQLAlchemy ORM table definitions — these ARE the database schema
- Contains: `base.py` (shared `DeclarativeBase`), `game.py` (`GameOverview` → `game_overview_data` table), `team.py` (`Team` → `team_data` table)
- Key files: `backend/app/schemas/game.py` (27-column box score table with composite PK)

**`backend/app/data/ingestion/`:**
- Purpose: Pull data from `nba_api` and upsert into PostgreSQL
- Contains: `team_data_pull.py`, `game_overview_data_pull.py`
- Note: Called both from `__main__.py` (seed) and `api/main.py` lifespan (incremental sync)

**`backend/app/db/`:**
- Purpose: Database connection management
- Key files: `backend/app/db/database.py` — defines `engine`, `SessionLocal`, `get_db()` (FastAPI dependency), `init_db()`

**`frontend/src/pages/`:**
- Purpose: Full-page view components, one per app section
- Contains: `Schedule.tsx` (live schedule via nba_api), `Games.tsx` (historical game log browser), `Predict.tsx` (ML prediction + parlay calculator + session history)

**`frontend/src/components/`:**
- Purpose: Reusable UI components
- Contains: `Navbar.tsx` only (page navigation + theme switcher)

**`notebooks/`:**
- Purpose: Exploratory data analysis and ML prototyping; not imported by application code
- Generated: No — committed source
- Committed: Yes

**`backend/app/scraping/`:**
- Purpose: Playwright/BeautifulSoup web scraping (stub — `scrape_data.py` exists but is not wired into any endpoint)
- Generated: No
- Committed: Yes

**`backend/app/testing/`:**
- Purpose: Ad-hoc testing script (`test.py`) — not a pytest suite, not auto-discovered
- Generated: No

## Key File Locations

**Entry Points:**
- `backend/app/__main__.py`: Manual data seed (run once to populate DB)
- `backend/app/api/main.py`: FastAPI app — production entry point via uvicorn
- `frontend/src/main.tsx`: React DOM mount point

**Configuration:**
- `backend/app/config.py`: Reads env vars and assembles `DATABASE_URL`
- `.env`: Postgres credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`)
- `docker-compose.yml`: Service topology and env var wiring
- `frontend/vite.config.ts`: Dev server config and `/api/` proxy
- `frontend/nginx.conf`: Production proxy rules

**Core Logic:**
- `backend/app/api/services/features.py`: Rolling window computation and feature matrix construction
- `backend/app/api/services/models.py`: Classification model registry + fit/predict logic
- `backend/app/api/services/regression.py`: Regression model registry + point prediction + residual std + win probability
- `backend/app/api/services/predict.py`: Orchestrates full prediction pipeline

**Database Schema:**
- `backend/app/schemas/game.py`: `GameOverview` ORM model
- `backend/app/schemas/team.py`: `Team` ORM model
- `backend/app/schemas/base.py`: `Base = DeclarativeBase()`

**Frontend API Contract:**
- `frontend/src/api.ts`: All HTTP calls to backend — single file, no scattered fetch calls
- `frontend/src/types.ts`: All TypeScript interfaces mirroring backend Pydantic models

## Naming Conventions

**Backend Files:**
- Snake_case for all Python files: `game_overview_data_pull.py`, `team_data_pull.py`
- Domain-named files within each layer: `games.py`, `predict.py`, `schedule.py` appear in `routers/`, `models/`, and `services/`

**Backend Classes:**
- PascalCase for SQLAlchemy models: `GameOverview`, `Team`
- PascalCase for Pydantic models: `PredictRequest`, `FullPredictResponse`, `ParlayLeg`
- `*Request` suffix for input models, `*Response` suffix for output models

**Frontend Files:**
- PascalCase for React components: `Navbar.tsx`, `Schedule.tsx`, `Games.tsx`, `Predict.tsx`
- camelCase for utility files: `api.ts`, `types.ts`

**Frontend Types:**
- PascalCase interfaces: `Team`, `GameResult`, `FullPredictRequest`
- `*Request` / `*Response` mirrors backend naming

**API Routes:**
- All routes use `/api/` prefix, defined in each router via `prefix="/api"`
- Path params use snake_case: `/schedule/{date}`
- Query params use snake_case: `?start_date=...&end_date=...`

## Where to Add New Code

**New API endpoint (e.g. GET /api/standings):**
1. Pydantic models: create `backend/app/api/models/standings.py`
2. Service logic: create `backend/app/api/services/standings.py`
3. Router: create `backend/app/api/routers/standings.py` with `router = APIRouter(prefix="/api", tags=["standings"])`
4. Register: add `app.include_router(standings.router)` in `backend/app/api/main.py`
5. Frontend types: add interface to `frontend/src/types.ts`
6. Frontend fetch: add function to `frontend/src/api.ts`

**New database table:**
1. Add SQLAlchemy model in `backend/app/schemas/` extending `Base` from `backend/app/schemas/base.py`
2. Import in `backend/app/schemas/__init__.py` if it exists (currently empty `__init__.py`)
3. `init_db()` in `backend/app/db/database.py` will auto-create the table via `Base.metadata.create_all()`

**New ML model variant:**
- Add to the `classification_models` dict in `backend/app/api/services/models.py`, or `regression_models` in `backend/app/api/services/regression.py`
- The `FullPredictRequest.speed_mode` flag selects between model variants; extend this logic in `backend/app/api/services/predict.py`

**New frontend page:**
1. Create `frontend/src/pages/NewPage.tsx`
2. Add `Page` type variant in `frontend/src/App.tsx`
3. Add nav entry to `PAGES` array in `frontend/src/components/Navbar.tsx`
4. Add `<div style={{ display: ... }}><NewPage /></div>` block in `frontend/src/App.tsx`

**Shared utilities (backend):**
- No current `utils/` directory; add `backend/app/utils/` for helpers that cross domain boundaries

## Special Directories

**`.venv/`:**
- Purpose: Python virtual environment
- Generated: Yes
- Committed: No (in `.gitignore`)

**`frontend/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents for AI-assisted planning and execution
- Generated: Yes (by GSD tools)
- Committed: Recommended yes

**`backend/app/__pycache__/` and similar:**
- Purpose: Python bytecode cache
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-04-27*
