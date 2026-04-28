# Roadmap: NBA Analytics Platform

## Overview

Starting from a working FastAPI + React prediction engine, this roadmap delivers the CLV-based track record layer that makes the platform genuinely useful to sharp bettors. The first two phases make the existing system correct and stable. The middle phases build the odds ingestion, prediction logging, and CLV reconciliation pipeline. The final phase upgrades the parlay calculator with correlated probabilities.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Integrity** - Fix lookahead bias, type mismatches, and Python version drift before any new data flows through the system
- [ ] **Phase 2: Model Persistence** - Persist trained ML models at startup so predictions are stable, attributable, and safe under concurrent load
- [ ] **Phase 3: Odds & Prediction Pipeline** - Ingest live Vegas lines, persist every prediction at call time, and record closing lines for CLV reconciliation
- [ ] **Phase 4: CLV Dashboard & Odds UI** - Surface model track records and odds comparison to the user — the core value proposition
- [ ] **Phase 5: Correlated Parlay Engine** - Replace naive leg multiplication with historical conditional frequency tables and surface parlay EV

## Phase Details

### Phase 1: Data Integrity
**Goal**: The existing prediction system is provably correct — no lookahead bias in features, no silent join failures between tables, and dev/prod Python environments match
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03
**Success Criteria** (what must be TRUE):
  1. A feature row for game N contains exactly N-1 games worth of history — verified by inspecting the rolling window date cutoff logic uses strict `<` on game_date
  2. A query joining `prediction_log` to `odds_snapshots` on `game_id` returns correct matches — no silent failures due to integer/string type mismatch
  3. `docker compose build` completes without Python version warnings and the container runs the same Python version as the local venv
**Plans**: TBD

### Phase 2: Model Persistence
**Goal**: ML models are trained once at startup, stored in FastAPI app state, and reused across all prediction requests — eliminating per-request refits and enabling stable model versioning for CLV attribution
**Depends on**: Phase 1
**Requirements**: FOUND-04
**Success Criteria** (what must be TRUE):
  1. The FastAPI startup log shows models trained and loaded into app state exactly once — not on every prediction request
  2. Three simultaneous prediction requests complete successfully without OOM errors or model state corruption
  3. Each model has a stable version identifier that persists across server restarts, so CLV records can be attributed to the correct model version
**Plans**: TBD

### Phase 3: Odds & Prediction Pipeline
**Goal**: Live Vegas lines are available in the database, every prediction is persisted at call time, and closing lines are captured post-market — creating the raw data needed to compute CLV
**Depends on**: Phase 2
**Requirements**: ODDS-01, ODDS-02, CLV-01, CLV-02
**Success Criteria** (what must be TRUE):
  1. Tonight's NBA games show current moneyline odds pulled from The Odds API and stored in `odds_snapshots` — lines are no more than 15 minutes stale
  2. A call to `POST /api/predict/full` writes an immutable row to `prediction_log` containing model version, predicted probabilities, feature snapshot, and timestamp
  3. Approximately 30 minutes before tip-off, a scheduled job records the closing line for each game in `odds_snapshots` — games without a captured line record NULL (pipeline non-blocking)
  4. A nightly reconciliation job joins `prediction_log` to closing lines, computes vig-removed CLV per prediction, and writes results to `prediction_outcomes`
**Plans**: TBD
**UI hint**: yes

### Phase 4: CLV Dashboard & Odds UI
**Goal**: A sharp bettor can see tonight's model predictions next to current Vegas lines, evaluate expected value, and inspect each model's honest CLV-based track record on a leaderboard
**Depends on**: Phase 3
**Requirements**: ODDS-03, ODDS-04, CLV-03, CLV-04
**Success Criteria** (what must be TRUE):
  1. On the prediction page, each game shows the model's implied win probability alongside the current Vegas moneyline — both numbers visible in the same row
  2. A positive/negative EV signal is displayed per prediction, calculated as `(model_prob × payout) - 1`, so the user can identify positive-EV spots at a glance
  3. A model track record page shows per-model mean CLV, ROI, win rate, sample size, and 95% confidence intervals — a sample-size warning badge appears when fewer than 50 picks exist
  4. A leaderboard ranks all platform models by mean CLV (not win rate), with CI and sample size shown per model — default sort is CLV
**Plans**: TBD
**UI hint**: yes

### Phase 5: Correlated Parlay Engine
**Goal**: The parlay calculator uses historically-grounded conditional joint probabilities instead of naive multiplication, and shows the user the EV of the combined bet
**Depends on**: Phase 3
**Requirements**: PARS-01, PARS-02
**Success Criteria** (what must be TRUE):
  1. A two-leg parlay shows both the naive (independent multiplication) probability and the correlated probability side by side — the user can see the difference
  2. The correlated probability is derived from historical conditional joint frequency tables built from existing game data — not assumed independence
  3. The parlay EV is displayed as a positive/negative signal calculated from correlated probabilities vs the sportsbook's combined payout odds
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Integrity | 0/TBD | Not started | - |
| 2. Model Persistence | 0/TBD | Not started | - |
| 3. Odds & Prediction Pipeline | 0/TBD | Not started | - |
| 4. CLV Dashboard & Odds UI | 0/TBD | Not started | - |
| 5. Correlated Parlay Engine | 0/TBD | Not started | - |
