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

## 3. Beginner's Guide to Sports Betting

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
