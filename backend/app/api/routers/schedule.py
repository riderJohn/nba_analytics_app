from fastapi import APIRouter

from app.api.models.schedule import ScheduleResponse
from app.api.services.schedule import get_schedule

router = APIRouter(prefix="/api", tags=["schedule"])

@router.get("/schedule/{date}", response_model=list[ScheduleResponse])
def get_schedule_endpoint(date: str):
    """Endpoint to get the schedule for a given date. Format: YYYY-MM-DD"""
    return get_schedule(date)