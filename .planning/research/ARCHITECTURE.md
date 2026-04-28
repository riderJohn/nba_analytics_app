# Architecture Patterns

**Domain:** Sports analytics platform — odds ingestion, prediction logging, CLV reconciliation, model performance analytics
**Researched:** 2026-04-27
**Confidence:** HIGH (existing codebase fully mapped; patterns are well-established in the FastAPI/PostgreSQL ecosystem)

---

## Existing Architecture (Baseline)

Three-tier: React SPA → Nginx → FastAPI → PostgreSQL.

Current backend layers: routers → services → schemas (ORM) → db. ML inference is synchronous and request-scoped — models are fit on every prediction call from raw DB data, no caching.

What is missing for v1: an odds data source, a persistence layer for predictions, a reconciliation job that records closing lines post-game, and analytics queries over the prediction log.

---

## Recommended Architecture (Extended)

### New Components to Add

```
[APScheduler Scheduler]
    |-- OddsIngestor (pulls Vegas lines on schedule, writes to odds_snapshots)
    |-- ReconciliationJob (post-game, reads odds_snapshots + game results, writes CLV to prediction_log)

[PostgreSQL]
    |-- odds_snapshots      (raw odds feed, timestamped)
    |-- prediction_log      (pre-game snapshot: model probabilities + opening line at prediction time)
    |-- prediction_outcomes (closing line + CLV written after game closes)

[FastAPI Services — new]
    |-- OddsService         (read current lines from odds_snapshots)
    |-- PredictionLogService (write prediction_log on /predict calls, read for analytics)
    |-- AnalyticsService    (aggregate queries: CLV per model, ROI, win rate, sample size)

[FastAPI Routers — new]
    |-- /api/odds           (GET current lines for tonight's games)
    |-- /api/analytics      (GET model track records, leaderboard)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| APScheduler (in-process) | Run timed jobs: odds pull (every ~15 min during game days), reconciliation (nightly) | OddsIngestor, ReconciliationJob, PostgreSQL |
| OddsIngestor | HTTP call to odds API (The Odds API or OddsJam), parse response, upsert `odds_snapshots` | External odds API, PostgreSQL |
| ReconciliationJob | Query `prediction_log` for unreconciled rows, find closing line in `odds_snapshots`, compute CLV, write `prediction_outcomes` | PostgreSQL only |
| OddsService | Read latest line per game from `odds_snapshots` | PostgreSQL |
| PredictionLogService | On every `/predict/full` call, write a row to `prediction_log` with model probs + line at time of prediction | PostgreSQL |
| AnalyticsService | Aggregate `prediction_log JOIN prediction_outcomes` for per-model stats | PostgreSQL |
| `/api/analytics` router | Serve model leaderboard and per-model track record to frontend | AnalyticsService |

---

## Data Flow

### 1. Odds Ingestion (scheduled)

```
APScheduler trigger (cron: every 15 min on game days)
  → OddsIngestor.pull()
      → GET https://api.the-odds-api.com/v4/sports/basketball_nba/odds/
      → parse: game_id, commence_time, home_team, away_team, bookmaker, home_price, away_price
      → upsert odds_snapshots (composite PK: game_id + bookmaker + snapshot_ts)
  → done; no HTTP response needed
```

The Odds API returns American or decimal odds. Store both raw lines (e.g., -110) and the implied probability you compute from them. Implied prob = 1 / (1 + (abs(moneyline)/100)) normalized to remove vig. Store both: raw for auditability, implied_prob for CLV math.

### 2. Prediction Logging (on every /predict/full call)

```
POST /api/predict/full
  → routers/predict.py validates request
  → services/predict.predict_full() runs ML (unchanged)
  → [NEW] services/prediction_log.log_prediction(game_id, model_name, model_prob, current_line_implied_prob, snapshot_ts)
      → writes to prediction_log
  → returns FullPredictResponse (unchanged)
```

The log row captures: `game_id`, `model_name`, `predicted_win_prob`, `opening_implied_prob` (odds at time of prediction), `prediction_ts`, `reconciled=False`.

### 3. Closing Line Reconciliation (nightly scheduled job)

```
APScheduler trigger (cron: 3 AM, after games have closed)
  → ReconciliationJob.run()
      → SELECT * FROM prediction_log WHERE reconciled = false AND game_date < today
      → for each row:
          → find latest odds_snapshot for that game_id before game start (closing line)
          → compute CLV = model_prob - closing_implied_prob
            (positive CLV = model was better than the closing market)
          → write prediction_outcomes(prediction_id, closing_implied_prob, clv, game_result)
          → UPDATE prediction_log SET reconciled = true
      → done
