# Sports Analytics Platform

## What This Is

A multi-sport analytics web app — starting with NBA and MLB — that bridges advanced predictive modeling with sportsbook odds comparison. Sharp bettors use it to find edge: seeing where platform-provided ML models disagree with Vegas lines, and trusting those models because their historical performance is shown transparently using closing line value (CLV), the gold standard metric no mainstream competitor reports honestly. NBA and MLB together provide year-round data collection with no dead periods. Built by two part-time developers with a serious product ambition.

## Core Value

A sharp bettor can see tonight's NBA or MLB games, get win probability predictions from multiple platform models, compare those to current Vegas lines to find edge, and evaluate each model's honest CLV-based track record — because a model's history against the closing line is the only proof that matters.

## Requirements

### Validated

<!-- These capabilities exist in the current codebase -->

- ✓ NBA game data ingested from nba_api with incremental sync on startup — existing
- ✓ Team data pulled and stored in PostgreSQL via SQLAlchemy ORM — existing
- ✓ ML prediction pipeline: rolling window features (3/5/7/10 games), logistic + XGBoost classifier ensemble — existing
- ✓ Point prediction via Ridge/XGBoost regression with residual std and Monte Carlo win probability — existing
- ✓ Parlay prediction endpoint with combined probability — existing
- ✓ FastAPI backend with REST endpoints (games, schedule, predict, parlay) — existing
- ✓ React/TypeScript frontend with schedule viewer, game log browser, prediction UI — existing
- ✓ Docker Compose stack (PostgreSQL + FastAPI + Nginx/React) — existing

### Active

<!-- v1 scope — what we're building toward -->

- [ ] Vegas odds data feed integrated — live lines available for comparison against model implied probability
- [ ] Pre-game predictions persisted to DB at prediction time (currently in-memory only)
- [ ] Closing line recorded post-market for every persisted prediction
- [ ] CLV computed and stored per prediction (model implied prob vs closing line)
- [ ] Model track record dashboard: per-model historical ROI, CLV, win rate, sample size, confidence intervals
- [ ] Model leaderboard: side-by-side comparison of all platform models ranked by CLV
- [ ] Correlated parlay probability engine — replace naive leg multiplication with historical conditional frequency approach
- [ ] Odds comparison UI: model implied probability vs current Vegas line, EV calculation surfaced to user
- [ ] Multiple named platform models available (logistic, XGBoost, ensemble, possibly others) each with independent track records
- [ ] Prediction logging infrastructure: pre-game snapshot → closing line capture → CLV reconciliation pipeline
- [ ] MLB data ingestion from pybaseball or MLB Stats API with incremental sync
- [ ] MLB ML prediction pipeline (win probability, run line) with baseball-appropriate features
- [ ] Full CLV pipeline extended to MLB — same odds/logging/reconciliation architecture, sport-aware
- [ ] Sport selector UI — user can switch between NBA and MLB, each with their own leaderboard

### Out of Scope

- User-built models (no-code/low-code model builder) — v2, after core platform is solid
- NFL and other sports — v2, establish NBA + MLB first
- Bracket/league competition with fake betting — v2, needs analytics foundation first
- Real-money features or actual sportsbook integration — regulatory complexity, not the product
- Mobile app — web-first
- Social features (following other users, sharing picks) — v2+

## Context

**Existing codebase:** Substantial working foundation. FastAPI + SQLAlchemy + PostgreSQL backend, React/TS frontend, Docker Compose. ML pipeline already trains and predicts on request using rolling window features. The gap is persistence and tracking — predictions are computed but never logged, so there is no track record layer yet.

**The market gap:** Every major sports analytics platform (Action Network, BetQL, Dimers) reports win/loss records but not CLV. CLV — whether picks beat the closing line — is the only signal that separates skill from variance. These platforms have no economic incentive to report it honestly (they monetize via sportsbook affiliate deals). An independent platform with transparent CLV-based track records has a genuine structural advantage.

**Team:** Two part-time developers, both working full-time jobs elsewhere. Scope decisions must account for this. Depth over breadth.

**Open question:** Vegas odds data source. Options include The Odds API (free tier available), OddsJam, or Sportradar. Decision affects real-time line availability, cost, and update frequency. Must be resolved before building the odds comparison layer.

## Constraints

- **Tech stack**: FastAPI + PostgreSQL + React/TypeScript + Docker — already committed, existing code built on this
- **Team bandwidth**: 2 part-time developers — v1 scope must be achievable without burning out
- **Data**: nba_api for game stats (free, no auth required); odds API TBD (likely has rate limits or cost at scale)
- **Deployment**: Docker Compose → AWS ECS — architecture must support containerized deployment
- **Python version**: Dockerfile uses 3.11-slim but local venv is 3.14 — version mismatch needs resolving
- **No auth yet**: All endpoints currently public — user-specific features require auth layer first

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLV as primary track record metric | Win/loss records don't separate skill from variance; CLV does. It's what serious bettors actually care about. | — Pending |
| Platform-provided models only in v1 | Most users won't build models; no-code builder is high complexity for v2 | — Pending |
| NBA-only for v1 | Depth beats breadth for a small team; establish track record in one sport first | — Pending |
| Correlated parlay probability over naive multiplication | Naive multiplication is wrong; even a frequency-table approach is more honest and differentiated | — Pending |
| Sharp bettor as v1 primary user | Clear problem (beating Vegas), clear metric (ROI), fast word-of-mouth if it works | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 after initialization*
