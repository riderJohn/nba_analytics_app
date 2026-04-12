from pydantic import BaseModel, Field

class ScheduleResponse(BaseModel):
    game_id: str = Field(..., description="Unique identifier for the game")
    game_date_est: str = Field(..., description="Date of the game in YYYY-MM-DD format")
    home_team_id: int = Field(..., description="ID of the home team")
    visitor_team_id: int = Field(..., description="ID of the away team")