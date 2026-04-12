import copy
import math
import pandas as pd
from datetime import datetime
from scipy.stats import norm
from sqlalchemy.orm import Session

from app.api.models.predict import (
    PredictRequest, PredictResponse,
    FullPredictRequest, FullPredictResponse, WinProbability, PointPrediction,
    ParlayRequest, ParlayLeg, ParlayResponse,
)
from app.api.services.features import get_team_rolling_stats, build_feature_set
from app.api.services.models import classification_models, predict_game
from app.api.services.regression import regression_models, predict_game_points, monte_carlo_win_prob
from app.schemas.game import GameOverview
from app.schemas.team import Team


def _orm_to_df(rows: list) -> pd.DataFrame:
    return pd.DataFrame([
        {k: v for k, v in vars(row).items() if not k.startswith('_')}
        for row in rows
    ])


def predict_outcome(request: PredictRequest, db: Session) -> PredictResponse:
    # Convert date → datetime for comparisons inside the ML pipeline
    game_date = datetime.combine(request.game_date, datetime.min.time())

    if request.model_name not in classification_models:
        raise ValueError(
            f"Unknown model '{request.model_name}'. "
            f"Valid options: {list(classification_models.keys())}"
        )

    # Fresh model copy so concurrent requests don't share fitted state
    model = copy.deepcopy(classification_models[request.model_name])

    # Load all data from DB
    game_df = _orm_to_df(db.query(GameOverview).all())
    team_df = _orm_to_df(db.query(Team).all())

    if game_df.empty or team_df.empty:
        raise ValueError("No data in database. Run data ingestion first.")

    game_df['game_date'] = pd.to_datetime(game_df['game_date'])

    # Build rolling stats for every team
    all_rolling = []
    for team_id in team_df['team_id'].unique():
        stats = get_team_rolling_stats(game_df, int(team_id), game_date)
        if not stats.empty:
            all_rolling.append(stats)

    if not all_rolling:
        raise ValueError("Not enough historical data to compute rolling stats.")

    teams_rolling_stats = pd.concat(all_rolling, ignore_index=True)

    feature_set = build_feature_set(teams_rolling_stats, game_df, team_df)

    if feature_set.empty:
        raise ValueError("Feature set is empty — not enough historical matchups.")

    home_win_prob = predict_game(
        home_team_abbr=request.home_team_abbr,
        away_team_abbr=request.away_team_abbr,
        game_date=game_date,
        teams_rolling_stats=teams_rolling_stats,
        feature_set=feature_set,
        team_df=team_df,
        model=model,
    )

    return PredictResponse(
        home_team_win_prob=round(float(home_win_prob), 4),
        away_team_win_prob=round(float(1 - home_win_prob), 4),
    )


