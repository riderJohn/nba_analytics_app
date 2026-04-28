# Feature Landscape

**Domain:** Sports betting analytics platform — sharp NBA bettor tooling
**Researched:** 2026-04-27
**Confidence note:** Stack/workflow specifics HIGH confidence (well-documented domain with established practitioner consensus); platform comparison claims MEDIUM confidence (based on training data through 2025, no live verification of competitor current state).

---

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tonight's schedule with current Vegas lines | Without live lines the product is an academic toy, not a tool | Med | Requires odds API integration; The Odds API free tier covers this |
| Model implied probability displayed next to line | This is the core comparison a sharp bettor makes — if you can't show it side by side, the model output is useless | Low | Backend already has predict endpoint; UI wiring needed |
| Historical model win/loss record | Every competitor shows this — users will ask immediately | Low | Trivial to display once predictions are persisted |
| Persisted pre-game predictions | Without this there is no track record, no CLV, no history — everything else is blocked on this | Med | Currently the single most critical gap: predictions are computed but never written to DB |
| Closing line capture | Required to compute CLV; must be recorded after market closes, before game starts | Med | Scheduled job or triggered reconciliation; odds API supplies this |
| CLV per prediction (model prob vs closing line) | The core metric the product is differentiated on — if it's missing, the CLV story is just marketing copy | Med | Formula is straightforward once pre-game log and closing line both exist |
| Game result reconciliation (win/loss outcome) | Needed to compute ROI and validate that CLV predicts long-run edge | Low | nba_api supplies final scores; reconciliation job runs post-game |
| Model track record dashboard | Where a user decides whether to trust a model — CLV mean, sample size, win rate, ROI | Med | Aggregate queries on predictions table; needs sufficient sample before meaningful |

---

## Differentiators

Features that set the product apart. Not baseline expectations, but valued by the target user.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| CLV as primary track record metric (not win/loss) | Action Network / BetQL / Dimers all report win/loss, which is noise. CLV separates skill from variance. Serious bettors know this; it immediately signals the platform is built by people who understand the domain | Low (display) / Med (pipeline) | Display is trivial; the pipeline (pre-game log → closing line → reconcile) is the real work |
| Confidence intervals on track record stats | CLV mean of +2% on 30 picks means nothing; +2% ±0.4% on 300 picks means something. Showing CI makes the platform honest in a way competitors aren't | Low | Binomial CI is a few lines; requires sample size discipline |
| Model leaderboard with multiple named models | Lets users see logistic vs XGBoost vs ensemble head-to-head by CLV, not just pick one — teaches users which model fits which game context | Med | Requires all models logging independently; adds multi-model prediction storage |
| EV (expected value) surfaced per bet | EV = (model_prob - implied_prob) × potential_win — a single number a bettor can sort by | Low | Derived from model prob + line; pure frontend math once both are displayed |
| Correlated parlay probability engine | Naive leg multiplication assumes independence; NBA legs (same-game or divisional matchups) are correlated. A frequency-table approach using historical joint outcomes is more honest and rare among free tools | High | Requires historical co-occurrence matrix; significant data work |
| Line movement display (open vs current) | Shows whether sharp money has already moved the line — if a model edge has been "bet into," the value may be gone | Med | Requires storing opening line at game creation, not just current line |
| Sample-size warnings on track record | A model with 8 picks showing 62% CLV beat rate is not meaningful — surfacing "insufficient sample" prevents users from over-trusting early results | Low | Threshold logic (e.g., < 50 picks = warning); easy to implement, builds trust |
| Prediction history filterable by model, date, game type | Lets users audit the full prediction log — transparency is a core product value | Med | Standard table/filter UI; depends on predictions being persisted |

---

## Anti-Features

Features to deliberately NOT build in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User-built / no-code model builder | High UX and backend complexity; dilutes focus on the core CLV track record value prop; most sharp bettors want to evaluate a model, not build one | Platform-provided named models with transparent track records |
| Real-money sportsbook integration / bet placement | Regulatory risk, liability, distraction from analytics mission; every US state has different rules | Link to the bettor's preferred book — the job is finding edge, not placing the bet |
| Social picks feed / following other users | Turns the product into a tout service; changes the incentive structure and trust model | Keep it model-driven, not personality-driven; v2 consideration only |
| Win/loss record as the headline metric | This is what every competitor reports and it's misleading — teams with winning records can be negative CLV, and vice versa | Lead with CLV beat rate and CLV mean; show win/loss as secondary context |
| Per-game chat / comments | Community management overhead for a 2-person team; attracts low-quality discourse | Focus on data quality and model transparency instead |
| Betting bankroll manager / Kelly criterion calculator | Scope creep; a sharp bettor already has their own system for this | Out of scope for v1; could add EV surfacing as a lightweight substitute |
| Live in-game predictions | Latency, data feed cost, and model complexity are all much higher; real-time odds for in-game markets are expensive | Pre-game predictions only for v1 |
| Multi-sport expansion | NBA depth is the moat; spreading thin produces worse predictions and thinner track records in every sport | NBA-only until track record is established |

