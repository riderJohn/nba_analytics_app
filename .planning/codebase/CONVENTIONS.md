# Coding Conventions

**Analysis Date:** 2026-04-27

## Naming Patterns

**Python Files:**
- Modules use `snake_case`: `game_overview_data_pull.py`, `team_data_pull.py`
- Service files named after their domain: `games.py`, `predict.py`, `features.py`
- Schema (SQLAlchemy ORM) files named after domain entity: `game.py`, `team.py`
- Pydantic model (API shape) files named after domain entity: `games.py`, `predict.py`

**Python Classes:**
- ORM models: `PascalCase` — `GameOverview`, `Team`
- Pydantic request/response models: `PascalCase` with `Request`/`Response` suffix — `PredictRequest`, `PredictResponse`, `FullPredictRequest`, `FullPredictResponse`
- Nested Pydantic models: `PascalCase` describing the data shape — `WinProbability`, `PointPrediction`, `ParlayLeg`
- Base classes: `NBAResponse` (in `backend/app/api/models/games.py`) used as shared Pydantic base with `from_attributes=True`

**Python Functions:**
- All `snake_case`
- Private helpers prefixed with underscore: `_sync_games()`, `_orm_to_df()`, `_load_data()`, `_compute_residual_std()`
- Service functions named as verbs: `get_all_teams()`, `get_games()`, `predict_outcome()`, `predict_full()`
- Router endpoints named with `_endpoint` suffix: `get_teams_endpoint()`, `predict_endpoint()`
- Ingestion functions named as actions: `get_games()`, `pull_team_data()`

**Python Variables:**
- `snake_case` throughout
- DataFrame variables conventionally suffixed with `_df`: `game_df`, `team_df`, `games_df`
- Rolling stats variable: `teams_rolling_stats` (plural team prefix)
- Model instances: `classification_models` dict, `regression_models` dict (plural noun)

**TypeScript/React Files:**
- Page components: `PascalCase.tsx` in `frontend/src/pages/` — `Games.tsx`, `Predict.tsx`, `Schedule.tsx`
- UI components: `PascalCase.tsx` in `frontend/src/components/` — `Navbar.tsx`
- Utility/API modules: `camelCase.ts` — `api.ts`, `types.ts`

**TypeScript Interfaces and Types:**
- All `PascalCase` with no `I` prefix: `Team`, `GameResult`, `PredictRequest`
- Union string literal types: `type Page = 'schedule' | 'games' | 'predict'`
- Theme type: `type Theme = 'dark' | 'nba' | 'retro'`
- Optional fields use `?` not `| undefined`: `speed_mode?: boolean`
- Nullable fields use explicit `| null`: `home_points_line: number | null`

**TypeScript Functions:**
- React components: `PascalCase` default exports — `export default function Predict()`
- Utility functions: `camelCase` — `todayStr()`, `formatTime()`, `pct()`, `pts()`
- API client functions: `camelCase` verb + noun — `fetchTeams()`, `fetchGames()`, `predictGame()`, `predictFull()`

**TypeScript Variables/State:**
- React state pairs: `camelCase` noun + setter `set` + noun — `[loading, setLoading]`, `[error, setError]`
- Abbreviation-based state names accepted: `[homeAbbr, setHomeAbbr]`, `[awayAbbr, setAwayAbbr]`

## Code Style

**Formatting (Python):**
- No formatter configured (no `.prettierrc`, no `pyproject.toml` with Black/Ruff settings)
- Indentation: 4 spaces
- Blank lines: single blank line between top-level functions in service files; two blank lines absent before class bodies in schemas
- Trailing whitespace: inconsistent (some trailing spaces in `database.py`, `game.py`)

**Formatting (TypeScript):**
- No ESLint or Prettier config present
- TypeScript strict mode enabled: `"strict": true` in `frontend/tsconfig.json`
- Target: ES2020

**Linting:**
- No linter configured on either backend or frontend
- TypeScript compiler (`tsc`) is the only static checker in use

## Import Organization

**Python:**
- Standard library imports first, then third-party, then local `app.*` imports
- Local imports separated by blank line from third-party in most files
- Module-level imports preferred; one exception: deferred import inside lifespan function in `backend/app/api/main.py` (`from app.data.ingestion.game_overview_data_pull import get_games`)
- Comment blocks used to label import groups in ingestion files: `# Python modules`, `# My modules`

**TypeScript:**
- React and third-party hooks first, then local `../api`, `../types`, `./components`
- No path aliases configured — all imports use relative paths

## Error Handling

**Python (Backend):**

Routers catch service-raised `ValueError` and re-raise as `HTTPException(status_code=400)`:
```python
# backend/app/api/routers/predict.py
try:
    return predict_outcome(request, db)
except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
```

