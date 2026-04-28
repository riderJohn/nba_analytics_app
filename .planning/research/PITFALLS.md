# Domain Pitfalls

**Domain:** Sports analytics / sports betting analytics (NBA, CLV-based model track records)
**Researched:** 2026-04-27
**Confidence:** HIGH for CLV methodology and model reporting (well-documented in sharp betting literature); MEDIUM for odds API specifics (pricing changes frequently); HIGH for refit-per-request pattern (directly observable in codebase); HIGH for nba_api reliability (confirmed in CONCERNS.md and community history)

---

## Critical Pitfalls

Mistakes that cause rewrites, invalidate track records, or destroy the product's core value proposition.

---

### Pitfall 1: Lookahead Bias in CLV Calculation

**What goes wrong:** When computing a model's historical CLV, the model's implied probability at prediction time is compared against the closing line. If the "prediction time" is reconstructed retroactively using features that were not available at the actual moment of prediction — for example, rolling stats that include the game being predicted, injury reports from after tip-off, or lineup data scraped after the fact — the CLV figure is inflated and meaningless. The model appears to have edge it never actually had.

**Why it happens:** The current pipeline computes rolling stats inside `get_team_rolling_stats` using a cutoff of `datetime.today()` in the `_load_data` path (CONCERNS.md, lines 62–65). There is no mechanism to reproduce "what did the model know on game day X at time T?" Once predictions are logged retroactively rather than at actual prediction time, any rolling window that was computed after games were played introduces future information.

There is also a subtler form: rolling averages computed over a window that includes the current game's result. A 7-game rolling window for game N must include only games N-7 through N-1, never game N itself. A fence-post error here contaminates every row of training data.

**Consequences:** The entire CLV track record is invalidated. Sharp bettors will identify this immediately — it is the first thing they check. If detected publicly, it destroys the platform's credibility permanently. This is the single highest-stakes pitfall in the project.

**Prevention:**
- Predictions must be logged with a snapshot of the feature vector computed at prediction time, not reconstructed later. The DB record must include a `predicted_at` timestamp and the feature values used.
- Rolling window computation must enforce a strict `< game_date` cutoff, not `<= game_date`. In `features.py`, confirm that the rolling stats for game N exclude game N's result before computing the window.
- Never recompute historical predictions after the fact for CLV purposes. The logged prediction is ground truth; the closing line is the comparison point. No retroactive model application.
- Add a test: given a known game date, assert that the feature vector for that game contains zero rows from on or after that date.

**Warning signs:**
- Rolling stats computation passes `game_date` inclusive as a filter rather than exclusive.
- Track record CLV is uniformly positive across all model types — this is statistically unlikely for genuinely forward-looking predictions on a competitive market.
- `predict_outcome` and `_load_data` compute rolling stats differently (already documented in CONCERNS.md, lines 62–65) — this inconsistency is a direct lookahead risk vector.

**Phase:** Address in the prediction logging infrastructure phase, before any CLV is ever computed. Getting this wrong once contaminates the entire historical record.

---

### Pitfall 2: Retroactive Track Record Construction

**What goes wrong:** The temptation — especially given the current state where predictions are computed but never logged — is to backfill a track record by running the model against historical games after the fact. This produces a track record that looks like historical performance but is actually in-sample overfitting: the model was trained on the same data it is being "tested" on.

The variant specific to this codebase: the current model refits on every request using all available historical data. If you backfill predictions for, say, the 2024–25 season, the model at "game 50" would have been trained on games 1–49. But if you run the model today with all 2024–25 games in the DB, it trains on the full season and generates predictions as if it had that information at game 50. Those predictions are not historical — they are retroactive.

**Why it happens:** No prediction persistence exists yet. Building track records from scratch with retroactive runs is the path of least resistance and is almost universally tempting.

**Consequences:** Reported CLV and win rates will look better than live performance. When real predictions go live and the model underperforms its "historical" numbers, users lose trust. If the discrepancy is large, the platform's differentiating claim (honest CLV) is undermined.

