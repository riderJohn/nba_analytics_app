# app/__main__.py
from datetime import datetime, timedelta

# My modules:
from app.db.database import init_db
from app.data.ingestion.team_data_pull import pull_team_data
from app.data.ingestion.game_overview_data_pull import get_games

def main():

    init_db()
    
    team_df = pull_team_data()
    print("Pulled team data.")

    start_date = ('2024-10-01')
    games_df = get_games(start_date)
    print(f"Pulled {len(games_df)} games from {start_date} to {datetime.now()}.")


if __name__ == "__main__":
    main()
