import copy
from datetime import datetime

import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from app.api.services.features import build_matchup_features

regression_models = {
    "xgboost": XGBRegressor(
        n_estimators=500, learning_rate=0.05, max_depth=4, random_state=42
    ),
    "ridge": Pipeline([
        ("scaler", StandardScaler()),
        ("model", Ridge(alpha=1.0)),
    ]),
}


def fit_regression_model(
    feature_set: pd.DataFrame,
    home: bool,
    model: object,
    split_date: datetime,
) -> tuple[object, pd.DataFrame, pd.Series]:
    """Train regressor on all data before split_date. Returns (model, X, y)."""
    feature_set = feature_set.copy()
    feature_set['game_date'] = pd.to_datetime(feature_set['game_date'])

    keep_cols = [
        col for col in feature_set.columns
        if 'rolling' in col or 'games_played' in col or 'rest' in col
    ]
    X = feature_set[keep_cols].copy()

    # Drop leakage columns if they ended up in X
    for col in ['home_wl', 'home_pts_actual', 'away_pts_actual']:
        if col in X.columns:
            X = X.drop(columns=[col])

    y_col = 'home_pts_actual' if home else 'away_pts_actual'
    y = feature_set[y_col]

    train_mask = feature_set['game_date'] < pd.Timestamp(split_date)
    X_train = X[train_mask]
    y_train = y[train_mask]

    model.fit(X_train, y_train)
    return model, X_train, y_train


def _compute_residual_std(
    model: object,
    X: pd.DataFrame,
    y: pd.Series,
    holdout_n: int = 200,
) -> float:
    """Temporal holdout residual std. Holds out last min(holdout_n, len//5) rows."""
    n = min(holdout_n, max(1, len(X) // 5))
    X_tr, X_ho = X.iloc[:-n], X.iloc[-n:]
    y_tr, y_ho = y.iloc[:-n], y.iloc[-n:]
    m = copy.deepcopy(model)
    m.fit(X_tr, y_tr)
    residuals = y_ho.values - m.predict(X_ho)
    return float(np.std(residuals))


def predict_game_points(
    home_team_abbr: str,
    away_team_abbr: str,
    game_date: datetime,
    teams_rolling_stats: pd.DataFrame,
    feature_set: pd.DataFrame,
    team_df: pd.DataFrame,
    model: object,
) -> tuple[float, float, float, float]:
    """
    Returns (home_pred, away_pred, home_resid_std, away_resid_std).
    Fits separate models for home and away point targets.
    """
    home_team_id = team_df[team_df['abbreviation'] == home_team_abbr]['team_id'].values[0]
    away_team_id = team_df[team_df['abbreviation'] == away_team_abbr]['team_id'].values[0]

    filtered_fs = feature_set[
        pd.to_datetime(feature_set['game_date']) < pd.Timestamp(game_date)
    ].copy()

    matchup_features = build_matchup_features(
        teams_rolling_stats, home_team_id, away_team_id, game_date
    )

    model_home, X_home, y_home = fit_regression_model(
        filtered_fs, home=True, model=copy.deepcopy(model), split_date=game_date
    )
    model_away, X_away, y_away = fit_regression_model(
        filtered_fs, home=False, model=copy.deepcopy(model), split_date=game_date
    )

    home_resid_std = _compute_residual_std(model, X_home, y_home)
    away_resid_std = _compute_residual_std(model, X_away, y_away)

    home_pred = float(model_home.predict(matchup_features[X_home.columns])[0])
    away_pred = float(model_away.predict(matchup_features[X_away.columns])[0])

    return home_pred, away_pred, home_resid_std, away_resid_std


def monte_carlo_win_prob(
    home_pred: float,
    away_pred: float,
    home_resid_std: float,
    away_resid_std: float,
) -> float:
    """
    Closed-form P(home wins) = P(home_score - away_score > 0).
    Assumes independence: spread ~ Normal(home_pred - away_pred, sqrt(h²+a²)).
    """
    spread = home_pred - away_pred
    total_std = float(np.sqrt(home_resid_std ** 2 + away_resid_std ** 2))
    return float(1 - norm.cdf(0, loc=spread, scale=total_std))