**Prevention:**
- Establish the logging infrastructure before any track record is reported. No track record, however preliminary, should be shown until at least 30 live predictions have been logged with the pipeline running in forward-only mode.
- If a historical baseline is needed for development/demo purposes, label it explicitly as "backtest (in-sample)" and never call it a live track record.
- Implement walk-forward validation: train on games 1–N, predict game N+1, advance. This is the only valid way to simulate what a live track record would look like.

**Warning signs:**
- Track record is being generated by running the current model against all historical data in one pass.
- "Historical CLV" is positive and consistent before prediction logging infrastructure is built.
- No `predicted_at` timestamp exists in the prediction DB table.

**Phase:** Prediction logging infrastructure phase. The schema must enforce forward-only semantics before any track record tooling is built.

---

### Pitfall 3: Small Sample Size Confidence in CLV and Win Rates

**What goes wrong:** With an NBA regular season of ~1,230 games and a typical bettor focusing on a subset, early CLV figures are extremely noisy. A model reporting +3% CLV over 50 predictions has a 95% confidence interval wide enough to include zero edge. Displaying raw CLV percentages without confidence intervals actively misleads users into believing edge exists when the sample is too small to tell.

The specific failure mode: the model track record dashboard shows "CLV: +2.3%" and users treat it as signal. In a competitive market, most of that could be variance.

**Why it happens:** Reporting a single number is simpler to build than reporting a number with an interval. Developers under time pressure skip uncertainty quantification.

**Consequences:** Users make financial decisions based on spurious signals. The platform's credibility depends on being more honest than competitors — displaying point estimates without uncertainty is just as misleading as reporting win/loss without CLV.

**Prevention:**
- Every CLV and win rate display must include sample size (N=) and a confidence interval. For CLV, use bootstrap resampling to compute the interval. For win rates, use a Wilson score interval.
- Add a "minimum sample size" threshold below which CLV is displayed with a prominent "low sample — unreliable" warning (suggested threshold: N < 100 predictions per model).
- Display running CLV over time as a chart, not just a summary statistic. Variance is visible in the chart; it hides in a single number.

**Warning signs:**
- Track record dashboard shows a single CLV percentage with no confidence interval or sample size.
- Model comparisons are made with fewer than 100 predictions per model.
- The leaderboard ranks models that have made 10 predictions against models that have made 500.

**Phase:** Model track record dashboard phase. Build the statistical infrastructure (bootstrap CI, Wilson intervals) before the dashboard is deployed, not after.

---

### Pitfall 4: Per-Request Model Refit at Scale

**What goes wrong:** The current pipeline retrains all models from scratch on every HTTP request. This is already documented in CONCERNS.md (lines 105–109) as a performance bottleneck, but the problem has a second dimension beyond raw latency: at scale, concurrent requests each spawn independent training jobs, exhausting CPU and RAM simultaneously. The failure mode is not graceful degradation — it is OOM crash or request timeout storm.

Concrete numbers from the codebase: `predict_full` trains four separate sklearn/XGBoost models per request (home regression, away regression, home residual std, away residual std) on the full historical dataset. With 2 seasons (~2,500 games × 30 teams × multiple rolling windows), a single request likely takes 5–30 seconds and uses 200–400MB RAM (CONCERNS.md, lines 148–153). Three concurrent requests = 600MB–1.2GB and 15–90 seconds of CPU contention. On a modest ECS task (512MB–1GB), this crashes the container.

The scaling cliff is sharp: zero to three concurrent users triggers OOM. There is no graceful middle ground.

**Why it happens:** Stateless-per-request design is correct for most web services. ML training is the exception — it produces an artifact (the fitted model) that should be reused, not thrown away.

**Consequences:** The prediction endpoint becomes unavailable under any real user load. AWS ECS task restarts mask the problem temporarily but do not fix it.

