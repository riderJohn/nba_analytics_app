# Codebase Concerns

**Analysis Date:** 2026-04-27

---

## Tech Debt

**Duplicated `xgboost` and `scipy` entries in requirements.txt:**
- Issue: Both packages listed twice in `backend/requirements.txt` (lines 15-16 and 17-18). Also, `playwright` and `bs4` are imported in `backend/app/scraping/scrape_data.py` but absent from requirements.
- Files: `backend/requirements.txt`
- Impact: `playwright`/`bs4` will cause import errors if scraping code is ever run in a fresh environment. Duplicate entries are harmless but messy.
- Fix approach: Deduplicate requirements, add `playwright` and `beautifulsoup4` as optional/dev dependencies, or remove `scrape_data.py` entirely if the `nba_api` path is the canonical ingestion route.

**`scrape_data.py` is a script, not a module:**
- Issue: `backend/app/scraping/scrape_data.py` runs top-level code on import (browser launch, scraping). Hard-coded year 2026. Writes to a SQLite path (`./database/data/nba_data.db`) that no longer exists in the project. The module is excluded from the repo via `.gitignore` but is still tracked locally.
- Files: `backend/app/scraping/scrape_data.py`
- Impact: Importing the module crashes. The SQLite path is a dead reference. The file represents an abandoned ingestion approach that predates `nba_api`.
- Fix approach: Either delete the file or wrap all top-level code in a `if __name__ == "__main__":` guard and update the DB target. Long-term, unify ingestion under `nba_api`.

**`backend/app/testing/test.py` is empty:**
- Issue: File contains only a docstring. No tests exist anywhere in the project.
- Files: `backend/app/testing/test.py`
- Impact: There is zero automated test coverage. ML pipeline, data ingestion, and API endpoints are completely untested.
- Fix approach: Adopt `pytest` (already implied by `.gitignore` entry for `.pytest_cache/`). Add unit tests for `features.py` and `models.py` as highest priority.

