from sqlalchemy.orm import Session

from app.schemas.game import GameOverview
from app.schemas.team import Team

from datetime import date

def get_all_teams(db: Session):
    return db.query(Team).all()
    
def get_games(db: Session, start_date: date, end_date: date | None = None):
    end_date = end_date or date.today()

    return db.query(GameOverview).filter(
        GameOverview.game_date >= start_date,
        GameOverview.game_date <= end_date
    ).all()