**Prevention:**
- Train models nightly (or on data refresh trigger) and persist with `joblib.dump`. Load at startup into FastAPI app state. Predictions call `model.predict()` only — no fitting on the hot path.
- Add a `/api/models/retrain` endpoint (admin-gated) that triggers a background refit via `asyncio.create_task` or a Celery task, replacing the in-memory artifact when complete.
- Cache the full rolling stats DataFrame in app state with a staleness timestamp. Invalidate only when new games are ingested.
- For the CLV/track record use case specifically: model persistence is mandatory. The model that generated a logged prediction must be the same model that is archived. Refitting on request means there is no stable model version to attribute track records to.

**Warning signs:**
- `/api/predict` takes more than 2 seconds under single-user load.
- Memory usage spikes and drops on each prediction request (visible in Docker stats).
- No `joblib` or `pickle` in the codebase for model serialization.
- No model versioning or `model_id` field on the predictions table.

**Phase:** Model caching / prediction persistence phase. This must be resolved before the CLV track record system is built, because a stable model identity is a prerequisite for attributing track records to a specific model version.

---

### Pitfall 5: CLV Metric Misapplication (Wrong Reference Point)

**What goes wrong:** CLV is defined as the difference between the odds at the time the bet was placed and the closing line odds, expressed as implied probability. It is a measure of whether the bettor had information before the market did. Misapplied versions include:

1. Using opening lines instead of closing lines. Opening lines are the softest (most exploitable). A model that beats opening lines but not closing lines has no edge — it just agrees with the direction the sharp money moved.
2. Computing CLV as win/loss relative to the closing line outcome ("did the team cover the closing spread?") rather than as a probability comparison. This conflates CLV with result-based metrics.
3. Using different bookmakers' lines for prediction vs. closing. Pinnacle closing lines are the gold standard for CLV calculation because Pinnacle is the sharpest book and sets the market. Using a recreational book's closing line inflates apparent CLV.

**Why it happens:** The distinction between CLV as a probability comparison (model implied prob vs. closing line implied prob) and CLV as a result metric (did the pick win?) is subtle. Many "analytics" platforms get this wrong intentionally (easier to look good) or unintentionally.

**Consequences:** The track record metric is not CLV — it is something else wearing CLV's label. Sharp bettors will notice. The platform's core differentiator is undermined.

**Prevention:**
- Define CLV precisely in code and documentation: `CLV = (model_implied_prob - closing_line_implied_prob)` at prediction time, where closing line is Pinnacle's (or the sharpest available book's) pre-game line.
- Store both the model implied probability at prediction time and the closing line implied probability. Compute CLV as the delta. Never store only the result.
- When the odds API is selected, confirm it provides Pinnacle or sharp book closing lines, not just recreational lines (DraftKings, FanDuel). The Odds API's free tier includes Pinnacle on some endpoints — verify this before building the pipeline.
- Display both components (model prob, closing prob) in the track record UI so users can verify the calculation themselves.

**Warning signs:**
- CLV is computed as whether the prediction's side won against the closing spread — not as a probability delta.
- The odds API being used does not include Pinnacle.
- CLV figures are significantly positive across all models from the start — more likely a metric error than genuine edge.

**Phase:** Odds API integration and CLV computation design. Lock down the definition before writing a single line of CLV calculation code.

---

## Moderate Pitfalls

---

### Pitfall 6: Odds API Cost and Rate Limit Surprises

**What goes wrong:** Free-tier odds APIs have strict request quotas that are easy to exhaust with naive polling. The Odds API (the most likely choice given PROJECT.md) charges per API call, not per subscription tier, on its free plan. A naive implementation that polls for odds every minute on 10+ games per day will burn through the free monthly quota (500 requests as of recent pricing) in days, then incur unexpected charges.

The secondary problem: odds move. A model prediction logged at 10am against lines fetched at 8pm is not a valid CLV calculation — the line at 8pm may have moved specifically because of information the model used.

**Why it happens:** Developers build the happy path (fetch odds, compare, display) without reading the API billing docs carefully. Cost surprises hit in month 2.