**`__main__.py` has a hard-coded start date:**
- Issue: `start_date = ('2024-10-01')` is hard-coded with no override mechanism.
- Files: `backend/app/__main__.py`
- Impact: Re-running initial ingest always pulls from the same fixed date regardless of what is already in the database. This leads to redundant API calls and potential double-work on re-runs.
- Fix approach: Accept `start_date` as a CLI argument (e.g., via `argparse`) or query the DB for the latest `pull_date` before pulling (the same pattern already used in `api/main.py`'s `_sync_games`).

**`SessionLocal` used as a context manager in ingestion but not configured that way:**
- Issue: `backend/app/data/ingestion/game_overview_data_pull.py` and `team_data_pull.py` use `with SessionLocal() as conn:`. SQLAlchemy `sessionmaker` sessions are not context managers by default in older usage; this works in SQLAlchemy 1.4+ but the `SessionLocal` in `database.py` also defines `get_db()` as a generator yielding the same session type. The two patterns (context manager vs. `get_db()`) are inconsistent.
- Files: `backend/app/db/database.py`, `backend/app/data/ingestion/game_overview_data_pull.py`, `backend/app/data/ingestion/team_data_pull.py`
- Impact: Mixing two session acquisition patterns increases complexity and the risk of unclosed sessions.
- Fix approach: Standardize on `get_db()` with `Depends()` for FastAPI routes, and use `with SessionLocal() as db:` only in scripts/ingestion (acceptable), but document the distinction clearly.

**`docker-compose.yml` has no `healthcheck` on the `db` service:**
- Issue: The `api` service uses `depends_on: db` but there is no `healthcheck` on the `db` service, so `depends_on` only waits for the container to start—not for Postgres to be ready to accept connections.
- Files: `docker-compose.yml`
- Impact: The API container will crash on startup if Postgres isn't ready yet (race condition). Must be restarted manually or via `docker compose up --wait`.
- Fix approach: Add a `healthcheck` to the `db` service using `pg_isready`, and set `depends_on.db.condition: service_healthy` in the `api` service.

---

## Known Bugs

**`GameResponse` serialization mismatch — `game_id` type:**
- Symptoms: The `GameOverview` SQLAlchemy model stores `game_id` as `Integer`, but `frontend/src/types.ts` types `game_id` as `string`. The Pydantic `GameResponse` also types it as `int`. This works as long as the nba_api always returns numeric game IDs, but the frontend `GameResult` interface treats it as `string` (e.g., `seen.has(g.game_id)` in `Games.tsx` with a `Set<string>`).
- Files: `backend/app/api/models/games.py`, `backend/app/schemas/game.py`, `frontend/src/types.ts`, `frontend/src/pages/Games.tsx`
- Trigger: Integer IDs returned by the API will be coerced to strings in TypeScript via `JSON.parse`, but the Set-based deduplication in `Games.tsx` (`filterGames`) relies on string equality. This is likely working by accident.
- Workaround: Currently functional due to JS coercion, but should be made explicit.

**`build_feature_set` silently drops games with missing `away_pts_actual`:**
- Symptoms: In `backend/app/api/services/features.py`, `away_pts_actual` is set to `None` when no away row is found for a `game_id`. The row is still added to `training_rows` with `away_pts_actual=None`. This `None` will be passed to the regression model's `y` variable without any null-check, causing a silent `NaN` in training data.
- Files: `backend/app/api/services/features.py` (lines 49-53)
- Trigger: Any game where the away team row is missing from the DB (possible if partial ingestion occurred).
- Workaround: None in place. The regression model may silently train on NaN targets.

**`predict_outcome` and `_load_data` duplicate the entire data loading + rolling stats pipeline:**
- Symptoms: Both `predict_outcome` and `_load_data` in `backend/app/api/services/predict.py` perform identical DB queries, `_orm_to_df` conversions, and rolling stats builds. `predict_outcome` uses `game_date` as the cutoff for rolling stats; `_load_data` (used by `predict_full`) calls `get_team_rolling_stats` without a date cutoff (uses `datetime.today()` as default).
- Files: `backend/app/api/services/predict.py` (lines 27-79 vs 82-107)
- Trigger: Any prediction request. The inconsistent cutoff date means `predict_outcome` and `predict_full` compute rolling stats differently even for the same matchup.
- Workaround: None. This is a semantic inconsistency, not just duplication.

---

## Security Considerations

**No authentication or authorization on any API endpoint:**
- Risk: All endpoints (`/api/teams`, `/api/games`, `/api/predict`, `/api/predict/full`, `/api/predict/parlay`, `/api/schedule/{date}`) are fully public with no API key, token, or session requirement.
- Files: `backend/app/api/routers/games.py`, `backend/app/api/routers/predict.py`, `backend/app/api/routers/schedule.py`
- Current mitigation: None. The app is intended for personal/demo use currently.
- Recommendations: Add at minimum a static API key check via FastAPI middleware or a dependency before deploying to AWS ECS with a public URL.

**No CORS configuration on the FastAPI app:**
- Risk: Once deployed behind a real domain, the lack of explicit CORS headers means any origin can make cross-site requests to the API. Nginx proxies the `/api/` prefix in local dev, but direct API access (port 8000) is unprotected.
- Files: `backend/app/api/main.py`
- Current mitigation: Nginx proxy is the only in-place control, and only in Docker deployment.
- Recommendations: Add `fastapi.middleware.cors.CORSMiddleware` with an explicit `allow_origins` list.

**Database credentials constructed from environment variables without validation:**
- Risk: In `backend/app/config.py`, if any of the five `POSTGRES_*` env vars are unset, `DATABASE_URL` will contain `None` literally (e.g., `postgresql+psycopg2://None:None@None:None/None`). SQLAlchemy will fail at connection time, not at import time, giving a confusing error.
- Files: `backend/app/config.py`
- Current mitigation: None.
- Recommendations: Use `pydantic-settings` `BaseSettings` to validate required env vars at startup with clear error messages.

**`.env` file exists at repo root:**
- Risk: The `.env` file is listed in `.gitignore` and should not be committed, but it is present in the working directory and confirmed by the file listing.
- Files: `.env` (existence only noted — contents not read)
- Current mitigation: `.gitignore` entry prevents accidental commit.
- Recommendations: No action needed beyond the existing `.gitignore`. Confirm the file is absent from git history with `git log --all -- .env`.

---

## Performance Bottlenecks

**Full DB table scans on every prediction request:**
- Problem: `predict_outcome` and `predict_full` both call `db.query(GameOverview).all()` and `db.query(Team).all()`, loading the entire game and team tables into memory as Pandas DataFrames on every single prediction request.
- Files: `backend/app/api/services/predict.py` (lines 41-42, 84-85)
- Cause: No caching, no query filtering. With multiple seasons of data this becomes a large in-memory operation on each HTTP request.
- Improvement path: Cache the rolling stats DataFrame in memory (e.g., a module-level cache with a timestamp-based invalidation, or FastAPI's `lifespan` state). Alternatively filter the DB query to only load the seasons needed.

**Per-request model training (no model persistence):**
- Problem: Every call to `/api/predict` and `/api/predict/full` re-trains the ML model from scratch on the full historical dataset. `predict_full` trains four separate models (home regression, away regression, home residual std, away residual std) per request.
- Files: `backend/app/api/services/models.py`, `backend/app/api/services/regression.py`
- Cause: Models are defined as bare unfitted sklearn/xgboost objects in `classification_models` and `regression_models` dicts; `copy.deepcopy` is used to ensure freshness but fitting still happens per request.
- Improvement path: Pre-train models nightly (or on data refresh) and persist them with `joblib.dump`/`joblib.load`. Serve predictions from the loaded model. Retrain only when new data is ingested.

**Rolling stats rebuild for all 30 teams on every prediction request:**
- Problem: In both `predict_outcome` and `_load_data`, `get_team_rolling_stats` is called for every team ID in a loop, computing multi-window rolling averages across all historical games for all 30 teams on each request.
- Files: `backend/app/api/services/predict.py` (lines 51-58, 93-101), `backend/app/api/services/features.py`
- Cause: Stateless service design with no caching.
- Improvement path: Compute rolling stats once on startup or after data ingestion and store the result in a shared in-memory structure (e.g., FastAPI app state).

---

## Fragile Areas

**`build_feature_set` and `build_matchup_features` rely on hard-coded column drop lists:**
- Files: `backend/app/api/services/features.py` (lines 67-68, 101-102)
- Why fragile: Both functions call `.drop(labels=[...])` with a static list of column names: `['wl', 'game_id', 'game_date', 'matchup', 'team_id', 'team_abbreviation', 'team_name', 'pull_date']`. If any column is renamed in `GameOverview` or `TeamOverview`, or if a new column is added to the schema, these drops will raise `KeyError` at prediction time.
- Safe modification: Use `errors='ignore'` in `.drop()` calls as a short-term guard. Long-term, select columns by pattern (e.g., `rolling` prefix) rather than dropping by exclusion.
- Test coverage: Zero — no tests exist.

**`predict_game` in `models.py` aligns features by `X.columns` at prediction time:**
- Files: `backend/app/api/services/models.py` (line 68), `backend/app/api/services/regression.py` (lines 107-108)
- Why fragile: `matchup_features = matchup_features[X.columns]` — if the columns generated by `build_matchup_features` don't exactly match the columns used during training (e.g., due to a different data slice), this will raise a `KeyError` or silently reorder features incorrectly.
- Safe modification: Add explicit column alignment validation before prediction and raise a clear error if sets diverge.
- Test coverage: Zero.

**`_sync_games` startup function swallows all exceptions:**
- Files: `backend/app/api/main.py` (lines 37-39)
- Why fragile: The broad `except Exception` around `_sync_games()` means any failure in startup data sync (network errors, DB schema mismatch, nba_api rate limits) is silently swallowed and logged only as a warning. The API starts in a potentially stale data state with no user-visible indicator.
- Safe modification: At minimum, log the full exception traceback. Consider a startup health-check endpoint that exposes data freshness.
- Test coverage: Zero.

**Schedule endpoint uses date as a raw string path parameter:**
- Files: `backend/app/api/routers/schedule.py`, `backend/app/api/services/schedule.py`
- Why fragile: `date: str` is accepted with no format validation. If the caller passes `2026/04/27` or `April 27` instead of `2026-04-27`, `scoreboardv2.ScoreboardV2` will raise an unhandled nba_api error that propagates as a 500.
- Safe modification: Change the path parameter type to `datetime.date` and let FastAPI handle validation, or add explicit format checking in the service layer.
- Test coverage: Zero.

---

## Scaling Limits

**In-memory prediction pipeline:**
- Current capacity: Works fine for single-user, single-request scenarios.
- Limit: Under concurrent requests, each request independently loads all game rows into RAM and re-trains 2-4 models. With 2 seasons of data (~25,000 rows × 30 teams), a single prediction request may use 200-400MB of memory and take 5-30 seconds depending on the model.
- Scaling path: Model caching (see Performance section) is the primary fix. After caching, the app can handle concurrent requests normally.

**No pagination on `/api/games`:**
- Current capacity: Works for narrow date ranges (days to weeks).
- Limit: Requesting a full season returns thousands of rows with no limit or offset. With multiple seasons, this will be very slow and send large JSON payloads.
- Files: `backend/app/api/routers/games.py`, `backend/app/api/services/games.py`
- Scaling path: Add `limit` and `offset` query parameters to `get_games` and the endpoint.

---

## Dependencies at Risk

**`nba_api` is an unofficial, community-maintained library:**
- Risk: `nba_api` reverse-engineers the NBA stats website. The NBA has changed API endpoints without notice in the past, which has broken `nba_api` releases temporarily. There is no SLA or stability guarantee.
- Impact: Data ingestion (`game_overview_data_pull.py`, `team_data_pull.py`, `schedule.py`) would break silently or raise HTTP errors.
- Migration plan: No immediate alternative. Monitor the `nba_api` GitHub for issues before and after NBA.com changes. Consider caching ingested data aggressively to reduce dependency on live calls.

**`psycopg2-binary` used instead of `psycopg2`:**
- Risk: `psycopg2-binary` is not recommended for production by the psycopg2 maintainers because it bundles its own libpq and can conflict with system libraries in some Linux environments.
- Files: `backend/requirements.txt`
- Impact: Low risk for Docker-based deployment on standard images, but may cause issues on certain Alpine-based or ARM containers.
- Migration plan: Switch to `psycopg2` (compiled) in the production Dockerfile if issues arise, or use `psycopg[binary]` (psycopg3).

---

## Missing Critical Features

**No data validation on ML inputs (team abbreviation lookup can raise uncaught IndexError):**
- Problem: In `models.py` and `regression.py`, `team_df[team_df['abbreviation'] == home_team_abbr]['team_id'].values[0]` will raise `IndexError: index 0 is out of bounds` if an unknown abbreviation is passed. The router catches `ValueError` but not `IndexError`.
- Files: `backend/app/api/services/models.py` (line 59), `backend/app/api/services/regression.py` (line 86)
- Blocks: Any user that types a team abbreviation manually (e.g., via API testing) can crash the prediction endpoint with a 500 instead of a 400.

**No model versioning or model refresh trigger:**
- Problem: There is no mechanism to retrain or refresh models after new game data is ingested. Models train on whatever is in the DB at request time with no concept of a "current model version."
- Blocks: Reliable prediction quality as the season progresses. A stale model trained on early-season data will not incorporate recent games unless a prediction is explicitly requested.

**No environment variable validation at startup:**
- Problem: Missing or malformed `POSTGRES_*` env vars produce a confusing `sqlalchemy.exc.OperationalError` at the first DB call rather than a clear startup failure.
- Files: `backend/app/config.py`
- Blocks: Smooth onboarding for new developers and reliable Docker startup.

---

## Test Coverage Gaps

**Entire backend has zero tests:**
- What's not tested: ML feature engineering pipeline, model training, prediction endpoints, data ingestion, DB schema migrations, all API routes.
- Files: All files under `backend/app/api/services/`, `backend/app/data/ingestion/`
- Risk: Regressions in the feature pipeline (column drops, rolling windows, matchup construction) will not be caught until runtime. ML outputs are not validated for sanity (e.g., probabilities outside [0,1], negative point predictions).
- Priority: High — especially for `backend/app/api/services/features.py` and `backend/app/api/services/models.py` which are the most complex and fragile components.

**Frontend has zero tests:**
- What's not tested: API call wrappers in `frontend/src/api.ts`, type contracts between frontend and backend, UI state logic in `Predict.tsx` and `Games.tsx`.
- Files: `frontend/src/api.ts`, `frontend/src/pages/Predict.tsx`, `frontend/src/pages/Games.tsx`
- Risk: Frontend will silently break if API response shapes change.
- Priority: Medium — add at minimum snapshot or integration tests for the Predict page using Vitest + React Testing Library.

---

*Concerns audit: 2026-04-27*
