## This module is responsible for pulling game overview data from the NBA API and writing it into the database.

# Python modules
from nba_api.stats.endpoints import leaguegamefinder
import pandas as pd
from datetime import date

# My modules
from app.schemas import game
from app.db.database import SessionLocal

def get_games(start_date: str, end_date: str | None = None) -> pd.DataFrame:

    end_date = end_date or date.today().strftime("%Y-%m-%d")

    games = leaguegamefinder.LeagueGameFinder(date_from_nullable = start_date, 
                                              date_to_nullable = end_date, 
                                              season_type_nullable = "Regular Season"
                                              ).get_data_frames()[0]
    
    games_df = games.rename(columns = {c: c.lower() for c in games.columns})
    games_df['pull_date'] = date.today()
    games_df['wl'] = games_df['wl'].map({'W': True, 'L': False})
    games_df = games_df.dropna(subset = ['wl'])

    try:
        with SessionLocal() as conn:

            for g in games_df.to_dict(orient = "records"):
                game_record = game.GameOverview(**g)
                conn.merge(game_record)

            conn.commit()

    except Exception as e:
        print("Error writing data to database:", e)

    return games_df