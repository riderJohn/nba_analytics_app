# Technology Stack — Additions for v1 Sports Betting Analytics

**Project:** NBA Analytics Platform
**Researched:** 2026-04-27
**Scope:** What to ADD to the existing FastAPI + PostgreSQL + SQLAlchemy + React/TS + scikit-learn/XGBoost stack

---

## Existing Stack (Do Not Replace)

FastAPI, SQLAlchemy, PostgreSQL 16, React 18 + TypeScript, Vite, Docker Compose, scikit-learn, XGBoost, pandas, scipy, nba_api. All confirmed working. Research below covers only net-new additions.

---

## Domain 1: Vegas Odds Data Feed

### Recommendation: The Odds API

**Confidence: MEDIUM** — Pricing/tier details from training data (August 2025 cutoff). Verify at https://the-odds-api.com/#pricing before committing.

| Property | Details |
|----------|---------|
| URL | https://the-odds-api.com |
| Free tier | ~500 requests/month (as of 2025) |
| Paid entry | ~$79–$149/month depending on tier (verify current) |
| NBA coverage | Yes — spreads, moneyline, totals across major US books |
| Update frequency | Odds update every 5–15 minutes pre-game; live in-game on higher tiers |
| Rate limit | Remaining requests returned in response headers (`x-requests-remaining`) |
| Format | REST JSON — straightforward to poll and persist |
| Python support | No official SDK, but trivial to wrap with `httpx` or `requests` |

**Why The Odds API over alternatives:**

- **vs. OddsJam:** OddsJam provides a better UI product and sharper line movement data but targets retail bettors and their API pricing is significantly higher (~$299+/month entry). More than needed for a two-person team's v1. Confidence: LOW (pricing from training data only).
- **vs. Sportradar:** Enterprise-grade, NBA official data partner. Pricing is per-quote, typically $500–$2000+/month for odds feeds. Overkill for v1. Their NBA stats feed is excellent but you already have nba_api for game data. Confidence: MEDIUM.
- **vs. RapidAPI sports aggregators:** Multiple "odds API" products on RapidAPI exist but are often wrappers around The Odds API or unreliable scrapers. Avoid intermediaries.
- **vs. scraping sportsbook sites:** Legally gray in some jurisdictions, ToS violations, fragile to DOM changes. Playwright is already in the repo as an experiment — do not promote this to production for odds.

**Integration pattern for this stack:**

```python
# backend/app/data/ingestion/odds_pull.py
import httpx
from app.config import settings

ODDS_API_KEY = settings.ODDS_API_KEY  # add to .env
BASE_URL = "https://api.the-odds-api.com/v4"

async def fetch_nba_odds(markets: list[str] = ["h2h", "spreads", "totals"]) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/sports/basketball_nba/odds",
            params={
                "apiKey": ODDS_API_KEY,
                "regions": "us",
                "markets": ",".join(markets),
                "oddsFormat": "american",
            }
        )
        resp.raise_for_status()
        return resp.json()
```

Use `httpx` (async) rather than `requests` (sync) to keep within FastAPI's async model. Add `httpx` to requirements.txt.

**Polling strategy:** Do not poll on every API request. Background task on app startup + periodic refresh every 10 minutes using FastAPI's `BackgroundTasks` or APScheduler. Store results in a new `odds_snapshots` table. This respects rate limits and keeps your API fast.

---

## Domain 2: CLV Calculation and Prediction Tracking

### Recommendation: Build it yourself — no standard library exists

**Confidence: HIGH** — CLV is a domain-specific calculation. There is no widely-adopted Python library for CLV in the sports betting sense (as opposed to "customer lifetime value"). The calculation is ~10 lines of code.

**CLV definition (closing line value):**

```
CLV = implied_prob(closing_line) - implied_prob(model_prediction_at_pick_time)
```

A positive CLV means the model's implied probability was better than where the market closed — evidence of edge.

