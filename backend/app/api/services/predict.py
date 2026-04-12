from app.api.models.predict import PredictRequest, PredictResponse

def predict_outcome(request: PredictRequest) -> PredictResponse:
    # Placeholder for prediction logic
    # In a real implementation, this would load the specified model, preprocess the input data, and return a prediction
    return PredictResponse(home_team_win_prob=0.65, away_team_win_prob=0.35)