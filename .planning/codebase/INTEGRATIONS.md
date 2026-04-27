# External Integrations

**Analysis Date:** 2026-04-27

## APIs & External Services

**NBA Stats API:**
- Service: `nba_api` Python package — unofficial NBA stats API wrapper
- Used for: Game data ingestion (`leaguegamefinder`), schedule lookup (`scoreboardv2`), team metadata (`teams.get_teams()`)
- Endpoints consumed:
  - `nba_api.stats.endpoints.leaguegamefinder.LeagueGameFinder` — `backend/app/data/ingestion/game_overview_data_pull.py`
  - `nba_api.stats.endpoints.scoreboardv2.ScoreboardV2` — `backend/app/api/services/schedule.py`
  - `nba_api.stats.static.teams.get_teams()` — `backend/app/data/ingestion/team_data_pull.py`
- Auth: None required (public API)
- Rate limiting: NBA API has implicit rate limits; no retry/backoff logic currently implemented

**Basketball Reference (scraping, experimental):**
- Service: basketball-reference.com
- Used for: Box score scraping (standalone script only, not integrated into API)
- Client: Playwright + BeautifulSoup4 — `backend/app/scraping/scrape_data.py`
- URL pattern: `https://www.basketball-reference.com/boxscores/?month={m}&day={d}&year=2026`
- Auth: None; uses spoofed user-agent string
- Status: Standalone script, writes to legacy SQLite path (`./database/data/nba_data.db`), not connected to main PostgreSQL DB

## Data Storage

**Databases:**
- Type/Provider: PostgreSQL 16
- Container: `db` service in `docker-compose.yml` using `postgres:16` image
- Persistent volume: `db_data` Docker volume at `/var/lib/postgresql/data`
- Connection: Built from env vars in `backend/app/config.py`:
  ```
  postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}
  ```
- Client/ORM: SQLAlchemy with psycopg2-binary adapter — `backend/app/db/database.py`
- Tables managed: `game_overview_data` (`backend/app/schemas/game.py`), `team_data` (`backend/app/schemas/team.py`)
- Schema creation: `Base.metadata.create_all(bind=engine)` called at startup via `init_db()` in `backend/app/db/database.py`

**File Storage:**
- None. No S3 or filesystem-based file storage integrated.

**Caching:**
- None. No Redis or in-memory cache layer.

## Authentication & Identity

**Auth Provider:**
- None. No authentication or identity provider integrated.
- All API endpoints are publicly accessible.
- No JWT, session, or OAuth implementation present.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Datadog, or equivalent.

**Logs:**
- `print()` statements throughout ingestion and startup code
- FastAPI default access logging via Uvicorn
- No structured logging framework configured

## CI/CD & Deployment

**Hosting:**
- Local: Docker Compose (`docker-compose.yml`) — three services: db, api, frontend
- Planned: AWS ECS (not yet configured)

**CI Pipeline:**
- None. No GitHub Actions, CircleCI, or equivalent configured.

## Environment Configuration

**Required env vars (from `backend/app/config.py` and `docker-compose.yml`):**
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name
- `POSTGRES_HOST` - Host (set to `db` inside Docker Compose network)
- `POSTGRES_PORT` - Port (set to `5432`)

**Secrets location:**
- `.env` file at project root — loaded by `python-dotenv`, referenced by Docker Compose `${VAR}` syntax
- `.env` is gitignored

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing:**
- None.

## Frontend-to-Backend Communication

**Pattern:** REST over HTTP via fetch API
- Client: `frontend/src/api.ts` — typed fetch wrappers for all endpoints
- Base path: `/api` (proxied to `http://localhost:8000` in dev via `frontend/vite.config.ts`; proxied to `http://api:8000` in production via `frontend/nginx.conf`)
- Endpoints consumed by frontend:
  - `GET /api/teams` — `fetchTeams()`
  - `GET /api/games?start_date=&end_date=` — `fetchGames()`
  - `GET /api/schedule/{date}` — `fetchSchedule()`
  - `POST /api/predict` — `predictGame()`
  - `POST /api/predict/full` — `predictFull()`
  - `POST /api/predict/parlay` — `predictParlay()`

---

*Integration audit: 2026-04-27*
