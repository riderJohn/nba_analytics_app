import { useState, useEffect, useRef } from 'react'
import { fetchTeams, predictGame } from '../api'
import { Team, PredictResponse, PredictionHistoryEntry } from '../types'

const MODELS = ['Logistic Regression', 'Random Forest', 'Gradient Boosting']

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Predict() {
  const [teams,     setTeams]     = useState<Team[]>([])
  const [homeAbbr,  setHomeAbbr]  = useState('')
  const [awayAbbr,  setAwayAbbr]  = useState('')
  const [gameDate,  setGameDate]  = useState(todayStr())
  const [modelName, setModelName] = useState(MODELS[2])
  const [result,    setResult]    = useState<PredictResponse | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [history,   setHistory]   = useState<PredictionHistoryEntry[]>([])
  const nextId = useRef(1)

  useEffect(() => {
    fetchTeams()
      .then((data: Team[]) => {
        const sorted = [...data].sort((a, b) =>
          a.abbreviation.localeCompare(b.abbreviation)
        )
        setTeams(sorted)
        if (sorted.length >= 2) {
          setHomeAbbr(sorted[0].abbreviation)
          setAwayAbbr(sorted[1].abbreviation)
        }
      })
      .catch(() => setError('Failed to load teams.'))
  }, [])

  const submit = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await predictGame({
        home_team_abbr: homeAbbr,
        away_team_abbr: awayAbbr,
        game_date: gameDate,
        model_name: modelName,
      })
      setResult(data)
      setHistory(prev => [
        {
          id: nextId.current++,
          ran_at: new Date(),
          home_team_abbr: homeAbbr,
          away_team_abbr: awayAbbr,
          game_date: gameDate,
          model_name: modelName,
          home_win_prob: data.home_team_win_prob,
          away_win_prob: data.away_team_win_prob,
        },
        ...prev,
      ])
    } catch {
      setError('Prediction failed. Check that the API and model data are ready.')
    } finally {
      setLoading(false)
    }
  }

  const homePct = result ? (result.home_team_win_prob * 100).toFixed(1) : null
  const awayPct = result ? (result.away_team_win_prob * 100).toFixed(1) : null
  const homeTeamFull = teams.find(t => t.abbreviation === homeAbbr)?.full_name ?? homeAbbr
  const awayTeamFull = teams.find(t => t.abbreviation === awayAbbr)?.full_name ?? awayAbbr

  return (
    <div>
      <div className="page-header">
        <h1>Predict</h1>
        <p>Get win probability for a matchup using historical rolling stats</p>
      </div>

      <div className="predict-top">
        {/* ── Form ── */}
        <div>
          <div className="predict-form-label">Matchup Setup</div>
          <div className="form-grid">
            <div className="select-row">
              <div className="control-group">
                <label htmlFor="home-team">Home Team</label>
                <select
                  id="home-team"
                  value={homeAbbr}
                  onChange={e => setHomeAbbr(e.target.value)}
                >
                  {teams.map(t => (
                    <option key={t.team_id} value={t.abbreviation}>
                      {t.abbreviation} – {t.nickname}
                    </option>
                  ))}
                </select>
              </div>
              <div className="control-group">
                <label htmlFor="away-team">Away Team</label>
                <select
                  id="away-team"
                  value={awayAbbr}
                  onChange={e => setAwayAbbr(e.target.value)}
                >
                  {teams.map(t => (
                    <option key={t.team_id} value={t.abbreviation}>
                      {t.abbreviation} – {t.nickname}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="control-group">
              <label htmlFor="game-date">Game Date</label>
              <input
                id="game-date"
                type="date"
                value={gameDate}
                onChange={e => setGameDate(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div className="control-group">
              <label htmlFor="model-select">Model</label>
              <select
                id="model-select"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
              >
                {MODELS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={submit}
            disabled={loading || !homeAbbr || !awayAbbr}
          >
            {loading ? 'Running...' : 'Run Prediction'}
          </button>
          {error && (
            <div className="error-msg" style={{ padding: '1rem 0 0', textAlign: 'left' }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Result ── */}
        <div>
          {result && homePct && awayPct ? (
            <>
              <div className="result-eyebrow">Result</div>
              <div className="result-matchup">
                <strong>{homeAbbr}</strong> (Home) vs <strong>{awayAbbr}</strong> (Away)
                &nbsp;·&nbsp; {gameDate} &nbsp;·&nbsp; {modelName}
              </div>

              <div className="prob-block">
                <div className="prob-row">
                  <span className="prob-team">{homeTeamFull} (Home)</span>
                  <span className={`prob-pct ${parseFloat(homePct) >= 50 ? 'high' : 'low'}`}>
                    {homePct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${homePct}%` }} />
                </div>
              </div>

              <div className="prob-block">
                <div className="prob-row">
                  <span className="prob-team">{awayTeamFull} (Away)</span>
                  <span className={`prob-pct ${parseFloat(awayPct) >= 50 ? 'high' : 'low'}`}>
                    {awayPct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill bar-fill-secondary" style={{ width: `${awayPct}%` }} />
                </div>
              </div>

              <div className="model-badge">
                {modelName} · trained on data before {gameDate}
              </div>
            </>
          ) : (
            !loading && (
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem', paddingTop: '1.5rem' }}>
                Set up a matchup and click <strong style={{ color: 'var(--text)' }}>Run Prediction</strong> to see win probabilities here.
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Prediction History ── */}
      <div className="section-divider" />

      <div className="history-header">
        <div className="history-title">Previous Predictions</div>
        <div className="history-count">
          {history.length} {history.length === 1 ? 'run' : 'runs'} this session
        </div>
      </div>

      {history.length === 0 ? (
        <div className="status-msg">No predictions run yet this session.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run At</th>
                <th>Home</th>
                <th>Away</th>
                <th>Game Date</th>
                <th>Model</th>
                <th>Home Win%</th>
                <th>Away Win%</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td className="outcome-pending">{formatTime(h.ran_at)}</td>
                  <td><span className="tag tag-home">{h.home_team_abbr}</span></td>
                  <td><span className="tag tag-away">{h.away_team_abbr}</span></td>
                  <td style={{ opacity: 0.7, fontSize: '0.82rem' }}>{h.game_date}</td>
                  <td style={{ opacity: 0.65, fontSize: '0.8rem' }}>{h.model_name}</td>
                  <td className={h.home_win_prob >= 0.5 ? 'win' : 'loss'}>
                    {(h.home_win_prob * 100).toFixed(1)}%
                  </td>
                  <td className={h.away_win_prob >= 0.5 ? 'win' : 'loss'}>
                    {(h.away_win_prob * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
