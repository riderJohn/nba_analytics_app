from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.models.games import GameResponse, TeamResponse
from app.api.services.games import get_all_teams, get_games
from app.db.database import get_db

from datetime import date

router = APIRouter(prefix="/api", tags=["data pulling"])

@router.get("/teams", response_model = list[TeamResponse])
def get_teams_endpoint(db: Session = Depends(get_db)):
    return get_all_teams(db)

@router.get("/games", response_model = list[GameResponse])
def get_games_endpoint(start_date: date, end_date: date | None = None, db: Session = Depends(get_db)):
    return get_games(db, start_date, end_date)
