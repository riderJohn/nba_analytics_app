from contextlib import asynccontextmanager
from datetime import date, timedelta

from fastapi import FastAPI
from sqlalchemy import func

from app.api.routers import games, schedule, predict
from app.db.database import init_db, SessionLocal
from app.schemas.game import GameOverview


def _sync_games():
    with SessionLocal() as db:
        last_pull = db.query(func.max(GameOverview.pull_date)).scalar()

    if last_pull is None:
        print("No existing data — skipping startup sync. Run __main__.py to do initial ingest.")
        return

    start_date = (last_pull + timedelta(days=1)).strftime("%Y-%m-%d")
    today = date.today().strftime("%Y-%m-%d")

    if start_date > today:
        print("Game data is already up to date.")
        return

    print(f"Syncing games from {start_date} to {today}...")
    from app.data.ingestion.game_overview_data_pull import get_games
    df = get_games(start_date, today)
    print(f"Synced {len(df)} game rows.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        _sync_games()
    except Exception as e:
        print(f"Warning: startup game sync failed ({e}). API will still start.")
    yield


app = FastAPI(title="NBA Analytics App", version="1.0.0", lifespan=lifespan)

app.include_router(games.router)
app.include_router(schedule.router)
app.include_router(predict.router)

@app.get("/")
def root():
    return {"message": "Welcome to the NBA Analytics App!"}