**Prevention:**
- Read The Odds API's billing documentation before writing any integration code. Understand the difference between historical odds endpoints (which cost more) and live odds endpoints.
- Implement aggressive caching: fetch odds once per game per day at a scheduled time (e.g., 1 hour pre-game) and store in the DB. Never re-fetch live odds per prediction request.
- Log the exact timestamp of the odds fetch alongside the odds value. This is required for valid CLV calculation anyway (you need to know when you "locked in" the line).
- For closing lines specifically: the closing line is fetched once, post-game, and stored permanently. This is a single API call per game, not a live polling operation.
- Budget: at 1,230 NBA regular season games × 2 calls per game (pre-game line, closing line) = ~2,460 calls/season minimum. Plan accordingly.

**Warning signs:**
- Odds fetch is triggered inside a prediction request rather than on a schedule.
- No `odds_fetched_at` timestamp is stored alongside odds values.
- No rate limiting or caching layer between the application and the odds API.

**Phase:** Odds API integration phase. Establish the caching/scheduling architecture before writing the UI comparison layer.

---

### Pitfall 7: Correlated Parlay Naive Probability Multiplication

**What goes wrong:** The current parlay endpoint multiplies individual game win probabilities directly. This is wrong for NBA games on the same night because team performance outcomes are not statistically independent — they share factors like rest schedules, travel, officials, and pace matchups that correlate across games. Additionally, legs in the same game (home team wins AND total goes over) are structurally correlated.

The magnitude of the error: two legs with 55% individual probability, if they have a 10% positive correlation, have a combined probability of ~33% rather than the naive 30.25%. Small per-leg errors compound into significant mispricing on 4+ leg parlays.

**Why it happens:** Independence is the simplifying assumption. It is taught first and coded first. The actual conditional frequencies require historical data and a lookup table approach.

**Prevention:**
- The PROJECT.md already identifies this and recommends a historical conditional frequency approach, which is correct. Implementation: build a co-occurrence table of game outcomes across all historical same-night games. For a given parlay combination, look up empirical joint probability rather than multiplying marginals.
- For same-game parlays (two outcomes from the same game), the correlation is structural — a team that wins by a large margin also tends to push the total over. Model this as a 2D lookup over the point spread and total outcomes.
- Explicit scope: the frequency table approach only works well with sufficient historical data (> 1,000 same-night game pairs per correlation cell). Start with the correlated parlay disclaimer in the UI before the full model is built.

**Warning signs:**
- Parlay probability is computed as `p1 * p2 * ... * pN` with no correlation adjustment.
- No historical parlay outcome data is stored or queried.

**Phase:** Correlated parlay engine phase. This is a post-CLV-foundation feature. Get the track record layer right first.

---

### Pitfall 8: nba_api Reliability and Silent Failures

**What goes wrong:** `nba_api` is an unofficial reverse-engineered library. The NBA stats website has changed its API schema without notice multiple times, breaking `nba_api` across versions. The failure modes are:
1. HTTP 403 or 429 errors from NBA.com rate limiting — the library has no retry logic by default.
2. Schema changes that cause the library to return empty DataFrames silently rather than raising exceptions.
3. Endpoint deprecation that makes specific stats categories unavailable.

The current codebase already documents this risk (CONCERNS.md, lines 164–167) and notes that `_sync_games` swallows all exceptions (lines 133–137). This means a total ingestion failure is logged as a warning and the app continues serving stale data with no user-visible indicator.

**Why it happens:** The library works reliably most of the time, which creates false confidence. The failure cases are infrequent but total.

**Prevention:**
- Add retry logic with exponential backoff to all `nba_api` calls. The library accepts a `timeout` parameter; wrap calls in a retry decorator (e.g., `tenacity`).
- Add a data freshness health-check endpoint (`/api/health/data`) that exposes the timestamp of the most recently ingested game. If data is more than 48 hours stale during the season, surface a warning in the UI.
- Do not swallow ingestion exceptions silently. Log full tracebacks. Consider a Slack/email alert for ingestion failures.
- Cache ingested data aggressively — the historical record never changes, only new games are added. If the API is down for a day, historical predictions remain valid.
- Pin `nba_api` to a specific version in `requirements.txt` and test upgrades explicitly rather than relying on `>=` version ranges.

