# Technology Stack

**Analysis Date:** 2026-04-27

## Languages

**Primary:**
- Python 3.14 (system) / 3.14.3 venv - Backend API, data ingestion, ML pipeline
- TypeScript 5.0 - Frontend React application

**Secondary:**
- HTML/CSS - `frontend/index.html`, `frontend/src/index.css`

## Runtime

**Environment:**
- Python 3.14.3 (venv at `.venv/`, created from system Python 3.14.3)
- Node.js v24.14.1 (frontend dev/build)

**Package Manager:**
- Python: pip (no lockfile — only `backend/requirements.txt`)
- Node: npm (lockfile not committed per `.gitignore`)

## Frameworks

**Core Backend:**
- FastAPI (unversioned in requirements) - REST API server, `backend/app/api/main.py`
- Uvicorn - ASGI server; CMD in `backend/Dockerfile`: `uvicorn app.api.main:app --host 0.0.0.0 --port 8000`
- SQLAlchemy (unversioned) - ORM for PostgreSQL, `backend/app/db/database.py`
- Pydantic (unversioned) - Request/response validation via FastAPI models

**Core Frontend:**
- React 18.2 - UI framework, `frontend/src/App.tsx`
- Vite 5.4.19 - Dev server and build tool, `frontend/vite.config.ts`
- React Router - Not yet present; navigation is page-component based

**ML/Data Science:**
- scikit-learn (unversioned) - LogisticRegression, Ridge, StandardScaler, Pipeline; `backend/app/api/services/models.py`, `backend/app/api/services/regression.py`
- XGBoost (unversioned, listed twice in requirements) - XGBClassifier, XGBRegressor; same service files
- pandas (unversioned) - DataFrames throughout all service and ingestion layers
- numpy (unversioned) - Used in regression residual std calculations
- scipy (unversioned, listed twice in requirements) - `scipy.stats.norm` for win probability; `backend/app/api/services/regression.py`
- matplotlib / seaborn (unversioned) - Notebooks only

**Scraping (experimental):**
- Playwright (unversioned) - Used in `backend/app/scraping/scrape_data.py` (standalone script, not integrated into API)
- BeautifulSoup4 / bs4 (unversioned) - Used alongside Playwright in same script

**Testing:**
- No test framework configured. `backend/app/testing/test.py` exists but uses no framework.

**Build/Dev:**
- `@vitejs/plugin-react` 4.0.0 - JSX transform for Vite
- Docker Compose - Local multi-container orchestration, `docker-compose.yml`

## Key Dependencies

**Critical:**
- `nba_api` (unversioned) - Primary data source for game stats and schedule; `backend/app/data/ingestion/game_overview_data_pull.py`, `backend/app/api/services/schedule.py`
- `psycopg2-binary` (unversioned) - PostgreSQL adapter used in DATABASE_URL `postgresql+psycopg2://...`; `backend/app/config.py`
- `python-dotenv` (unversioned) - Loads `.env` into environment; `backend/app/config.py`

**Infrastructure:**
- `requests` (unversioned) - Listed in requirements; not directly imported in reviewed source (may be transitive dep)
- `jupyter` (unversioned) - Notebook support for `notebooks/` directory

## Configuration

**Environment:**
- Configured via `.env` file at project root (existence confirmed, contents not read)
- Loaded by `python-dotenv` in `backend/app/config.py`
- Required vars (constructed into DATABASE_URL): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`
- Docker Compose passes these same vars to `api` and `db` containers via `${VAR}` syntax

**Build:**
- Backend: `backend/Dockerfile` — python:3.11-slim base, pip install, uvicorn CMD
  - Note: Dockerfile specifies Python 3.11-slim but local venv is 3.14.3 — version mismatch
- Frontend: `frontend/Dockerfile` — multi-stage: node:20-alpine build → nginx:alpine serve
- Frontend TypeScript config: `frontend/tsconfig.json` — target ES2020, strict mode enabled, jsx react-jsx
- Vite proxy: `/api` requests proxied to `http://localhost:8000` in dev; `frontend/vite.config.ts`
- Nginx: `/api/` proxied to `http://api:8000` in production; `frontend/nginx.conf`

## Platform Requirements

**Development:**
- Python 3.14+ with venv
- Node.js v24+ and npm
- PostgreSQL 16 (or via Docker: `postgres:16` image)
- Docker + Docker Compose for containerized local dev

**Production:**
- Target: Docker Compose (current) → AWS ECS (planned)
- Three containers: `db` (postgres:16), `api` (python:3.11-slim + uvicorn), `frontend` (nginx:alpine)
- Port exposure: frontend on 3000:80, db on 5432:5432, api internal only (expose 8000)

---

*Stack analysis: 2026-04-27*