American odds to implied probability:
```python
def american_to_implied_prob(odds: int) -> float:
    if odds > 0:
        return 100 / (odds + 100)
    else:
        return abs(odds) / (abs(odds) + 100)

def clv(pick_odds: int, closing_odds: int) -> float:
    """Returns CLV as a probability difference. Positive = beat the closing line."""
    return american_to_implied_prob(closing_odds) - american_to_implied_prob(pick_odds)
```

**What you need to build (not buy):**

1. `predictions` table — stores model name, game_id, predicted_prob, pick_odds_at_time, created_at
2. `closing_lines` table — stores game_id, closing_odds, recorded_at (captured after market closes, pre-game)
3. `prediction_results` table — joins prediction + closing line, stores CLV, outcome (win/loss), implied edge
4. A nightly job that captures closing lines for games starting today and reconciles against open predictions

**No external library needed.** The statistical rigor comes from your confidence intervals on CLV samples, not from a library. Use `scipy.stats` (already in stack) for CI calculations:

```python
from scipy import stats
import numpy as np

def clv_confidence_interval(clv_samples: list[float], confidence: float = 0.95) -> tuple[float, float]:
    n = len(clv_samples)
    mean = np.mean(clv_samples)
    se = stats.sem(clv_samples)
    return stats.t.interval(confidence, df=n-1, loc=mean, scale=se)
```

**Alternatives considered and rejected:**

- **BettingTools / sharp_sports Python wrappers:** These exist on GitHub but are unmaintained scrapers targeting specific sportsbook sites, not CLV calculation libraries. Do not use.
- **Kelly criterion libraries:** Several exist (`pykelly` etc.) but Kelly is for bet sizing, not CLV tracking. Different problem.

---

## Domain 3: Correlated Parlay Probability

### Recommendation: Historical conditional frequency table, not a library

**Confidence: HIGH** (for the approach) / **MEDIUM** (for implementation detail)

**Why naive multiplication fails:**

NBA legs are not independent. Same-game parlay: "Team A wins" and "Team A covers -4.5" are highly correlated — if A wins by 10, both hit; if A wins by 2, the moneyline hits but the spread doesn't. Multiplying P(A wins) × P(A covers) double-counts the joint probability.

**Correct approach — conditional frequency lookup:**

Build a `parlay_correlations` table populated from historical game data already in your DB:

```sql
-- Example: P(team wins AND covers spread | spread and total combination)
SELECT
    home_win::int,
    home_cover::int,
    COUNT(*) as frequency
FROM historical_games
WHERE abs(spread) BETWEEN 3 AND 5
GROUP BY home_win, home_cover
```

At prediction time: look up the empirical joint frequency for the specific combination of legs rather than multiplying marginal probabilities.

**For cross-game parlays** (different games, same night): correlation is lower but not zero — shared effects like referee tendencies, travel back-to-backs, etc. For v1, conservative approach: use independence for cross-game legs but explicitly flag this assumption in the UI. This is still more honest than competitor products.

**No dedicated Python library exists for this.** The approaches in the literature are:

1. Copula models (scipy has `gaussian_kde`, and `statsmodels` has copula support in `statsmodels.distributions.copula`) — mathematically rigorous but complex to implement and explain to users
2. Historical frequency tables — simpler, explainable, good enough for v1
3. Monte Carlo simulation — already partially in your regression.py (Monte Carlo win prob), extend it

**Recommendation: frequency tables for v1, copulas as a v2 upgrade path.**

If you later want copulas: `statsmodels` (already likely a transitive dep) has `GaussianCopula` in `statsmodels.distributions.copula` as of v0.14+. Confidence: MEDIUM — verify version in your environment.

---

## Domain 4: Model Performance Analytics (Statistical Rigor)

### Recommendation: scipy.stats + pingouin (new addition)

**Confidence: MEDIUM** — `pingouin` is well-established as of 2025 but verify current version.

`scipy.stats` (already in stack) handles:
- Confidence intervals on CLV mean
- t-tests for "is this model's CLV significantly > 0?"
- Bootstrap resampling for small sample sizes

**Add `pingouin` for richer statistical testing:**