**Warning signs:**
- `nba_api` version is unpinned or uses a loose `>=` constraint.
- `_sync_games` failure is logged at WARNING level and not surfaced to any monitoring.
- No health-check endpoint for data freshness.
- Empty DataFrame returned from `nba_api` is not distinguished from a legitimately empty result set (no games on that date).

**Phase:** Data ingestion hardening phase (early). Fragile ingestion poisons everything downstream including the CLV pipeline.

---

### Pitfall 9: Cherry-Picking and P-Hacking in Model Comparison

**What goes wrong:** When multiple models are trained and compared (logistic, XGBoost, ensemble, etc.), there is a natural incentive — even unintentionally — to report the model that looks best. With 4 models evaluated over 50 games, finding one that shows +3% CLV by random chance has a meaningful probability. If the "best" model is selected after the fact and presented as the primary model, the reported CLV is inflated by the selection process itself.

The related failure: hyperparameter tuning on the test set. If rolling window sizes (3/5/7/10) are chosen because they maximize historical CLV rather than for domain reasons, the historical CLV is not an honest estimate of future performance.

**Why it happens:** Model comparison is a natural part of development. The line between legitimate model development and p-hacking is easy to cross unintentionally.

**Prevention:**
- All model comparison must use out-of-sample data only. If rolling window sizes were chosen based on backtests, that backtest data cannot be used to evaluate the final model's CLV.
- Implement a strict train/validation/test split with temporal ordering: train on seasons N-2 and N-1, validate hyperparameters on early season N, test on the remainder of season N (never touched during development).
- When multiple models are shown in the leaderboard, display the full history of all models — not just the currently leading one. Transparency about the comparison process is the defense against cherry-picking accusations.
- Document hyperparameter selection rationale in code comments. If the 7-game rolling window was chosen because it matches basketball research on team momentum, say so.

**Warning signs:**
- Hyperparameters were selected based on maximizing historical prediction accuracy or CLV.
- The "best" model is identified after looking at multiple candidates on the same data used to report CLV.
- Only one model's track record is displayed rather than all available models.

**Phase:** Model track record dashboard design. Establish evaluation protocol before building the comparison UI.

---

## Minor Pitfalls

---

### Pitfall 10: Feature Leakage Through Rolling Window Fence-Post Errors

**What goes wrong:** A rolling 7-game window for game N that accidentally includes game N itself (inclusive upper bound instead of exclusive) introduces the current game's result into the predictor. The error is usually one line: `df[df['game_date'] <= game_date]` instead of `df[df['game_date'] < game_date]`. The model trains fine, predictions look excellent in backtesting, and the error only reveals itself when the model underperforms live (where the current game result is not available at prediction time).

The existing `build_feature_set` and `build_matchup_features` functions use hard-coded column drop lists (CONCERNS.md, lines 121–126) and the rolling window cutoff inconsistency between `predict_outcome` and `_load_data` (lines 62–65) makes this a live risk in the current code.

**Prevention:** Audit every rolling window calculation for `<` vs `<=` on the date boundary. Add a unit test that asserts the feature vector for game N contains exactly N-1 prior games' data, never N.

**Warning signs:** Rolling stats computation uses `<=` date comparison. Backtest CLV is significantly better than live CLV.

**Phase:** Feature engineering audit, before prediction logging goes live.

---

### Pitfall 11: Game ID Type Inconsistency Corrupting Joins

**What goes wrong:** The `game_id` field is stored as `Integer` in PostgreSQL, returned as `int` by the Pydantic schema, and typed as `string` in TypeScript — and the deduplication in `Games.tsx` relies on string equality in a `Set<string>` (CONCERNS.md, lines 49–54). When the CLV pipeline joins predictions to games, a type mismatch between the prediction log's `game_id` and the game table's `game_id` will silently produce empty join results rather than raising an error. The track record will appear empty with no obvious cause.

