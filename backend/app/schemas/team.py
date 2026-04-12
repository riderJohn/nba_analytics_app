from sqlalchemy import Integer, String, Date
from sqlalchemy.orm import mapped_column, Mapped

from datetime import date

from app.schemas.base import Base

class Team(Base):
    __tablename__ = "team_data"
    
    team_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String)
    abbreviation: Mapped[str] = mapped_column(String)
    nickname: Mapped[str] = mapped_column(String)
    city: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String)
    year_founded: Mapped[int] = mapped_column(Integer)
    pull_date: Mapped[date] = mapped_column(Date)