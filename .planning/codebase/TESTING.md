# Testing Patterns

**Analysis Date:** 2026-04-27

## Test Framework

**Runner:**
- None configured — no pytest, no Vitest, no Jest setup exists in the project
- No `pytest.ini`, `pyproject.toml` with pytest config, `jest.config.*`, or `vitest.config.*` found

**Assertion Library:**
- None

**Run Commands:**
- No test run commands defined in `backend/requirements.txt` or `frontend/package.json`
- `frontend/package.json` scripts are only `dev`, `build`, `preview` — no `test` script

## Test File Organization

**Backend:**
- One stub file exists: `backend/app/testing/test.py`
- Contents: a single docstring — `"""Notebook for testing code for app"""`
- No actual test functions, classes, or imports
- Directory `backend/app/testing/` exists as a placeholder only

**Frontend:**
- No test files of any kind (no `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`)
- No `__tests__/` directories

**Notebooks as ad-hoc testing:**
- `notebooks/test.ipynb` and `notebooks/NB1_SQL_Practice.ipynb`, `notebooks/NB2_Pandas_Practice.ipynb`, `notebooks/NB3_Applied_Stats_UseCases.ipynb` serve as informal exploratory/validation environments
- ML model logic and feature engineering were developed and validated in notebooks before integration

## Test Structure

No test suites exist. No patterns to document.

## Mocking

No mocking framework in place. No patterns to document.

## Fixtures and Factories

No fixtures or test data factories exist.

## Coverage

**Requirements:** None enforced
**Coverage tooling:** Not installed

## Test Types

**Unit Tests:** Not present
**Integration Tests:** Not present
**E2E Tests:** Not present

## What Needs Tests (Priority Order)

The following areas carry the highest risk without test coverage:

**Critical — ML Pipeline:**
- `backend/app/api/services/features.py` — `get_team_rolling_stats()` and `build_feature_set()` are the core feature engineering functions. Silent bugs here (wrong rolling window, off-by-one on date filters) produce wrong predictions with no error raised.
- `backend/app/api/services/models.py` — `predict_game()` and `fit_evaluate_model()` train and call models. Incorrect column alignment (`matchup_features = matchup_features[X.columns]`) would silently reorder features.
- `backend/app/api/services/regression.py` — `predict_game_points()`, `_compute_residual_std()`, `monte_carlo_win_prob()` are pure math functions easily unit-testable with known inputs.

**High — Service Layer:**
- `backend/app/api/services/predict.py` — `predict_outcome()`, `predict_full()`, `predict_parlay()` orchestrate the full pipeline. Integration tests using a seeded in-memory DB would catch regressions.
- `backend/app/api/services/games.py` — `get_games()` date filter logic; boundary conditions (same start/end date, no results) are untested.

**Medium — API Endpoints:**
- `backend/app/api/routers/predict.py` — `ValueError` → `HTTPException(400)` conversion should be tested to confirm error propagation works correctly.
- `backend/app/api/routers/games.py` — query param parsing for `start_date`/`end_date` types.

**Lower — Data Ingestion:**
- `backend/app/data/ingestion/game_overview_data_pull.py` — upsert logic (`conn.merge()`) is untested; duplicate ingestion runs could silently fail.

## Recommended Setup (When Adding Tests)

**Backend (Python):**
```bash
pip install pytest pytest-asyncio httpx
```

Suggested config in `backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
```

Suggested file layout:
```
backend/
  tests/
    conftest.py           # shared fixtures, in-memory SQLite engine
    test_features.py      # unit tests for get_team_rolling_stats, build_feature_set
    test_regression.py    # unit tests for monte_carlo_win_prob, _compute_residual_std
    test_predict_service.py
    test_api_routes.py    # FastAPI TestClient integration tests
```

Test client pattern for FastAPI:
```python
from fastapi.testclient import TestClient
from app.api.main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to the NBA Analytics App!"}
```

In-memory DB fixture pattern:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.schemas.base import Base
from app.db.database import get_db
from app.api.main import app

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
```

**Frontend (TypeScript):**
```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

No test infrastructure exists yet — Vitest is the natural choice given the Vite build setup.

## Notes on Current Testing Approach

The project currently relies on:
1. Manual verification via the running app UI
2. Jupyter notebooks (`notebooks/`) for exploratory validation of ML logic
3. FastAPI's automatic docs UI (`/docs`) for ad-hoc endpoint testing

The `backend/app/testing/test.py` stub (`backend/app/testing/test.py`) is a placeholder with no implementation. It is safe to repurpose as a real test module or replace with a proper `tests/` directory at the backend root.

---

*Testing analysis: 2026-04-27*
