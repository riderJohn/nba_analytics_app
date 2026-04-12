import { useState, useEffect, useCallback } from 'react'
import { fetchSchedule, fetchTeams } from '../api'
import { ScheduleGame, Team } from '../types'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function Schedule() {
  const [date, setDate] = useState(todayStr())
  const [games, setGames] = useState<ScheduleGame[]>([])
  const [teamMap, setTeamMap] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load team abbreviation map once
  useEffect(() => {
    fetchTeams()
      .then((teams: Team[]) =>
        setTeamMap(new Map(teams.map(t => [t.team_id, t.abbreviation])))
      )
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSchedule(date)
      setGames(data)
    } catch {
      setError('Failed to load schedule. Make sure the API is running.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const teamName = (id: number) => teamMap.get(id) ?? String(id)

  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
        <p>Games scheduled for a given date</p>
      </div>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="sched-date">Date</label>
          <input
            id="sched-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      {loading && <div className="status-msg">Loading...</div>}
      {error   && <div className="error-msg">{error}</div>}

      {!loading && !error && (
        games.length === 0 ? (
          <div className="status-msg">No games scheduled for {date}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Game ID</th>
                  <th>Date (EST)</th>
                  <th>Home</th>
                  <th>Away</th>
                </tr>
              </thead>
              <tbody>
                {games.map(g => (
                  <tr key={g.game_id}>
                    <td style={{ fontFamily: 'monospace', opacity: 0.55, fontSize: '0.78rem' }}>
                      {g.game_id}
                    </td>
                    <td style={{ opacity: 0.7, fontSize: '0.82rem' }}>
                      {g.game_date_est}
                    </td>
                    <td><span className="tag tag-home">{teamName(g.home_team_id)}</span></td>
                    <td><span className="tag tag-away">{teamName(g.visitor_team_id)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