---

## Feature Dependencies

```
Odds API integration
  → Pre-game prediction logging (needs a line to log against)
  → Opening line storage (needed for line movement display)
  → Closing line capture (needs the market to close)

Pre-game prediction logging
  → CLV computation (needs both logged prediction AND closing line)
  → Model track record dashboard (needs CLV per prediction)
  → Model leaderboard (needs track records per model)
  → Prediction history browser (needs predictions in DB)
  → EV display (needs model prob + current line together)

Closing line capture
  → CLV computation (direct input)

Game result reconciliation
  → ROI calculation per model (needs outcome + odds)
  → Win/loss context on track record (secondary metric)

CLV computation
  → Model track record dashboard
  → Model leaderboard
  → Confidence intervals on track record

Model leaderboard
  → (No downstream dependencies in v1; it's a read-only aggregate view)

Correlated parlay probability engine
  → Historical co-occurrence matrix (prerequisite data work)
  → (Standalone; does not block other features)
```

**Critical path:** Odds API integration → pre-game prediction logging → closing line capture → CLV computation → track record dashboard → leaderboard. Everything that matters for the differentiated product runs through this chain.

---

## CLV Tracking Workflow (Detailed)

This workflow is the backbone of the product. Each step must be explicit in the implementation.

### Step 1: Pre-Game Prediction Log (T-minus hours before tip-off)

When a prediction is requested (or on a scheduled pre-game run):
- Record: `game_id`, `model_name`, `model_implied_prob`, `current_line_at_log_time`, `current_line_juice`, `timestamp_logged`
- This row is immutable after creation — it is the historical record
- Do NOT update it if the model is re-run later; create a new row with a new timestamp

The common mistake here is updating the prediction row when the game result comes in. Pre-game snapshot and post-game reconciliation are separate records or separate columns — the pre-game data must never be overwritten.

### Step 2: Closing Line Capture (T-minus ~5 minutes before tip-off)

- Run a scheduled job (e.g., APScheduler or Celery beat) that fires for each game in the "pre-game" window
- Fetch the final market line from the odds API just before market closes
- Write: `closing_line`, `closing_line_juice`, `timestamp_closing_captured` to the prediction row (or a linked closing-line record)
- Mark the prediction as "closing line captured" — prevents re-running the job for the same game

If the job misses a game (API downtime, scheduling gap), that prediction row is orphaned and must be excluded from CLV calculations with a flag (`closing_line_missing = true`), not silently dropped.

### Step 3: CLV Computation

CLV = model_implied_prob − closing_line_implied_prob

Both probabilities must be in the same format (no-vig or vig-included — pick one and be consistent). No-vig is the correct choice for honest comparison.

To convert American odds to no-vig implied probability:
1. Convert both sides of the market to raw implied prob: `p = 100 / (odds + 100)` for positive, `p = |odds| / (|odds| + 100)` for negative
2. Sum both sides (will be > 1.0 due to the vig)
3. Normalize each side by dividing by the sum

CLV is then: `clv = model_prob_no_vig − closing_prob_no_vig`

Positive CLV means the model predicted more edge than the market ultimately priced in.

### Step 4: Game Result Reconciliation (post-game)

- Scheduled job checks nba_api for final scores after game end
- Updates prediction rows with: `actual_outcome` (win/loss vs spread or moneyline), `result_timestamp`
- ROI calculation: `roi = (actual_outcome × odds_to_decimal(line_at_log_time)) − 1`

### Reconciliation Integrity Rules

- Predictions without a closing line: exclude from CLV stats, flag in UI as "no closing line"
- Predictions without a game result yet: show as "pending" in track record, exclude from win rate / ROI
- Predictions where the game was postponed: mark `game_status = postponed`, exclude from all stats until rescheduled
- Never backfill closing lines from historical data — they must be captured in real time at market close or the CLV calculation is invalid

---

## Model Leaderboard Requirements

A model leaderboard is only credible if it shows the right stats with the right context.

### Required Columns

| Column | Why |
|--------|-----|
| Model name | Identifier |
| Sample size (n picks) | Without this, all other stats are meaningless |
| CLV mean (with CI) | Primary sort metric; show 95% CI inline |
| CLV beat rate % | % of picks where model_prob > closing_prob |
| Win rate % (ATS or ML) | Secondary metric — shows in-context of CLV |
| ROI % | Practical measure; requires result reconciliation |
| Date range covered | Needed to understand recency and season context |

### Required Behaviors

