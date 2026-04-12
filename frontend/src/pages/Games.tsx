import { useState } from 'react'
import { fetchGames } from '../api'
import { GameResult } from '../types'

type View = 'all' | 'home' | 'away'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function pm(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

function filterGames(games: GameResult[], view: View): GameResult[] {
  if (view === 'home') return games.filter(g => g.matchup.includes(' vs. '))
  if (view === 'away') return games.filter(g => g.matchup.includes(' @ '))
  // 'all': group by game_id so home row is immediately followed by away row
  const order: GameResult[] = []
  const seen = new Set<string>()
  for (const g of games) {
    if (seen.has(g.game_id)) continue
    seen.add(g.game_id)
    const home = games.find(r => r.game_id === g.game_id && r.matchup.includes(' vs. '))
    const away = games.find(r => r.game_id === g.game_id && r.matchup.includes(' @ '))
    if (home) order.push(home)
    if (away) order.push(away)
  }
  return order
}

export default function Games() {
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(todayStr())
  const [games,    setGames]    = useState<GameResult[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [view,     setView]     = useState<View>('all')

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

  const visible = filterGames(games, view)

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

        {/* View toggle — only shown after results load */}
        {searched && !error && games.length > 0 && (
          <div className="control-group" style={{ alignSelf: 'flex-end' }}>
            <label>View</label>
            <div className="toggle-group">
              {(['home', 'away', 'all'] as View[]).map(v => (
                <button
                  key={v}
                  className={`toggle-btn${view === v ? ' active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <div className="error-msg">{error}</div>}

      {!loading && searched && !error && (
        visible.length === 0 ? (
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
                {visible.map((g, i) => {
                  // In 'all' view: even index = home (group-start), odd = away (group-end)
                  const isGroupStart = view === 'all' && i % 2 === 0
                  const isGroupEnd   = view === 'all' && i % 2 === 1
                  const rowClass = [
                    isGroupStart ? 'group-start' : '',
                    isGroupEnd   ? 'group-end'   : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <tr key={`${g.game_id}-${i}`} className={rowClass}>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
