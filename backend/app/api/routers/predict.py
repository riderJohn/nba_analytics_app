from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.models.predict import (
    PredictRequest, PredictResponse,
    FullPredictRequest, FullPredictResponse,
    ParlayRequest, ParlayResponse,
)
from app.api.services.predict import predict_outcome, predict_full, predict_parlay
from app.db.database import get_db

router = APIRouter(prefix="/api", tags=["predict"])


@router.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest, db: Session = Depends(get_db)):
    try:
        return predict_outcome(request, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/predict/full", response_model=FullPredictResponse)
def predict_full_endpoint(request: FullPredictRequest, db: Session = Depends(get_db)):
    try:
        return predict_full(request, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/predict/parlay", response_model=ParlayResponse)
def predict_parlay_endpoint(request: ParlayRequest):
    try:
        return predict_parlay(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
