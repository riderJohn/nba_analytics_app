import { useState } from 'react'
import { fetchGames } from '../api'
import { GameResult } from '../types'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function pm(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

export default function Games() {
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [games,   setGames]   = useState<GameResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await fetchGames(startDate, endDate)
      setGames(data)
    } catch {
      setError('Failed to load games. Make sure the API is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Game Results</h1>
        <p>Historical game logs by date range</p>
      </div>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="start-date">Start Date</label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="control-group">
          <label htmlFor="end-date">End Date</label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={load}
          disabled={loading}
          style={{ alignSelf: 'flex-end' }}
        >
          {loading ? 'Loading...' : 'Search'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {!loading && searched && !error && (
        games.length === 0 ? (
          <div className="status-msg">No games found for this date range.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Matchup</th>
                  <th>W/L</th>
                  <th>PTS</th>
                  <th>FG%</th>
                  <th>3P%</th>
                  <th>FT%</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>STL</th>
                  <th>BLK</th>
                  <th>TOV</th>
                  <th>+/-</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g, i) => (
                  <tr key={`${g.game_id}-${i}`}>
                    <td style={{ opacity: 0.7, fontSize: '0.8rem' }}>{g.game_date}</td>
                    <td style={{ fontWeight: 500 }}>{g.matchup}</td>
                    <td className={g.wl ? 'win' : 'loss'}>{g.wl ? 'W' : 'L'}</td>
                    <td style={{ fontWeight: 600 }}>{g.pts}</td>
                    <td>{pct(g.fg_pct)}</td>
                    <td>{pct(g.fg3_pct)}</td>
                    <td>{pct(g.ft_pct)}</td>
                    <td>{g.reb}</td>
                    <td>{g.ast}</td>
                    <td>{g.stl}</td>
                    <td>{g.blk}</td>
                    <td>{g.tov}</td>
                    <td className={g.plus_minus >= 0 ? 'win' : 'loss'}>{pm(g.plus_minus)}</td>
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