Service layer raises `ValueError` with descriptive messages for expected business-logic failures:
```python
# backend/app/api/services/predict.py
if game_df.empty or team_df.empty:
    raise ValueError("No data in database. Run data ingestion first.")
```

Infrastructure errors (DB init, startup sync) are caught and printed — they do not abort startup:
```python
# backend/app/api/main.py
except Exception as e:
    print(f"Warning: startup game sync failed ({e}). API will still start.")
```

Data ingestion errors are caught and printed without re-raising:
```python
# backend/app/data/ingestion/game_overview_data_pull.py
except Exception as e:
    print("Error writing data to database:", e)
```

**TypeScript (Frontend):**

All API calls wrapped in `try/catch` with explicit `setError` state:
```typescript
// frontend/src/pages/Games.tsx
try {
    const data = await fetchGames(startDate, endDate)
    setGames(data)
} catch {
    setError('Failed to load games. Make sure the API is running.')
} finally {
    setLoading(false)
}
```

Empty `catch` blocks (no bound error variable) are used when the error detail is not shown to the user — only a generic string is surfaced.

API client (`frontend/src/api.ts`) throws on non-2xx responses:
```typescript
if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
```

## Logging

**Python:** `print()` used exclusively — no logging framework in place. All log output goes to stdout.

Common patterns:
- Progress: `print(f"Syncing games from {start_date} to {today}...")`
- Counts: `print(f"Synced {len(df)} game rows.")`
- Warnings: `print(f"Warning: startup game sync failed ({e}). API will still start.")`
- Success: `print("Database initialized successfully.")`
- Errors: `print("Error writing data to database:", e)`

**TypeScript:** No logging — errors are surfaced via React state only.

## Comments

**Docstrings:**
- Used selectively on service-layer functions that have non-obvious signatures or behavior:
  ```python
  # backend/app/api/services/regression.py
  def fit_regression_model(...) -> tuple[object, pd.DataFrame, pd.Series]:
      """Train regressor on all data before split_date. Returns (model, X, y)."""
  ```
- Inline docstrings on router endpoints to describe date format:
  ```python
  # backend/app/api/routers/schedule.py
  """Endpoint to get the schedule for a given date. Format: YYYY-MM-DD"""
  ```
- Most functions lack docstrings; short functions are considered self-documenting

**Inline Comments:**
- Used heavily in complex service logic to label steps:
  ```python
  # Fresh model copy so concurrent requests don't share fitted state
  # Convert date → datetime for comparisons inside the ML pipeline
  # Build rolling stats for every team
  ```
- Used in TSX to label sections: `{/* ── Section 1: Input bar ── */}`
- Section dividers in Pydantic models use comment banners: `# ── Full prediction ──────────────────────────────────────────────────────────`

## Function Design

**Python:**
- Short, single-purpose service functions (5–20 lines typical)
- Larger orchestration functions (`predict_full`, `predict_outcome`) are 50–80 lines
- Private helpers extracted when logic is reused: `_load_data()` shared between `predict_full` and `predict_outcome`
- Functions return typed tuples where multiple values needed: `-> tuple[float, float, float, float]`
- `verbose: bool = True` parameter pattern used to toggle between evaluation and prediction mode in `fit_evaluate_model()`

**TypeScript:**
- Small pure formatting helpers extracted to module top level: `pct()`, `pts()`, `todayStr()`, `pm()`
- Async handlers defined as `const name = async () => { ... }` inside components
- No custom hooks yet — all logic lives directly in component bodies

## Module Design

**Python Exports:**
- No `__all__` declarations — all module-level names are implicitly exported
- Modules intended for import export their main objects at module level: `classification_models`, `regression_models` dicts in service files

**TypeScript Exports:**
- All React components use `export default function ComponentName()`
- Types/interfaces use named exports: `export interface Team { ... }`
- API functions use named exports: `export const fetchTeams = ...`
- No barrel `index.ts` files — imports reference files directly

## SQLAlchemy ORM Pattern

ORM models live in `backend/app/schemas/` (note: named `schemas` but actually SQLAlchemy ORM models, not Pydantic schemas). All inherit from `Base` in `backend/app/schemas/base.py`:

```python
# backend/app/schemas/game.py
class GameOverview(Base):
    __tablename__ = "game_overview_data"
    season_id: Mapped[int] = mapped_column(Integer, primary_key=True)
```

Modern SQLAlchemy 2.x style used throughout: `Mapped[type]` + `mapped_column()`.

## Pydantic Model Pattern

API request/response shapes live in `backend/app/api/models/`. Response models that map from ORM objects use `ConfigDict(from_attributes=True)` via a shared base:

```python
# backend/app/api/models/games.py
class NBAResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class TeamResponse(NBAResponse):
    team_id: int
    full_name: str
```

Field aliases used where DB column name conflicts with response name:
```python
minutes: int = Field(alias="min")
```

---

*Convention analysis: 2026-04-27*
