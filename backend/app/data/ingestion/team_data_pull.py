## This module is responsible for pulling team data from the NBA API and writing it into the database.

# Python modules
from nba_api.stats.static import teams
import pandas as pd
from datetime import date

# My modules
from app.schemas import team
from app.db.database import SessionLocal

def pull_team_data() -> pd.DataFrame:
    """Function to pull team data from the NBA API and write into the database."""
    nba_teams = teams.get_teams()
    teams_df = pd.DataFrame(nba_teams)

    try:
        with SessionLocal() as conn:

            teams_df = teams_df.rename(columns = {"id": "team_id"})
            teams_df['pull_date'] = date.today()

            teams_data = teams_df.to_dict(orient = "records")

            for t in teams_data: 
                team_record = team.Team(**t)
                conn.merge(team_record)

            conn.commit()
            
    except Exception as e:
        print("Error writing data to database:", e)

    return teams_df