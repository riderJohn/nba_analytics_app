from nba_api.stats.endpoints import scoreboardv2

from app.api.models.schedule import ScheduleResponse

from typing import List

def get_schedule(game_date: str) -> List[ScheduleResponse]:
    """
    Returns all scheduled games for a given date.
    Format: YYYY-MM-DD
    """

    scoreboard = scoreboardv2.ScoreboardV2(game_date=game_date)

    games = scoreboard.get_data_frames()[0]

    games = games[['GAME_ID', 'GAME_DATE_EST', 'HOME_TEAM_ID', 'VISITOR_TEAM_ID']]
    games.columns = games.columns.str.lower()
    return [ScheduleResponse(**row) for _, row in games.iterrows()]