```

CLV definition used here: `model_implied_prob - closing_line_implied_prob`. Positive means the model saw value that the market eventually agreed with. This is the standard sharp-bettor definition.

### 4. Model Analytics Query

```
GET /api/analytics/leaderboard
  → AnalyticsService.get_leaderboard()
      → SELECT
            model_name,
            COUNT(*) as sample_size,
            AVG(clv) as avg_clv,
            STDDEV(clv) / SQRT(COUNT(*)) as clv_stderr,
            AVG(CASE WHEN game_result = model_pick THEN 1 ELSE 0 END) as win_rate,
            [ROI formula based on -110 standard juice]
        FROM prediction_log pl
        JOIN prediction_outcomes po ON pl.id = po.prediction_id
        GROUP BY model_name
        ORDER BY avg_clv DESC
  → return list of ModelTrackRecord
```

This is a single JOIN query. PostgreSQL handles this efficiently at thousands-of-rows scale with an index on `prediction_log(model_name)` and `prediction_outcomes(prediction_id)`.

---

## Question 1: Scheduled Odds Ingestion

**Recommendation: APScheduler in-process, not a separate worker.**

APScheduler (`apscheduler>=3.10`) runs inside the FastAPI process using the `AsyncScheduler` (APScheduler 4.x) or `BackgroundScheduler` (3.x). Mount it in the FastAPI lifespan context manager alongside the existing DB sync — this is already the pattern used for the incremental game sync.

```python
# api/main.py lifespan (pseudocode)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # existing: incremental game sync
    await sync_games()
    # new: start odds scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(pull_odds, "interval", minutes=15)
    scheduler.add_job(reconcile_predictions, "cron", hour=3)
    scheduler.start()
    yield
    scheduler.shutdown()
```

**Why not Celery/Redis?** Celery requires a Redis broker container + a worker container. That is two more Docker services for a team of two with part-time bandwidth. APScheduler in-process is sufficient for polling a REST API every 15 minutes — there is no queue, no backpressure, and no concurrent workers needed. The bottleneck is the external odds API rate limit, not compute.

**Why not a cron job at the OS/container level?** ECS containers don't have cron. You'd need a separate ECS Scheduled Task (another task definition, IAM role, complexity). APScheduler keeps scheduling logic in Python where it's testable.

**Odds API choice:** The Odds API (the-odds-api.com) has a free tier (500 requests/month) and a paid tier ($0.0014/request at the Basic level). For a 15-minute polling interval over a 4-month NBA season (roughly 130 game days, 8 hours of polling per game day): ~2,600 requests/season on free tier, which exceeds the free limit. Budget ~$50/season at basic tier. Store raw responses in `odds_snapshots` so you can backfill CLV even if the API is down during a game.

---

## Question 2: Prediction Logging / CLV Reconciliation Pipeline

**Database schema additions needed:**

```sql
-- Raw odds feed (one row per game per bookmaker per poll)
CREATE TABLE odds_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    game_id         VARCHAR NOT NULL,         -- nba_api game_id
    game_date       DATE NOT NULL,
    home_team_id    VARCHAR NOT NULL,
    away_team_id    VARCHAR NOT NULL,
    bookmaker       VARCHAR NOT NULL,         -- e.g. 'draftkings'
    home_ml          INTEGER,                 -- American odds, e.g. -165
    away_ml          INTEGER,
    home_implied_prob FLOAT,                  -- vig-removed implied prob
    away_implied_prob FLOAT,
    snapshot_ts     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_closing      BOOLEAN DEFAULT FALSE     -- set to TRUE by reconciliation job
);
CREATE INDEX ON odds_snapshots (game_id, snapshot_ts DESC);

-- One row per prediction made by a user (or automated)
CREATE TABLE prediction_log (
    id              BIGSERIAL PRIMARY KEY,
    game_id         VARCHAR NOT NULL,
    game_date       DATE NOT NULL,
    model_name      VARCHAR NOT NULL,         -- 'logistic', 'xgboost', 'ensemble'
    predicted_home_win_prob FLOAT NOT NULL,
    line_implied_prob FLOAT,                  -- market implied prob at prediction time (nullable if no line yet)
    prediction_ts   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciled      BOOLEAN DEFAULT FALSE
);
CREATE INDEX ON prediction_log (model_name);
CREATE INDEX ON prediction_log (reconciled, game_date);

