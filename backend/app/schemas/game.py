from sqlalchemy import Integer, String, Date, Float, Boolean
from sqlalchemy.orm import mapped_column, Mapped

from datetime import date

from app.schemas.base import Base

class GameOverview(Base):
    __tablename__ = "game_overview_data"
    
    season_id: Mapped[int] = mapped_column(Integer, primary_key = True)
    team_id: Mapped[int] = mapped_column(Integer, primary_key = True)
    team_abbreviation: Mapped[str] = mapped_column(String)
    team_name: Mapped[str] = mapped_column(String)
    game_id: Mapped[int] = mapped_column(Integer, primary_key = True)
    game_date: Mapped[date] = mapped_column(Date)
    matchup: Mapped[str] = mapped_column(String)
    wl: Mapped[bool] = mapped_column(Boolean)
    min: Mapped[int] = mapped_column(Integer)
    pts: Mapped[int] = mapped_column(Integer)
    fgm: Mapped[int] = mapped_column(Integer)
    fga: Mapped[int] = mapped_column(Integer)
    fg_pct: Mapped[float] = mapped_column(Float)
    fg3m: Mapped[int] = mapped_column(Integer)
    fg3a: Mapped[int] = mapped_column(Integer)
    fg3_pct: Mapped[float] = mapped_column(Float)
    ftm: Mapped[int] = mapped_column(Integer)
    fta: Mapped[int] = mapped_column(Integer)
    ft_pct: Mapped[float] = mapped_column(Float)
    oreb: Mapped[int] = mapped_column(Integer)
    dreb: Mapped[int] = mapped_column(Integer)
    reb: Mapped[int] = mapped_column(Integer)
    ast: Mapped[int] = mapped_column(Integer)
    stl: Mapped[int] = mapped_column(Integer)
    blk: Mapped[int] = mapped_column(Integer)
    tov: Mapped[int] = mapped_column(Integer)
    pf: Mapped[int] = mapped_column(Integer)
    plus_minus: Mapped[float] = mapped_column(Float)
    pull_date: Mapped[date] = mapped_column(Date)
