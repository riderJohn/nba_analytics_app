from pydantic import BaseModel, Field

from datetime import date

class PredictRequest(BaseModel):
    home_team_abbr: str = Field(description="Abbreviation of the home team")
    away_team_abbr: str = Field(description="Abbreviation of the away team")
    game_date: date = Field(description="Date of the game")
    model_name: str = Field(description="Name of the model to use for prediction")

class PredictResponse(BaseModel):
    home_team_win_prob: float = Field(description="Predicted probability of the home team winning")
    away_team_win_prob: float = Field(description="Predicted probability of the away team winning")