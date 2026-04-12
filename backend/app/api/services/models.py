import pandas as pd
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report

from app.api.services.features import build_matchup_features

models = {
    "Logistic Regression": LogisticRegression(max_iter=1000),
    "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42),
    "Gradient Boosting": GradientBoostingClassifier(n_estimators=100, random_state=42)
}

def fit_evaluate_model(feature_set: pd.DataFrame, model: object, split_date: datetime | None = None, verbose: bool = True):
    split_date = split_date or datetime.today()

    drop_cols = [col for col in feature_set.columns if 
             "rolling" not in col and 
             "home_games_played" not in col and 
             "away_games_played" not in col and 
             "rest" not in col]

    X = feature_set.drop(columns = drop_cols)
    y = feature_set["home_wl"].astype(int)

    train_mask = feature_set['game_date'] < split_date
    X_train, y_train = X[train_mask], y[train_mask]
    X_test, y_test = X[~train_mask], y[~train_mask]

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    if verbose: 
        print(f"Model accuracy: {accuracy:.2f}")
        print("Confusion Matrix:")
        print(confusion_matrix(y_test, y_pred))
        print("Classification Report:")
        print(classification_report(y_test, y_pred))
    
    return model, X, y

def predict_game(home_team_abbr: str, 
                 away_team_abbr: str, 
                 game_date: datetime, 
                 teams_rolling_stats: pd.DataFrame, 
                 feature_set: pd.DataFrame,  
                 team_df: pd.DataFrame, 
                 model: object):
    
    home_team_id = team_df[team_df['abbreviation'] == home_team_abbr]['team_id'].values[0]
    away_team_id = team_df[team_df['abbreviation'] == away_team_abbr]['team_id'].values[0]

    feature_set = feature_set[feature_set['game_date'] < game_date]

    matchup_features = build_matchup_features(teams_rolling_stats, home_team_id, away_team_id, game_date)

    model, X, y = fit_evaluate_model(feature_set, model, game_date, verbose = False)

    matchup_features = matchup_features[X.columns]

    return model.predict_proba(matchup_features)[0][1]