- Default sort: CLV mean descending, but only for models with n >= minimum threshold (suggest 50 picks)
- Models below threshold: still show, but with a "low sample" warning badge — do NOT hide them
- All models persist their own prediction rows independently — leaderboard is a GROUP BY query on `model_name`
- No retroactive adjustments: if a model is retrained or updated, it gets a new version identifier and a fresh row count — old picks stay attributed to the old version

### What NOT to Do on the Leaderboard

- Do not sort by win rate — it rewards noise and is what every competitor does
- Do not show CLV without sample size — a 3-pick CLV leader is meaningless
- Do not hide models with negative CLV — transparency is the product value; showing underperformers builds trust
- Do not average CLV across time without showing the distribution — a model can have a great mean but a terrible recent stretch; show rolling CLV trend if possible (v1 can defer the trend chart, but plan the data model for it)

---

## Parlay Calculator: Genuine Usefulness vs Naive

### What Naive Calculators Do (and why they're wrong)

Naive: `combined_prob = leg1_prob × leg2_prob × ... × legN_prob`

This assumes legs are statistically independent. In NBA same-game parlays, they are not:
- If Team A wins (Leg 1), Team A probably covered (Leg 2) — positively correlated
- If a game goes to OT (Leg 3), the over is more likely to hit (Leg 4) — positively correlated
- If a star player underperforms (Leg 5), his team is less likely to win (Leg 1) — positively correlated

Naive multiplication systematically understates the true probability of correlated same-game parlays, which is why books love them.

### What a Better Parlay Calculator Needs

**Minimum viable improvement: correlation coefficient adjustment**

Use historical game data to estimate pairwise Pearson correlation between leg outcomes (win/loss, cover, over/under). Apply a Cholesky decomposition or simplified factor model to adjust the combined probability.

This is achievable with the existing nba_api historical data already in the DB.

**Preferred approach for v1: frequency table lookup**

For common leg combinations (win + cover, win + over, cover + over), precompute historical joint outcome frequencies from the game log. Example: "Team wins AND covers: 68% of games where they win." Use these empirical frequencies directly rather than assuming independence.

This approach is:
- Explainable to users ("based on X historical games")
- Achievable with the data already in the DB
- More honest than naive multiplication without requiring a full covariance matrix

**What to surface to the user**

| Output | Why |
|--------|-----|
| Correlated probability estimate | The actual prediction |
| Naive multiplication probability | Show for comparison — makes the correlation adjustment visible and educational |
| % difference between naive and correlated | Quantifies how much the naive approach would have overestimated edge |
| Implied odds vs actual offered parlay odds | Lets the bettor see if the book is offering fair value on the parlay |

### Anti-patterns for the Parlay Calculator

- Letting users add legs without surfacing correlation warnings — a 6-leg same-game parlay is almost certainly mispriced
- Showing only the payout without the probability — payout is irrelevant without knowing the edge
- Not distinguishing between same-game legs (correlated) and different-game legs (mostly independent) — different math applies to each

---

## MVP Recommendation

The full platform vision requires the CLV pipeline to run long enough to accumulate a meaningful track record. The MVP should front-load that pipeline.

**Prioritize (in order):**

1. Odds API integration — everything else is blocked without live lines
2. Pre-game prediction persistence — the single most critical infrastructure gap
3. Closing line capture job — requires scheduling infrastructure (APScheduler in the FastAPI container is sufficient for v1)
4. CLV computation on reconciliation — the formula is simple once steps 2-3 exist
5. Model track record dashboard — first user-visible payoff of the pipeline
6. Odds comparison UI (model prob vs current line, EV) — immediately useful while track record accumulates
7. Model leaderboard — meaningful once there are 50+ picks per model
8. Improved parlay calculator (frequency table approach) — independent of CLV pipeline; can be built in parallel

**Defer with confidence:**

- Line movement display: useful but requires storing opening lines from day one; add at next iteration
- Confidence interval display on track records: implement alongside the dashboard but the CI math is trivial
- Correlated parlay full covariance model: the frequency table approach is good enough for v1; full model is v2
- Prediction history browser with filters: build alongside the dashboard using the same DB queries

---

## Sources

- Domain knowledge on CLV methodology: HIGH confidence — CLV as the professional betting standard is thoroughly documented in sports analytics literature (Joseph Peta, Pinnacle's betting resources, RJ Bell / Pregame methodology debates). Formula and workflow are not in dispute.
- Competitor feature analysis (Action Network, BetQL, Dimers): MEDIUM confidence — based on training data through 2025; these platforms update their features; the claim that none prominently feature CLV-based track records is consistent across multiple sources but should be spot-checked before using competitively.
- Parlay correlation math: HIGH confidence — independence assumption failure in same-game parlays is textbook probability; the Cholesky/factor model approach is standard in quantitative finance applied to correlated assets.
- The Odds API free tier coverage: MEDIUM confidence — as of training data cutoff, The Odds API offered a free tier covering NBA moneylines, spreads, and totals with hourly polling; verify current pricing/limits before committing.
