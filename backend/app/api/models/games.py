from pydantic import BaseModel, ConfigDict, Field

from datetime import date

class NBAResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class TeamResponse(NBAResponse):
    team_id: int
    full_name: str
    abbreviation: str
    nickname: str
    city: str
    state: str
    year_founded: int

class GameResponse(NBAResponse):
    season_id: int
    team_id: int
    team_abbreviation: str
    team_name: str
    game_id: int
    game_date: date
    matchup: str
    wl: bool
    minutes: int = Field(alias="min")
    pts: int
    fgm: int
    fga: int
    fg_pct: float
    fg3m: int
    fg3a: int
    fg3_pct: float
    ftm: int
    fta: int
    ft_pct: float
    oreb: int
    dreb: int
    reb: int
    ast: int
    stl: int
    blk: int
    tov: int
    pf: int
    plus_minus: float
