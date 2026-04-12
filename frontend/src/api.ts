import { Team, GameResult, ScheduleGame, PredictRequest, PredictResponse } from './types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`)
  return res.json()
}

export const fetchTeams = (): Promise<Team[]> =>
  get('/teams')

export const fetchGames = (startDate: string, endDate?: string): Promise<GameResult[]> =>
  get(`/games?start_date=${startDate}${endDate ? `&end_date=${endDate}` : ''}`)

export const fetchSchedule = (date: string): Promise<ScheduleGame[]> =>
  get(`/schedule/${date}`)

export const predictGame = (req: PredictRequest): Promise<PredictResponse> =>
  post('/predict', req)