def _load_data(db: Session) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Shared data loading + rolling stats build used by predict_full."""
    game_df = _orm_to_df(db.query(GameOverview).all())
    team_df = _orm_to_df(db.query(Team).all())

    if game_df.empty or team_df.empty:
        raise ValueError("No data in database. Run data ingestion first.")

    game_df['game_date'] = pd.to_datetime(game_df['game_date'])

    all_rolling = []
    for team_id in team_df['team_id'].unique():
        stats = get_team_rolling_stats(game_df, int(team_id))
        if not stats.empty:
            all_rolling.append(stats)

    if not all_rolling:
        raise ValueError("Not enough historical data to compute rolling stats.")

    teams_rolling_stats = pd.concat(all_rolling, ignore_index=True)
    feature_set = build_feature_set(teams_rolling_stats, game_df, team_df)

    if feature_set.empty:
        raise ValueError("Feature set is empty — not enough historical matchups.")

    return teams_rolling_stats, feature_set, team_df


def predict_full(request: FullPredictRequest, db: Session) -> FullPredictResponse:
    game_date = datetime.combine(request.game_date, datetime.min.time())

    reg_key = "ridge" if request.speed_mode else "xgboost"
    clf_key = "logistic" if request.speed_mode else "xgboost"

    reg_model = copy.deepcopy(regression_models[reg_key])
    clf_model = copy.deepcopy(classification_models[clf_key])

    teams_rolling_stats, feature_set, team_df = _load_data(db)

    # Regression: predicted scores + residual stds
    home_pts, away_pts, home_std, away_std = predict_game_points(
        home_team_abbr=request.home_team_abbr,
        away_team_abbr=request.away_team_abbr,
        game_date=game_date,
        teams_rolling_stats=teams_rolling_stats,
        feature_set=feature_set,
        team_df=team_df,
        model=reg_model,
    )

    # Classification: win probability
    classifier_prob = float(predict_game(
        home_team_abbr=request.home_team_abbr,
        away_team_abbr=request.away_team_abbr,
        game_date=game_date,
        teams_rolling_stats=teams_rolling_stats,
        feature_set=feature_set,
        team_df=team_df,
        model=clf_model,
    ))

    regression_prob = monte_carlo_win_prob(home_pts, away_pts, home_std, away_std)
    ensemble_prob = (classifier_prob + regression_prob) / 2

    predicted_winner = "home" if ensemble_prob >= 0.5 else "away"
    winner_confidence = ensemble_prob if ensemble_prob >= 0.5 else 1 - ensemble_prob

    reg_labels = {"xgboost": "XGBoost Regressor", "ridge": "Ridge Regression"}
    clf_labels = {"xgboost": "XGBoost Classifier", "logistic": "Logistic Regression"}

    return FullPredictResponse(
        home_team_abbr=request.home_team_abbr,
        away_team_abbr=request.away_team_abbr,
        game_date=str(request.game_date),
        predicted_winner=predicted_winner,
        winner_confidence=round(winner_confidence, 4),
        win_probability=WinProbability(
            classifier_prob=round(classifier_prob, 4),
            regression_prob=round(regression_prob, 4),
            ensemble_prob=round(ensemble_prob, 4),
        ),
        points=PointPrediction(
            home_pts=round(home_pts, 1),
            away_pts=round(away_pts, 1),
            home_resid_std=round(home_std, 2),
            away_resid_std=round(away_std, 2),
            spread=round(home_pts - away_pts, 1),
            total=round(home_pts + away_pts, 1),
        ),
        regression_model_used=reg_labels[reg_key],
        classifier_model_used=clf_labels[clf_key],
        trained_before=str(request.game_date),
    )


def predict_parlay(request: ParlayRequest) -> ParlayResponse:
    total_std = math.sqrt(request.home_resid_std ** 2 + request.away_resid_std ** 2)
    spread = request.home_pts - request.away_pts
    total = request.home_pts + request.away_pts

    legs: list[ParlayLeg] = []

    if request.home_win_prob is not None:
        p = request.home_win_prob
        legs.append(ParlayLeg(
            label=f"{request.home_team_abbr} Wins",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    if request.away_win_prob is not None:
        p = request.away_win_prob
        legs.append(ParlayLeg(
            label=f"{request.away_team_abbr} Wins",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    if request.home_points_line is not None:
        p = float(1 - norm.cdf(request.home_points_line, loc=request.home_pts, scale=request.home_resid_std))
        legs.append(ParlayLeg(
            label=f"Home Over {request.home_points_line}",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    if request.away_points_line is not None:
        p = float(1 - norm.cdf(request.away_points_line, loc=request.away_pts, scale=request.away_resid_std))
        legs.append(ParlayLeg(
            label=f"Away Over {request.away_points_line}",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    if request.total_line is not None:
        p = float(1 - norm.cdf(request.total_line, loc=total, scale=total_std))
        legs.append(ParlayLeg(
            label=f"Total Over {request.total_line}",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    if request.spread_line is not None:
        p = float(1 - norm.cdf(request.spread_line, loc=spread, scale=total_std))
        legs.append(ParlayLeg(
            label=f"Home Covers {request.spread_line:+.1f}",
            prob_over=round(p, 4),
            prob_under=round(1 - p, 4),
        ))

    combined = 1.0
    for leg in legs:
        combined *= leg.prob_over

    return ParlayResponse(legs=legs, combined_prob=round(combined, 4))
