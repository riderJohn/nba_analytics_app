# NBA Analytics App — Complete Documentation

---

## Table of Contents

1. [What's Been Built](#1-whats-been-built)
2. [How the Machine Learning Works](#2-how-the-machine-learning-works)
3. [Making This Better for Sports Bettors](#3-making-this-better-for-sports-bettors)
4. [Beginner's Guide to Sports Betting](#4-beginners-guide-to-sports-betting)
5. [Development Roadmap](#5-development-roadmap)

---

## 1. What's Been Built

### Overview

A full-stack NBA analytics web application that ingests live game data from the official NBA Stats API, trains machine learning models on historical team performance, and generates win probability predictions, score predictions, spread/total estimates, and parlay leg probabilities — all accessible through a clean React UI.

---

### Backend — FastAPI + PostgreSQL

**Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0, PostgreSQL 16, Uvicorn

#### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/teams` | All 30 NBA teams with abbreviation, city, nickname |
| GET | `/api/games` | Historical game logs by date range (start_date, end_date) |
| GET | `/api/schedule/{date}` | Live schedule for a given date from NBA Stats API |
| POST | `/api/predict` | Legacy: win probability using a single named classifier |
| POST | `/api/predict/full` | Full ensemble prediction: winner, confidence, predicted score, spread, total, CIs |
| POST | `/api/predict/parlay` | Parlay probability calculator for any combination of win/pts/total/spread legs |

#### Database Schema

**`game_overview_data`** — one row per team per game (home and away stored separately)

| Column | Type | Notes |
|--------|------|-------|
| season_id | int | PK |
| team_id | int | PK |
| game_id | int | PK |
| game_date | date | |
| matchup | str | "LAL vs. GSW" (home) or "LAL @ GSW" (away) |
| wl | bool | True = win |
| pts, fgm, fga, fg_pct | int/float | Shooting stats |
| fg3m, fg3a, fg3_pct | int/float | 3-point stats |
| ftm, fta, ft_pct | int/float | Free throw stats |
| oreb, dreb, reb | int | Rebounds |
| ast, stl, blk, tov, pf | int | Playmaking/defense |
| plus_minus | float | Point differential |
| pull_date | date | When row was fetched |

**`team_data`** — static team metadata

| Column | Type |
|--------|------|
| team_id | int (PK) |
| full_name, abbreviation, nickname, city, state | str |
| year_founded | int |

#### Data Ingestion

- **Initial load:** `python -m app` — pulls all 30 teams + all regular season games from Oct 1, 2024
- **Startup sync:** On every API container start, automatically pulls any games since the last `pull_date`
- **Data source:** `nba_api` Python library wrapping the official NBA Stats endpoints (`LeagueGameFinder`, `scoreboardv2`)

---

### Machine Learning Pipeline

#### Feature Engineering (`services/features.py`)

For each game, features are built from **prior games only** (no leakage):

- **Rolling windows:** 3, 5, 7, and 10 game rolling averages for each of: `pts`, `dreb`, `fg_pct`, `fg3_pct`, `ft_pct`, `ast`, `reb`, `stl`, `blk`, `tov`, `pf`, `wl`, `plus_minus`
- **Rest days:** Days since each team's last game
- **Games played:** Cumulative game count per team per season
- **Total features:** ~165 columns per matchup row (rolling stats × 4 windows × 2 teams + rest + games played)

All features are prefixed `home_` or `away_` and the feature set is built once, used for both classification and regression.

#### Classification — Win Probability (`services/models.py`)

| Model | Config | Use |
|-------|--------|-----|
| XGBoost Classifier | n_estimators=300, lr=0.05, max_depth=4 | Default (Standard mode) |
| Logistic Regression | max_iter=1000 | Fast mode |

- Temporal train/test split (train before game_date, test after) — respects time ordering
- Output: `P(home team wins)` via `predict_proba`

#### Regression — Score Prediction (`services/regression.py`)

| Model | Config | Use |
|-------|--------|-----|
| XGBoost Regressor | n_estimators=500, lr=0.05, max_depth=4 | Default (Standard mode) |
| Ridge Regression | alpha=1.0, with StandardScaler | Fast mode |

- Two separate models trained per prediction: one for home points, one for away points
- Targets: `home_pts_actual`, `away_pts_actual` — actual points scored in each game
- Confidence intervals via temporal holdout residual std (last 200 games or 20% of data)

#### Ensemble & Parlay (`services/predict.py`)

```
classifier_prob  = XGBoost classifier P(home wins)
regression_prob  = norm.cdf(0, loc=home_pred - away_pred, scale=sqrt(h_std² + a_std²))
ensemble_prob    = (classifier_prob + regression_prob) / 2
```

Parlay legs use `scipy.stats.norm.cdf` against each line:
- `P(home pts > line)` = `1 - norm.cdf(line, loc=home_pred, scale=home_std)`
- `P(total > line)` = `1 - norm.cdf(line, loc=total, scale=sqrt(h_std² + a_std²))`
- `P(home covers spread)` = same with spread
- Win leg = ensemble probability directly
- Combined parlay = product of all selected `prob_over` values

---

### Frontend — React + TypeScript

**Stack:** React 18.2, TypeScript 5, Vite 5.4.19, CSS custom properties

**Three themes:** Dark Glass (glassmorphism), NBA Blue (light), Retro 80s

#### Pages

**Schedule** — Pick a date, see live scheduled games for that day. Auto-refreshes on date change. Shows Game ID, date, home team, away team abbreviations.

**Games** — Historical game results with full box score stats. Date range picker with Search button. Three-way view toggle (Home / Away / All). "All" mode groups home + away rows per game with accent border grouping. Columns: Date, Matchup, W/L, PTS, FG%, 3P%, FT%, REB, AST, STL, BLK, TOV, +/-.

**Predict** — Full prediction interface:
- *Input bar:* Home/Away dropdowns, date picker, Run Prediction button. Hidden "Advanced" toggle for Speed Mode (Standard = XGBoost, Fast = Ridge + LogReg).
- *Prediction card:* Winner badge with confidence %, ensemble win probability bars, classifier vs score model breakdown sub-rows, score boxes with predicted points, spread, total, collapsible 90% confidence interval.
- *Parlay calculator:* Collapsible section with two win checkboxes (mutually exclusive home or away), plus four optional line inputs (home pts, away pts, total, spread). Results table with Prob Over / Prob Under per leg and combined parlay probability.
- *History table:* Session-only log of all predictions with scores, spread, total.

---

### Infrastructure

**Docker Compose — 3 containers:**

| Service | Image | Port |
|---------|-------|------|
| db | postgres:16 | 5432 (internal) |
| api | python:3.11-slim (built) | 8000 (internal) |
| frontend | node:20 build → nginx:alpine | 3000 → 80 |

**Nginx** proxies `/api/` → `http://api:8000`, serves React SPA at `/` with `try_files` fallback for client-side routing.

**Frontend build** is multi-stage: Node builds the Vite bundle, then Nginx serves the static `/dist` output — no Node.js in production.

---

## 2. How the Machine Learning Works

### The Core Idea

The models don't know anything about individual players, coaches, or injuries. They only know: *how has this team been playing recently?* Rolling averages over the last 3, 5, 7, and 10 games capture current form — a team on a hot streak shows up in its rolling stats, and a team playing back-to-backs shows up in rest days.

### Why Two Models?

The **classifier** learns directly from win/loss patterns. It sees thousands of matchups and learns which feature combinations correlate with winning, without ever thinking about points.

The **regression model** takes a completely different path — it tries to predict how many points each team will score. From those point predictions, you can derive the win probability, spread, and total as natural byproducts.

Neither approach is always better. Ensembling them (averaging the two win probabilities) is more reliable than either alone because they make different types of errors.

### Why XGBoost?

Gradient boosted trees handle:
- Non-linear relationships (rest days matter more when a team is already fatigued)
- Feature interactions automatically (home team 3P% vs opponent's defensive 3P%)
- Missing data gracefully (early season with few games in rolling window)

Ridge Regression is the "fast" option — it's simpler, trains in milliseconds, and still outperforms naive baselines. Useful when you need quick estimates.

### What the Confidence Intervals Mean

The 90% CI `[L, U]` means: *if our model's error distribution holds, 90% of actual scores will fall within this range.* Wider CIs = more uncertainty. The intervals are derived from how wrong the model was on a held-out set of games — not from theoretical assumptions.

**Important caveat:** The normality of residuals was visually verified (Q-Q plots) and Shapiro-Wilk tested. NBA score residuals are approximately normal, which justifies using `norm.cdf` for parlay probabilities. The tails (extreme blowouts) are slightly fatter than normal — parlays near extreme lines should be treated with extra caution.

---

## 3. Making This Better for Sports Bettors

This is an honest assessment of what the current model gets right, what it misses, and what would make it genuinely useful for betting.

### High Impact — Add These First

#### Expected Value (EV) Calculator
The single most important feature missing. A model probability alone tells you nothing — what matters is whether the probability is higher than what the sportsbook is offering.

```
EV = (model_prob × potential_win) - ((1 - model_prob) × stake)
```

Add a field to enter the American odds (+110, -150, etc.), convert to implied probability, and show:
- Model probability vs. implied probability
- Edge (model prob - implied prob)
- EV per $100 bet

If your model says DEN wins with 68% probability and the book has them at -160 (implied 61.5%), that's a +6.5% edge — a positive EV bet.

#### Backtesting / Historical Accuracy
The model is only useful if it's actually right more often than the market. Build a backtesting module that:
- Runs predictions on historical games (train up to date X, predict game X+1)
- Records model probability vs actual outcome
- Computes Brier Score (lower is better for probability calibration)
- Shows accuracy by confidence tier (predictions >70% confident — how often correct?)
- Shows ROI if you had bet every game where the model had >X% edge

Without this, there's no way to know if the model has real edge or just sounds convincing.

#### Live Odds Integration
Pull live lines from The Odds API (free tier available) or Sportradar. Show the current Vegas line next to every model prediction so the user never has to look it up separately. Highlight when the model disagrees significantly with the market.

#### Calibration Curve
A well-calibrated model that says "60% win probability" should be right 60% of the time. Plot model probability (x-axis) vs actual win rate (y-axis). A perfectly calibrated model follows the diagonal. Most ML models are overconfident — this tells you by how much and how to correct it.

### Medium Impact — Significant Improvements

#### Player Availability / Injury Adjustment
The biggest weakness of the current model. If Nikola Jokic sits out, DEN's rolling stats are built on games he played in — the model has no idea he's missing. Two approaches:

1. **Simple flag:** Check NBA injury reports (available via `nba_api`), warn the user if a star player is listed as out/questionable
2. **Full adjustment:** Subtract the missing player's per-game stats from the team's rolling averages — rough but better than nothing

This is the single biggest source of model error on game day.

#### Opponent-Adjusted Stats (Strength of Schedule)
A team averaging 118 points looks great — unless they played 10 games against bottom-5 defenses. Adjust rolling stats by the quality of opponents faced. Simple version: multiply each rolling stat by an opponent strength factor derived from the opponent's defensive rolling stats.

#### Pace-Adjusted Stats
Raw points per game is heavily influenced by pace (how many possessions per game). A slow-paced defensive team playing a fast-break team will produce a different total than their averages suggest. Add `offensive_rating` and `defensive_rating` (points per 100 possessions) as features alongside raw stats.

#### Head-to-Head Record
Some teams consistently have another team's number regardless of overall form. Add a feature for historical head-to-head win rate (last 3 seasons). Small effect but easy to add.

#### Momentum / Streak Features
Add explicit streak features:
- Current win/loss streak length
- Point differential trend (getting better or worse over last 5 games)
- Home/away split over last 10 games

#### Back-to-Back Weighting
Currently rest days is a numeric feature. Add a binary flag for back-to-back games (rest_days == 1) — the performance drop for back-to-backs is well-documented and may deserve its own feature weight.

#### Kelly Criterion Bet Sizing
Once you have EV, suggest how much to bet. Kelly Criterion: bet `(edge / odds)` of your bankroll. Show both full Kelly and half-Kelly (half-Kelly is standard practice to reduce variance). This completes the betting workflow: model → probability → EV → bet size.

### Parlay-Specific Improvements

#### Correlated Leg Warnings
The current calculator treats all legs as independent (multiplies probabilities directly). This is mathematically wrong for correlated legs. When a user selects "DEN wins" AND "DEN over 130.5 pts", flag it:

> ⚠️ These legs are positively correlated. The true probability may be higher than shown. Consider using the conditional probability instead.

Implement the Monte Carlo simulation approach discussed during development to compute the true joint probability for correlated legs.

#### Same-Game Parlay Mode
Allow users to build a full SGP with correlated legs and use the simulation-based joint probability instead of the naive product. Run 100,000 score simulations, count how many satisfy all conditions simultaneously.

#### Parlay History & ROI Tracking
Track parlays across sessions, store them in the database, and show historical ROI by parlay size and leg type.

### Longer Term

#### Line Movement Alerts
Show how the Vegas line has moved since opening. If the model says DEN -6 and the line has moved from -4 to -7, that's a signal the market is agreeing with the model — or that sharp money is on DEN. Very useful context.

#### Sharp Money Indicators
Some sportsbooks publish betting percentages. If 80% of bets are on the underdog but the line keeps moving toward the favorite, that's sharp money. Scraping or API-sourcing this data would be a strong signal to combine with model output.

#### Model Ensembling with Public Projections
FiveThirtyEight (archive), ESPN BPI, and other outlets publish win probability models. Ensembling your model with external ones tends to outperform any single model — the market has already priced in consensus, so disagreement between sources is where edge lives.

---

## 4. Beginner's Guide to Sports Betting

*This section is for anyone new to sports betting who wants to understand what the app's predictions mean and how to use them responsibly.*

---

### The Basics

#### Moneylines — Picking a Winner

The simplest bet: who wins the game? Sportsbooks express this with American odds:

- **-150** on DEN means: bet $150 to win $100 (DEN is favored)
- **+130** on MEM means: bet $100 to win $130 (MEM is the underdog)

The negative number is always the favorite, positive is the underdog.

**Implied probability** — what the odds say about the chance of winning:
- `-150` implies `150 / (150 + 100)` = **60%** win probability
- `+130` implies `100 / (130 + 100)` = **43.5%** win probability

Notice those add up to 103.5%, not 100% — that extra 3.5% is the **vig** (or juice): the sportsbook's profit margin built into every bet.

#### The Spread — Handicapping the Favorite

Instead of just picking a winner, the spread gives the underdog extra points. If DEN is -7 against MEM:

- A bet on **DEN -7** wins only if DEN wins by more than 7
- A bet on **MEM +7** wins if MEM wins outright OR loses by fewer than 7
- If DEN wins by exactly 7, it's a **push** (your money back)

The spread is designed by the sportsbook to make both sides equally attractive, splitting action 50/50 so they profit from the vig regardless of the outcome.

#### Over/Under (Total) — Combined Points

The sportsbook sets a number (e.g., 222.5). You bet whether the total points scored by both teams is over or under that number. Neither team matters individually — just the combined final score.

#### Parlays — High Risk, High Reward

A parlay combines multiple bets into one. All legs must win for the parlay to pay out. The reward is much higher than individual bets, but the risk compounds:

| Legs | Implied Probability (each 50/50) | Parlay Payout |
|------|----------------------------------|---------------|
| 2 | 25% | ~+260 |
| 3 | 12.5% | ~+600 |
| 4 | 6.25% | ~+1200 |
| 5 | 3.125% | ~+2500 |

**The catch:** sportsbooks pay slightly less than the true probability. A 3-leg parlay at true 50% odds each should pay +700, but they'll offer +600. That difference is profit for the book. Parlays are fun, but the expected value is almost always negative.

---

### Key Concepts for Using This App

#### What "Win Probability" Means

When this app says DEN has a 67% win probability, it means: *based on recent rolling performance statistics, if these two teams played 100 times under similar conditions, DEN would be expected to win about 67 of them.*

It does **not** mean DEN will definitely win. It does not account for today's injury report, tonight's refs, or any factor outside of team-level box score rolling stats. It is a statistical estimate, not a guarantee.

#### What "Edge" Means

Edge is the difference between what the model says the probability is and what the sportsbook implies:

> Model: DEN wins 67% | Sportsbook: -160 (implied 61.5%) | **Edge: +5.5%**

Positive edge means the model thinks the bet is underpriced — the sportsbook is offering better odds than the true probability suggests. Negative edge means the opposite. Long-term profitable betting requires consistently finding positive edge.

#### What the Confidence Intervals Mean

The score prediction comes with confidence intervals like `DEN 131 [118, 144] (90% CI)`. This means the model expects that 90% of actual scores would fall between 118 and 144. The wider the interval, the less certain the model is. Don't bet small totals as if the model is precise — it's an estimate with real uncertainty.

#### Expected Value (EV)

The right question isn't "will this bet win?" — it's "is this bet profitable in the long run?"

> A coin flip game that pays $2 when you win and costs $1 when you lose is a good bet — even though you lose half the time.

EV = (Probability of winning × Amount won) - (Probability of losing × Amount lost)

A bet with positive EV will make money over hundreds of bets even if it loses today. A bet with negative EV will lose money over time even if it wins today. Almost all casino bets and most parlay bets have negative EV.

---

### Common Beginner Mistakes

**1. Betting with your gut, not your edge**
"I just feel like the Lakers will win" is not a strategy. The market has already priced in everyone's gut feeling. You need a reason to believe the market is wrong.

**2. Chasing losses**
Doubling your bet after a loss to "get even" is the fastest path to losing a large amount. Every bet is independent — past losses don't increase your chances of winning the next one.

**3. Parlaying because the individual bets feel boring**
Parlays are exciting because of the big payouts, but the expected value is almost always worse than individual bets. If you have edge on two separate games, bet them separately.

**4. Ignoring the vig**
Every bet has vig built in. Betting $110 to win $100 means you need to win 52.4% of bets just to break even — not 50%. Most casual bettors don't account for this.

**5. Overreacting to one game's result**
A team that just lost by 30 isn't suddenly terrible. A team that just won by 20 isn't suddenly dominant. Rolling averages smooth this out — but emotional bettors chase last night's box score.

**6. Treating a high win probability as a sure thing**
A 70% win probability means it loses 30% of the time. Bet sizing should reflect your actual edge, not your confidence that it will win tonight.

---

### Using This App Responsibly

- This app is a **decision support tool**, not a betting advice service
- No model can predict individual games reliably — even a 70% model loses 30% of the time
- Never bet more than you can afford to lose
- Use the confidence intervals to understand uncertainty, not just the point estimate
- Always compare the model probability to the implied odds before betting
- If you're chasing losses or gambling is causing stress, stop and seek help: [National Problem Gambling Helpline: 1-800-522-4700](https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/)

---

## 5. Development Roadmap

### Milestone 2 — Player Performance & Props

The most impactful near-term addition for sports bettors.

**What to build:**
- Pull player game logs from `nba_api` (`PlayerGameLog` endpoint)
- New DB table: `player_game_data` (player_id, team_id, game_id, pts, reb, ast, stl, blk, tov, min, fg_pct, etc.)
- Same rolling window feature engineering as teams, but per player
- New endpoint: `POST /api/predict/player` → given player + opponent + date, predict pts/reb/ast with CIs
- New page: **Player Props** — search player, pick opponent + date, get predicted stat lines and probability of going over/under a line
- Enables player prop legs in the existing parlay calculator

**Technical notes:**
- Player data is per-game and much higher volume than team data — index by player_id + game_date
- Need to handle traded players (team_id changes mid-season)
- Rolling stats should be opponent-adjusted (harder to score 30 against a top-5 defense)

---

### Milestone 3 — Additional Sports

Expand beyond NBA.

**What to build:**
- Abstract the data ingestion + feature engineering layer behind a sport-agnostic interface
- Start with **NFL** using `nfl_data_py` (free, community-maintained)
- Add `sport` column to all relevant DB tables, or namespace tables by sport
- Add `sport` query parameter on all endpoints (default: "nba")
- New page: sport selector in navbar
- New rolling stats for NFL: yards, turnovers, third-down conversion, red zone efficiency, etc.

**Technical notes:**
- NFL has only 17 games per season — rolling windows need to be smaller (3, 5 game windows instead of 3, 5, 7, 10)
- Player-level features matter more in NFL (QB performance dominates outcomes)
- Consider college sports (NCAAB) as a third sport — `sportsreference` library has data

---

### Milestone 4 — AWS Deployment with Terraform

Move from local Docker to production cloud infrastructure.

**Architecture:**
```
Route53 → ALB → ECS (Fargate)
                 ├── API service (FastAPI container)
                 └── (Frontend served from S3/CloudFront)
         ↓
         RDS PostgreSQL (Multi-AZ for production)
```

**Terraform modules to build:**
- VPC (public/private subnets, NAT gateway)
- ECS cluster + task definitions + services
- RDS PostgreSQL instance
- ALB + target groups + listener rules
- ECR repositories for Docker images
- S3 bucket + CloudFront distribution for frontend static assets
- Secrets Manager for DATABASE_URL and API keys
- IAM roles for ECS task execution

**CI/CD via GitHub Actions:**
- On push to `main`: build Docker images → push to ECR → update ECS service → deploy
- Separate `staging` environment with lower-cost instances

**Why S3 + CloudFront instead of nginx container:**
- No container to manage for static files
- Global CDN edge caching
- Much cheaper than running a container 24/7

---

### Milestone 5 — User Accounts & Monetization

**Auth:**
- AWS Cognito or Auth0 for OAuth (Google/Apple sign-in)
- JWT middleware on protected endpoints
- `users` table: user_id, email, plan, stripe_customer_id, created_at

**Tier structure:**

| Feature | Free | Pro ($X/mo) | Premium ($Y/mo) |
|---------|------|-------------|-----------------|
| Schedule & game results | ✓ | ✓ | ✓ |
| Basic win probability (LogReg) | ✓ | ✓ | ✓ |
| Full XGBoost ensemble | — | ✓ | ✓ |
| Score predictions + CIs | — | ✓ | ✓ |
| Parlay calculator | — | ✓ | ✓ |
| Player props | — | — | ✓ |
| EV calculator + odds integration | — | — | ✓ |
| GenAI analysis | 1/day | 3/day | Unlimited |

**Stripe integration:**
- Subscription management via Stripe Billing
- Webhook handler for subscription events (created, cancelled, payment_failed)
- Middleware checks user plan before serving paid endpoints

---

### Milestone 6 — GenAI Score Feature

Add a Claude-powered narrative explanation to each prediction.

**What it does:**
- After `/predict/full` runs, optionally call the Claude API with the prediction outputs as context
- Prompt includes: predicted winner, confidence, score, spread, both teams' key rolling stats, rest days, model agreement/disagreement
- Returns: 3–5 sentence natural language explanation

**Example output:**
> Denver is favored at 68.4% tonight. Their 10-game rolling +/- of +9.3 leads the Western Conference, and they're coming off two days of rest compared to Memphis playing on zero. The score model and win probability classifier are in strong agreement here — both have Denver winning by double digits. Memphis has struggled on the road this month, shooting 34% from three in away games over the last 5. The 90% CI for the total (207–285) is wide, suggesting some variability — but the direction is clear.

**Implementation:**
- New `/api/predict/analysis` endpoint or optional field in `/predict/full` response
- Rate-limited by user tier (Free: 1/day, Pro: 3/day, Premium: unlimited)
- Cached per prediction (same inputs → same analysis, don't re-call API)
- Flag when classifier and regression disagree significantly: "⚠️ The win probability models disagree on this game (Classifier: 72%, Score model: 51%) — treat this prediction with caution."

---

### Additional Features (Backlog)

These don't fit neatly into a milestone but are high-value additions:

| Feature | Impact | Effort | Notes |
|---------|--------|--------|-------|
| Live odds integration (The Odds API) | High | Low | Free tier, REST API, pulls moneylines + spreads + totals |
| EV calculator | High | Low | Requires odds input field, simple math |
| Backtesting dashboard | High | Medium | Run model on historical dates, display accuracy + ROI |
| Calibration curve | Medium | Low | Plot model prob vs actual win rate, show Brier score |
| Kelly Criterion bet sizing | Medium | Low | Given EV, suggest bet size as % of bankroll |
| Injury report integration | High | Medium | nba_api has injury data, flag missing players |
| Prediction persistence | Medium | Low | Save predictions to DB, recall across sessions |
| Line movement tracking | Medium | High | Requires historical odds data source |
| Same-game parlay (Monte Carlo joint prob) | High | Medium | Full simulation for correlated legs |
| Mobile-responsive UI | Medium | Medium | Current CSS not optimized for small screens |
| Dark/light theme persistence | Low | Low | localStorage for theme preference |
| Export predictions to CSV | Low | Low | Simple download button on history table |
| Opponent-adjusted rolling stats | High | Medium | Key model improvement, requires per-opponent tracking |
| Pace-adjusted stats | Medium | Medium | Add offensive/defensive rating features |
| Head-to-head record feature | Medium | Low | Historical H2H lookup, add as a feature |

---

### Technical Debt to Address

1. **Model training at request time** — currently the model trains fresh on every prediction request. For production, pre-train models on a schedule (nightly), serialize with `joblib`, and load at prediction time. Dramatically faster response times.

2. **No caching layer** — identical prediction requests rebuild rolling stats and retrain from scratch. Add Redis for caching feature sets and predictions with a TTL of a few hours.

3. **Rolling stats rebuilt every request** — the rolling stat computation iterates every team for every prediction. Pre-compute and cache rolling stats after each game sync.

4. **Prediction history is session-only** — history is lost on page refresh. Persist to database, tied to user session or account.

5. **No request timeout handling** — XGBoost training can take 2–3 seconds. Add a backend timeout and a loading state that gracefully handles timeouts.

6. **Single environment** — no staging/development/production separation. Add environment-specific configs before going to production.

7. **No logging or monitoring** — add structured logging (Python `structlog`) and an error tracking service (Sentry) before production.

8. **Startup sync failure is silent** — the sync failure is caught and logged but there's no alerting. Add a health check endpoint that reports sync status.

---

*Generated: April 2026 | NBA Analytics App v1.0*
