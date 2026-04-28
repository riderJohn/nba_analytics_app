# Requirements: Sports Analytics Platform

**Defined:** 2026-04-27
**Core Value:** A sharp bettor can see tonight's NBA or MLB games, get predictions from multiple platform models, compare to Vegas lines to find edge, and evaluate each model's honest CLV-based track record — because a model's history against the closing line is the only proof that matters.

## v1 Requirements

### Foundation

These are prerequisites — every CLV and track record feature downstream depends on them being correct.

- [ ] **FOUND-01**: Rolling window date cutoff audited and fixed — feature engineering uses strict `<` (not `<=`) on game_date so features for game N contain exactly N-1 games, eliminating lookahead bias
- [ ] **FOUND-02**: `game_id` type standardized to VARCHAR across PostgreSQL schema, SQLAlchemy models, and TypeScript — preventing silent join failures in the CLV pipeline
- [ ] **FOUND-03**: Python version aligned — Dockerfile base image matches local venv Python version so dev/prod parity is restored
- [ ] **FOUND-04**: ML models persisted with joblib at startup and loaded into FastAPI app state — eliminates per-request refit (OOM risk at 3 concurrent users), enables stable model versioning required for CLV attribution

### Odds & Lines

- [ ] **ODDS-01**: User can see current Vegas lines for tonight's NBA games — scheduled ingestion polls The Odds API and stores snapshots in `odds_snapshots` table; lines update on a set interval pre-game
- [ ] **ODDS-02**: System captures closing line for each game — scheduled job records the final pre-game line approximately 30 minutes before tip-off; missing captures recorded as NULL (pipeline is non-blocking)
- [ ] **ODDS-03**: User can see model implied probability next to the current Vegas line for each game — odds comparison displayed side-by-side on the prediction page
- [ ] **ODDS-04**: User can see expected value per bet — EV calculated as `(model_prob × payout) - 1` and surfaced as a clear positive/negative signal per prediction

### Track Records (CLV Pipeline)

- [ ] **CLV-01**: Every full prediction is persisted to DB at call time — `POST /api/predict/full` writes a pre-game snapshot to `prediction_log` with model version, predicted probabilities, feature snapshot, and timestamp; row is immutable after creation
- [ ] **CLV-02**: CLV computed per prediction after game closes — nightly reconciliation job joins `prediction_log` to `odds_snapshots` (closing line), computes `model_implied_prob - closing_line_implied_prob` (both vig-removed, using sharpest available book), writes to `prediction_outcomes`
- [ ] **CLV-03**: User can view a model's track record — dashboard shows per-model: mean CLV, ROI, win rate, total sample size, confidence intervals, and a sample-size warning badge when fewer than 50 picks exist
- [ ] **CLV-04**: User can compare all platform models on a leaderboard — ranked by mean CLV, shows CI and sample size per model, default sort is CLV not win rate

### Parlays

- [ ] **PARS-01**: Parlay calculator uses correlated probability — replaces naive independent-leg multiplication with historical conditional joint frequency tables built from existing game data; displayed alongside naive calculation so the difference is visible
- [ ] **PARS-02**: User can see expected value for a parlay — combined EV calculated from correlated probabilities vs sportsbook payout odds; surfaced as positive/negative signal

### MLB Integration

- [ ] **MLB-01**: MLB game data ingested from pybaseball or MLB Stats API with incremental sync — same startup pattern as NBA ingestion
- [ ] **MLB-02**: ML prediction pipeline built for MLB games — win probability and run line predictions using baseball-appropriate rolling features (ERA, WHIP, batting average, bullpen usage)
- [ ] **MLB-03**: MLB odds ingested via The Odds API — same `odds_snapshots` table extended with a `sport` column; MLB game lines polled on same schedule as NBA
- [ ] **MLB-04**: MLB predictions persisted to `prediction_log` with `sport` identifier — same immutable snapshot pattern as NBA
- [ ] **MLB-05**: MLB closing lines captured by the same scheduled job as NBA — `sport` column distinguishes records
- [ ] **MLB-06**: MLB CLV computed by the same nightly reconciliation job — `prediction_outcomes` extended to be sport-aware
- [ ] **MLB-07**: User can switch between NBA and MLB in the UI — sport selector shows tonight's games and predictions for the chosen sport
- [ ] **MLB-08**: MLB model leaderboard shows same CLV/ROI/sample-size stats as NBA — filtered by sport, same trust signals

## v2 Requirements

### User Models

- **UMOD-01**: User can configure a custom model by selecting features and algorithm
- **UMOD-02**: User's model is backtested with honest methodology (out-of-sample, no lookahead, sample-size warnings shown)
- **UMOD-03**: User's model appears on the leaderboard alongside platform models once it has 50+ live predictions

### Multi-Sport

- **MSPT-01**: User can access analytics for NFL games

### Social / Competition

- **SOCL-01**: User can create a private league with invited members
- **SOCL-02**: User can make picks using platform models or their own picks in a league
- **SOCL-03**: League standings show performance vs Vegas odds using fake currency
- **SOCL-04**: User can compete against platform models in a league

### Auth

- **AUTH-01**: User can create an account with email and password
- **AUTH-02**: User session persists across browser refresh
- **AUTH-03**: User's prediction history and track record tied to their account

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-money / sportsbook integration | Regulatory complexity; not the product |
| Mobile app | Web-first; mobile after web is solid |
| Win/loss as headline track record metric | Anti-feature — this is what every competitor reports dishonestly; never headline it |
| Line movement display | Nice to have, not core to v1 value prop |
| Real-time odds (sub-minute updates) | Not needed; 5-15 min polling cadence is sufficient for sharp bettors pre-game |
| Celery / Redis job queue | Overkill for two-person team; APScheduler in-process is sufficient for v1 volume |
| Opening line tracking | Closing line is what matters for CLV; opening line is noise for v1 |

## Traceability

*Populated during roadmap creation.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 2 | Pending |
| ODDS-01 | Phase 3 | Pending |
| ODDS-02 | Phase 3 | Pending |
| ODDS-03 | Phase 4 | Pending |
| ODDS-04 | Phase 4 | Pending |
| CLV-01 | Phase 3 | Pending |
| CLV-02 | Phase 3 | Pending |
| CLV-03 | Phase 4 | Pending |
| CLV-04 | Phase 4 | Pending |
| PARS-01 | Phase 5 | Pending |
| PARS-02 | Phase 5 | Pending |
| MLB-01 | Phase 6 | Pending |
| MLB-02 | Phase 6 | Pending |
| MLB-03 | Phase 6 | Pending |
| MLB-04 | Phase 6 | Pending |
| MLB-05 | Phase 6 | Pending |
| MLB-06 | Phase 6 | Pending |
| MLB-07 | Phase 6 | Pending |
| MLB-08 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-27*
*Last updated: 2026-04-27 after adding MLB as v1 sport*