| What | Why pingouin |
|------|-------------|
| Effect size (Cohen's d) | Quantify practical significance of CLV, not just p-value |
| Power analysis | Tell users when sample size is too small to draw conclusions |
| Bayesian credible intervals | Better than frequentist CIs for small samples (common early in season) |

```bash
pip install pingouin  # current version ~0.5.x as of 2025
```

**Confidence: MEDIUM** — `pingouin` is actively maintained, but verify `pip install pingouin` gives you ≥0.5.3 which added the Bayesian estimation functions.

**Do NOT add:**
- `lifelines` — survival analysis library often confused with "model performance"; not relevant here
- `mlflow` or `wandb` — full ML experiment tracking platforms; massive overkill for 2 models and a two-person team. Your `predictions` table IS your experiment tracker.
- `great_expectations` — data quality framework; unnecessary complexity for v1

---

## Net-New Additions to requirements.txt

```
httpx>=0.27.0          # async HTTP client for odds API polling (replaces requests in new code)
pingouin>=0.5.3        # statistical testing for model track record (CIs, effect sizes)
apscheduler>=3.10.0    # background polling scheduler for odds feed
```

**Confidence on versions: LOW** — verify latest stable with `pip index versions httpx pingouin apscheduler` before pinning.

Note: `httpx` may already be transitively installed (FastAPI recommends it), but pin it explicitly. `APScheduler` 3.x works well with FastAPI; v4.x is a major rewrite with different API — check which version is stable when you install.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Odds API | The Odds API | OddsJam | 3–5x more expensive entry point; better UI product but wrong layer for this use case |
| Odds API | The Odds API | Sportradar | Enterprise pricing, per-quote; v1 budget doesn't justify |
| Odds API | The Odds API | Web scraping | ToS violations, fragility, Playwright not production-ready for this |
| CLV calc | Custom code | Any library | No viable library exists; CLV is 10 lines of math |
| Parlay correlation | Frequency tables | Copula models | Complexity vs. benefit ratio wrong for v1; upgrade path exists via statsmodels |
| Stats | scipy + pingouin | MLflow/W&B | Full experiment tracking platforms are overkill for 2-model, 2-developer v1 |
| HTTP client | httpx | requests | requests is sync; httpx is async-native, consistent with FastAPI's async model |

---

## Open Questions (Verify Before Building)

1. **The Odds API current pricing:** Training data cutoff may have stale pricing. Verify at https://the-odds-api.com/#pricing — specifically whether the free tier covers NBA pre-game odds at sufficient frequency for dev/testing.

2. **The Odds API closing line availability:** Does their API retain historical odds snapshots (for closing line capture), or only current odds? This is critical for the CLV pipeline. If they only serve current odds, you must poll and store snapshots yourself — which is feasible but adds a data pipeline requirement. Confidence: LOW — must verify with their docs.

3. **APScheduler v3 vs v4:** APScheduler 4.x (released 2024) has a different API from 3.x. Confirm stable version before installing. Confidence: LOW on current version status.

4. **statsmodels copula version:** Confirm `statsmodels.distributions.copula.GaussianCopula` is available in whatever statsmodels version is in your environment. Needed only for v2 correlated parlay upgrade.

---

## Sources

- The Odds API documentation: https://the-odds-api.com/liveapi/guides/v4/ (HIGH confidence — official docs)
- scipy.stats documentation: https://docs.scipy.org/doc/scipy/reference/stats.html (HIGH confidence — official docs)
- pingouin documentation: https://pingouin-stats.org/ (MEDIUM confidence — official, verified active as of 2025)
- statsmodels copula: https://www.statsmodels.org/stable/distributions.html (MEDIUM confidence — official docs, version-dependent)
- CLV methodology: widely documented in sharp betting community (bettor education blogs, e.g. Unabated, Pinnacle); not a single source (MEDIUM confidence on approach, HIGH confidence it is the correct metric)
- OddsJam / Sportradar pricing: training data only (LOW confidence — verify current pricing before ruling out)
