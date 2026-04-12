from datetime import datetime
import pandas as pd

def get_team_rolling_stats(game_df: pd.DataFrame, team_id: int, as_of_date: datetime | None = None) -> pd.DataFrame:
    as_of_date = as_of_date or datetime.today()

    team_games = game_df[(game_df['team_id'] == team_id) & (game_df['game_date'] < as_of_date)].copy()

    rolling_cols = ['pts', 'dreb', 'fg_pct', 'fg3_pct', 'ft_pct', 'ast', 'reb', 'stl', 'blk', 'tov', 'pf', 'wl', 'plus_minus']

    team_games = team_games.sort_values(['team_id', 'game_date'])
    team_games['wl'] = team_games['wl'].astype(int)

    windows = [3, 5, 7, 10]

    for window in windows:
        for col in rolling_cols:
            team_games[f'{window}_game_rolling_{col}'] = (
                team_games.groupby(['team_id', 'season_id'])[col]
                .transform(lambda x: x.rolling(window, min_periods=1).mean()))

    team_games['games_played'] = team_games.groupby(['team_id', 'season_id']).cumcount() + 1

    return team_games

def build_feature_set(teams_rolling_stats, game_df, team_df):
    training_rows = []

    team_ids = team_df[['team_id', 'abbreviation']].drop_duplicates()

    for game_id in game_df['game_id'].unique():
        game = game_df[
            (game_df['game_id'] == game_id) & 
            (game_df['matchup'].str.contains("vs"))
        ].copy()
        if len(game) == 0:
            continue

        game_date = game['game_date'].values[0]

        home_team_abbr = game['matchup'].values[0].split(" ")[0]
        away_team_abbr = game['matchup'].values[0].split(" ")[2]
        home_team_id = team_ids[team_ids['abbreviation'] == home_team_abbr]['team_id'].values[0]
        away_team_id = team_ids[team_ids['abbreviation'] == away_team_abbr]['team_id'].values[0]
        home_wl = game['wl'].values[0]

        home_prior = teams_rolling_stats[
            (teams_rolling_stats['team_id'] == home_team_id) & 
            (teams_rolling_stats['game_date'] < game_date)
        ].sort_values('game_date')
        away_prior = teams_rolling_stats[
            (teams_rolling_stats['team_id'] == away_team_id) & 
            (teams_rolling_stats['game_date'] < game_date)
        ].sort_values('game_date')

        if len(home_prior) == 0 or len(away_prior) == 0:
            continue  # skip if no prior games exist for either team

        home_stats = home_prior.iloc[-1].drop(labels=['wl', 'game_id', 'game_date', 'matchup', 'team_id', 'team_abbreviation', 'team_name', 'pull_date'])
        away_stats = away_prior.iloc[-1].drop(labels=['wl', 'game_id', 'game_date', 'matchup', 'team_id', 'team_abbreviation', 'team_name', 'pull_date'])

        home_last_game_date = home_prior.iloc[-1]['game_date']
        away_last_game_date = away_prior.iloc[-1]['game_date']

        home_rest = (pd.Timestamp(game_date) - pd.Timestamp(home_last_game_date)).days
        away_rest = (pd.Timestamp(game_date) - pd.Timestamp(away_last_game_date)).days

        row = {
            'game_id': game_id,
            'game_date': game_date,
            'home_wl': home_wl, 
            'home_rest_days': home_rest, 
            'away_rest_days': away_rest,
            **{f'home_{k}': v for k, v in home_stats.items()},
            **{f'away_{k}': v for k, v in away_stats.items()},
        }

        training_rows.append(row)

    return pd.DataFrame(training_rows)

def build_matchup_features(rolling_stats: pd.DataFrame, home_id: int, away_id: int, matchup_date: datetime | None = None) -> pd.DataFrame:
    matchup_date = matchup_date or datetime.today()

    home_prior = rolling_stats[(rolling_stats['team_id'] == home_id) & (rolling_stats['game_date'] < matchup_date)].sort_values('game_date')
    away_prior = rolling_stats[(rolling_stats['team_id'] == away_id) & (rolling_stats['game_date'] < matchup_date)].sort_values('game_date')

    if len(home_prior) == 0 or len(away_prior) == 0:
        raise ValueError(f"No prior game data found for one or both teams before {matchup_date}")

    home_stats = home_prior.iloc[-1].drop(labels=['wl', 'game_id', 'game_date', 'matchup', 'team_id', 'team_abbreviation', 'team_name', 'pull_date'])
    away_stats = away_prior.iloc[-1].drop(labels=['wl', 'game_id', 'game_date', 'matchup', 'team_id', 'team_abbreviation', 'team_name', 'pull_date'])

    home_last_game_date = home_prior.iloc[-1]['game_date']
    away_last_game_date = away_prior.iloc[-1]['game_date']

    home_rest = (pd.Timestamp(matchup_date) - pd.Timestamp(home_last_game_date)).days
    away_rest = (pd.Timestamp(matchup_date) - pd.Timestamp(away_last_game_date)).days

    row = {
        'home_rest_days': home_rest, 
        'away_rest_days': away_rest,
        **{f'home_{k}': v for k, v in home_stats.items()},
        **{f'away_{k}': v for k, v in away_stats.items()},
    }

    return pd.DataFrame(row, index=[0])
