from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class PredictRequest(BaseModel):
    home_team_abbr: str = Field(description="Abbreviation of the home team")
    away_team_abbr: str = Field(description="Abbreviation of the away team")
    game_date: date = Field(description="Date of the game")
    model_name: str = Field(description="Name of the model to use for prediction")


class PredictResponse(BaseModel):
    home_team_win_prob: float = Field(description="Predicted probability of the home team winning")
    away_team_win_prob: float = Field(description="Predicted probability of the away team winning")


# ── Full prediction ──────────────────────────────────────────────────────────

class FullPredictRequest(BaseModel):
    home_team_abbr: str
    away_team_abbr: str
    game_date: date
    speed_mode: bool = False


class WinProbability(BaseModel):
    classifier_prob: float
    regression_prob: float
    ensemble_prob: float


class PointPrediction(BaseModel):
    home_pts: float
    away_pts: float
    home_resid_std: float
    away_resid_std: float
    spread: float
    total: float


class FullPredictResponse(BaseModel):
    home_team_abbr: str
    away_team_abbr: str
    game_date: str
    predicted_winner: str        # "home" or "away"
    winner_confidence: float     # ensemble_prob if home wins, else 1 - ensemble_prob

    win_probability: WinProbability
    points: PointPrediction

    regression_model_used: str
    classifier_model_used: str
    trained_before: str


# ── Parlay calculator ────────────────────────────────────────────────────────

class ParlayRequest(BaseModel):
    home_team_abbr: str
    away_team_abbr: str
    home_pts: float
    away_pts: float
    home_resid_std: float
    away_resid_std: float
    home_win_prob: Optional[float] = None   # adds "Home Wins" leg
    away_win_prob: Optional[float] = None   # adds "Away Wins" leg
    home_points_line: Optional[float] = None
    away_points_line: Optional[float] = None
    total_line: Optional[float] = None
    spread_line: Optional[float] = None


class ParlayLeg(BaseModel):
    label: str
    prob_over: float
    prob_under: float


class ParlayResponse(BaseModel):
    legs: list[ParlayLeg]
    combined_prob: float