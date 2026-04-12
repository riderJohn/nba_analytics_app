from fastapi import APIRouter, Depends

from app.api.models.predict import PredictRequest, PredictResponse
from app.api.services.predict import predict_outcome

router = APIRouter(prefix="/api", tags=["predict"])

@router.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest):
    """Endpoint to predict the outcome of a game based on the provided request data."""
    return predict_outcome(request)