-- One row per reconciled prediction (after game closes)
CREATE TABLE prediction_outcomes (
    id              BIGSERIAL PRIMARY KEY,
    prediction_id   BIGINT NOT NULL REFERENCES prediction_log(id),
    closing_implied_prob FLOAT,              -- market at close
    clv             FLOAT,                   -- predicted_prob - closing_implied_prob
    home_won        BOOLEAN,                 -- actual game result
    model_correct   BOOLEAN,                 -- predicted_prob > 0.5 AND home_won, etc.
    reconciled_ts   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON prediction_outcomes (prediction_id);
```

**Reconciliation logic (critical detail):** The reconciliation job needs to handle the case where a game is postponed or the odds API had no data. Mark those rows `reconciled=TRUE` with NULL CLV so they don't block future runs. Filter them out in analytics queries with `WHERE clv IS NOT NULL`.

**Closing line definition:** Use the last odds snapshot before `game_commence_time`. Do not use the first snapshot of game day — that is the opening line, not the closing line. The closing line is the market consensus after sharp money has moved it.

---

## Question 3: Async ML Jobs vs Sync Request-Scoped

**Verdict: Keep sync for now. Add a response-time gate.**

The current approach (fit models per request on all historical data) works at current scale. NBA season data is a few thousand rows. XGBoost + logistic regression on ~4,000 rows fits in under 2 seconds. That is acceptable for a prediction UI where the user is waiting for a result.

**When sync becomes a problem:**

1. Training data grows past ~50,000 rows (unlikely in v1 — NBA has ~1,230 games/season)
2. More than 5-10 concurrent users making prediction requests simultaneously (goroutine starvation in uvicorn's thread pool)
3. You add model types that are inherently slow (neural nets, hyperparameter search)

**What to do instead of a full async job queue:**

Add a `@lru_cache` or Redis-backed cache keyed on `(game_id, model_name, feature_date)`. The feature date is the last game ingested — if it hasn't changed since the last prediction for this game, return the cached result. This eliminates redundant fits for the same game on the same day.

```python
# services/predict.py — cache on feature snapshot date
from functools import lru_cache

@lru_cache(maxsize=128)
def _cached_predict(game_id: str, model_name: str, last_game_date: date) -> PredictionResult:
    # fit + predict here
    ...
```

`lru_cache` is process-local (lost on restart) but sufficient for a single-container deployment. If you move to multiple ECS tasks, switch to Redis — but that's a v2 concern.

**If you do need async jobs later:** The pattern is `BackgroundTasks` (FastAPI built-in) for fire-and-forget, or APScheduler for scheduled. Celery is only warranted if you need distributed workers, retries, and a job queue UI. Don't add it in v1.

---

## Question 4: Model Performance Analytics Queries

**Pattern: Materialized view updated on reconciliation, not a live aggregate query.**

The naive approach is `SELECT ... GROUP BY model_name` over `prediction_log JOIN prediction_outcomes` on every dashboard load. This works fine up to ~100,000 predictions. But model performance is computed from immutable historical data — once a prediction is reconciled, its CLV never changes. There is no reason to re-aggregate it on every page load.

**Recommended pattern:**

```sql
-- Refresh after each reconciliation run
CREATE MATERIALIZED VIEW model_performance AS
SELECT
    model_name,
    COUNT(*) AS sample_size,
    AVG(clv) AS avg_clv,
    STDDEV(clv) AS clv_std,
    STDDEV(clv) / SQRT(COUNT(*)) AS clv_stderr,   -- for confidence intervals
    AVG(CASE WHEN model_correct THEN 1.0 ELSE 0.0 END) AS win_rate,
    -- ROI at -110 juice: (wins * 0.909 - losses) / total_bets
    (SUM(CASE WHEN model_correct THEN 0.909 ELSE -1.0 END)) / COUNT(*) AS roi_at_110
FROM prediction_log pl
JOIN prediction_outcomes po ON pl.id = po.prediction_id
WHERE po.clv IS NOT NULL
GROUP BY model_name;

CREATE UNIQUE INDEX ON model_performance (model_name);
```

Refresh it at the end of the nightly reconciliation job:

```python
db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY model_performance"))
```

`CONCURRENTLY` means the view is readable while refreshing — no downtime.

**Why not a separate analytics DB?** You have hundreds to low-thousands of predictions per season. A separate OLAP database (ClickHouse, BigQuery) is engineering overhead with no benefit at this data volume. PostgreSQL with a materialized view and proper indexes is the right tool here.

**Indexes to add for analytics:**

```sql
CREATE INDEX ON prediction_log (game_date, model_name);
CREATE INDEX ON prediction_outcomes (prediction_id) INCLUDE (clv, model_correct);
```

---

## Suggested Build Order

Dependencies flow top-to-bottom. Each layer can only be built after the layer above it.

```
1. odds_snapshots table + OddsIngestor + APScheduler hook
   (no other new component depends on this working first, but CLV is meaningless without it)

2. prediction_log table + PredictionLogService
   (wire into existing /predict/full route — add logging as a side effect)

3. ReconciliationJob (nightly cron)
   (requires: odds_snapshots has data, prediction_log has rows)

4. prediction_outcomes table populated by ReconciliationJob
   (requires: reconciliation job running, at least one game cycle completed)

5. model_performance materialized view + AnalyticsService + /api/analytics router
   (requires: prediction_outcomes has enough rows to make stats meaningful)

6. Frontend: odds comparison UI + model leaderboard
   (requires: /api/odds and /api/analytics endpoints live)

7. lru_cache on prediction service (performance optimization)
   (can be added any time; not a blocker for correctness)
```

**Critical path:** Steps 1-4 must complete before any analytics are possible. A realistic ordering for two part-time developers: build steps 1-2 in the same phase (they are both plumbing with no UI), steps 3-4 in the next phase (the reconciliation logic has the most edge cases), steps 5-6 in the final phase (payoff — the visible product).

---

## Patterns to Follow

### Pattern: Lifespan-Mounted Scheduler

Mount APScheduler in the FastAPI `lifespan` async context manager. This keeps all background jobs defined in Python, testable, and co-located with the application. It also ensures the scheduler shuts down cleanly when the container stops.

### Pattern: Upsert for Idempotent Ingestion

All ingestion jobs (game data, odds) should upsert, not insert. The odds job may run multiple times per day. Use SQLAlchemy `Session.merge()` on a composite PK (game_id + bookmaker + snapshot_ts bucketed to nearest 15 min) or PostgreSQL `INSERT ... ON CONFLICT DO UPDATE`.

### Pattern: Nullable CLV for Incomplete Reconciliations

Never block the reconciliation job on missing data. If the odds API had no data for a game, write the outcome row with `clv=NULL` and `model_correct` based on the game result alone. Analytics queries filter `WHERE clv IS NOT NULL` for CLV stats, but win rate can still be computed from all rows.

### Pattern: Service-Layer Logging Side Effect

Prediction logging belongs in `PredictionLogService`, called from `services/predict.py` after the ML result is computed. Do not put it in the router. This keeps the router thin and makes logging testable in isolation.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Recomputing CLV in Analytics Queries

**What:** `SELECT predicted_prob - (SELECT implied_prob FROM odds_snapshots WHERE ...)` in the leaderboard query
**Why bad:** Slow, brittle, re-does reconciliation work at read time
**Instead:** Write CLV to `prediction_outcomes` at reconciliation time; analytics queries read the stored value

### Anti-Pattern: Celery + Redis for Scheduled Polling

**What:** Introducing a task queue (Celery) and message broker (Redis) to schedule the odds pull
**Why bad:** Two more Docker containers, more ops surface, more failure modes — for a job that runs once every 15 minutes with no queue semantics needed
**Instead:** APScheduler in-process; the job is I/O-bound (one HTTP call), not CPU-bound

### Anti-Pattern: Logging Predictions in the Router

**What:** `db.add(PredictionLog(...))` directly in `routers/predict.py`
**Why bad:** Mixes HTTP concerns with persistence logic; untestable without going through the full HTTP layer
**Instead:** `PredictionLogService.log()` called from `services/predict.py`; router stays thin

### Anti-Pattern: Live GROUP BY on Every Analytics Request

**What:** Running the full `GROUP BY model_name` aggregate on every leaderboard page load
**Why bad:** Unnecessary at small scale, will be slow if you ever accumulate meaningful data, and historical records are immutable anyway
**Instead:** Materialized view refreshed nightly after reconciliation

---

## Scalability Considerations

| Concern | Current scale (v1) | At 10K predictions | At 1M predictions |
|---------|-------------------|-------------------|-------------------|
| Odds ingestion | APScheduler in-process, fine | Still fine | Still fine (I/O bound) |
| ML inference | Sync per request, 1-2s | Add lru_cache, still sync | Async job queue (Celery/Redis) |
| CLV reconciliation | Nightly Python job, seconds | Nightly job, still seconds | Batch in chunks, partitioned table |
| Analytics queries | Materialized view, instant | Materialized view, instant | Partition `prediction_log` by season |
| Odds storage | Single table, fine | Single table, fine | Partition by game_date |

For v1 (one NBA season, two developers, hundreds to low-thousands of predictions), none of these scale concerns are relevant. Build for correctness and clarity; optimize only when profiling shows a real bottleneck.

---

## Sources

- Existing codebase architecture: `.planning/codebase/ARCHITECTURE.md` (HIGH confidence — first-party)
- APScheduler 3.x/4.x in-process pattern: documented behavior of the library; widely used in FastAPI applications (HIGH confidence)
- The Odds API pricing/structure: the-odds-api.com docs; free tier / basic tier structure is stable (MEDIUM confidence — pricing may change)
- CLV definition (model prob vs closing line): standard sharp-betting definition; consistent across recreational and professional sources (HIGH confidence)
- PostgreSQL materialized view refresh: official PostgreSQL docs for `REFRESH MATERIALIZED VIEW CONCURRENTLY` (HIGH confidence)
- lru_cache for request-scoped model caching: standard Python stdlib pattern (HIGH confidence)