**Prevention:** Standardize `game_id` as `string` throughout (nba_api returns them as strings like `"0022400001"`). Migrate the DB column to `VARCHAR`, update the Pydantic schema, and update TypeScript. Do this before building any table that foreign-keys to `game_id`.

**Phase:** Schema cleanup phase, before prediction logging table is created.

---

### Pitfall 12: Closing Line Availability Window

**What goes wrong:** Closing lines must be captured before the game tips off — specifically, the last line update before the game starts. After tip-off, books pull their lines. If the closing line capture job runs too late (e.g., 30 minutes after scheduled tip-off due to a task delay), the line is gone and that prediction cannot have a valid CLV calculated. The prediction is then excluded from the track record, which creates survivorship bias (predictions with no closing line available are disproportionately games where something unusual happened — injury news at tip-off, etc.).

**Prevention:**
- Schedule the closing line capture job to run 15–30 minutes before each game's scheduled tip-off time.
- Add a fallback: if the closing line is not available, log `closing_line = NULL` and mark the prediction as `clv_computable = FALSE`. Include these in sample size counts for track record transparency.
- Never silently exclude NULL-CLV predictions from aggregate statistics.

**Phase:** Odds API integration and prediction logging pipeline phases.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Prediction logging infrastructure | Retroactive track record construction (Pitfall 2) | Build forward-only logging first; no backfill |
| CLV calculation implementation | Lookahead bias in rolling windows (Pitfall 1) | Audit `<` vs `<=` date cutoffs before first CLV is stored |
| CLV calculation implementation | Wrong CLV reference point (Pitfall 5) | Define CLV formula precisely in code before writing any CLV calculation |
| Odds API integration | Cost overrun from naive polling (Pitfall 6) | Cache odds in DB; never fetch live per-request |
| Odds API integration | Missing closing line window (Pitfall 12) | Schedule capture job 15–30 min before tip-off |
| Model track record dashboard | Small sample confidence inflation (Pitfall 3) | Require confidence intervals and N= display; no bare CLV percentages |
| Model track record dashboard | Cherry-picking / p-hacking (Pitfall 9) | Establish train/val/test split before any model comparison |
| Model caching / persistence | Per-request refit at scale (Pitfall 4) | Implement joblib persistence before any load testing |
| Model caching / persistence | Model version attribution for CLV (Pitfall 4) | Prediction log must include `model_id` FK to a models table |
| Feature engineering / schema cleanup | Rolling window fence-post (Pitfall 10) | Unit test: assert N-1 games in window for game N |
| Feature engineering / schema cleanup | game_id type mismatch (Pitfall 11) | Standardize to string before prediction FK table is created |
| Correlated parlay engine | Naive probability multiplication (Pitfall 7) | Build co-occurrence table; label as "approximate" until validated |
| Data ingestion hardening | nba_api silent failures (Pitfall 8) | Add tenacity retry, freshness endpoint, remove bare except |

---

## Sources

- Closing line value methodology: Sports betting research literature consensus (Koleman, Sauer, and closing-line-as-efficiency-test papers); Pinnacle's public sharper betting resources
- Walk-forward validation requirement: Standard practice in time-series ML, documented in Marcos Lopez de Prado "Advances in Financial Machine Learning" (directly applicable to sports market efficiency questions)
- nba_api reliability history: GitHub issues on `swar/nba_api` repository (multiple breaking changes documented in issues #250, #300+ range, 2023–2025); confirmed in project CONCERNS.md
- Per-request model refit breakdown: Directly observed in `backend/app/api/services/models.py` and `regression.py` via CONCERNS.md analysis
- The Odds API pricing: theOddsAPI.com documentation (pricing verified as request-based on free tier; rate limits apply)
- CLV definition (probability delta vs. result): Sharp betting community consensus; explicitly contrasted with win-rate-only reporting in Action Network and BetQL comparisons
- Correlated parlay correlation magnitude: NBA game outcome correlation studies suggest 5–15% positive correlation for same-night legs sharing rest/travel factors
