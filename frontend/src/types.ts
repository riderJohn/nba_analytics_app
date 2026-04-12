export interface Team {
  team_id: number
  full_name: string
  abbreviation: string
  nickname: string
  city: string
  state: string
  year_founded: number
}

export interface GameResult {
  season_id: number
  team_id: number
  game_id: string
  game_date: string
  matchup: string
  wl: boolean
  minutes: number
  pts: number
  fgm: number
  fga: number
  fg_pct: number
  fg3m: number
  fg3a: number
  fg3_pct: number
  ftm: number
  fta: number
  ft_pct: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
  plus_minus: number
  pull_date: string
}

export interface ScheduleGame {
  game_id: string
  game_date_est: string
  home_team_id: number
  visitor_team_id: number
}

export interface PredictRequest {
  home_team_abbr: string
  away_team_abbr: string
  game_date: string
  model_name: string
}

export interface PredictResponse {
  home_team_win_prob: number
  away_team_win_prob: number
}

// ── Full prediction ──────────────────────────────────────────────────────────

export interface FullPredictRequest {
  home_team_abbr: string
  away_team_abbr: string
  game_date: string
  speed_mode?: boolean
}

export interface WinProbability {
  classifier_prob: number
  regression_prob: number
  ensemble_prob: number
}

export interface PointPrediction {
  home_pts: number
  away_pts: number
  home_resid_std: number
  away_resid_std: number
  spread: number
  total: number
}

export interface FullPredictResponse {
  home_team_abbr: string
  away_team_abbr: string
  game_date: string
  predicted_winner: 'home' | 'away'
  winner_confidence: number
  win_probability: WinProbability
  points: PointPrediction
  regression_model_used: string
  classifier_model_used: string
  trained_before: string
}

// ── Parlay calculator ────────────────────────────────────────────────────────

export interface ParlayRequest {
  home_team_abbr: string
  away_team_abbr: string
  home_pts: number
  away_pts: number
  home_resid_std: number
  away_resid_std: number
  home_win_prob?: number
  away_win_prob?: number
  home_points_line: number | null
  away_points_line: number | null
  total_line: number | null
  spread_line: number | null
}

export interface ParlayLeg {
  label: string
  prob_over: number
  prob_under: number
}

export interface ParlayResponse {
  legs: ParlayLeg[]
  combined_prob: number
}

// ── History ──────────────────────────────────────────────────────────────────

export interface PredictionHistoryEntry {
  id: number
  ran_at: Date
  home_team_abbr: string
  away_team_abbr: string
  game_date: string
  home_win_prob: number
  away_win_prob: number
  home_pts: number
  away_pts: number
  spread: number
  total: number
}

export type Theme = 'dark' | 'nba' | 'retro'
