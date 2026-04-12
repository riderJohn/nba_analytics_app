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

export interface PredictionHistoryEntry {
  id: number
  ran_at: Date
  home_team_abbr: string
  away_team_abbr: string
  game_date: string
  model_name: string
  home_win_prob: number
  away_win_prob: number
}

export type Theme = 'dark' | 'nba' | 'retro'
