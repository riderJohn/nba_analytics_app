import { useState, useEffect, useRef } from 'react'
import { fetchTeams, predictFull, predictParlay } from '../api'
import {
  Team, FullPredictResponse, PredictionHistoryEntry,
  ParlayRequest, ParlayResponse,
} from '../types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function pts(v: number): string {
  return v.toFixed(1)
}

const Z90 = 1.645

export default function Predict() {
  const [teams,      setTeams]      = useState<Team[]>([])
  const [homeAbbr,   setHomeAbbr]   = useState('')
  const [awayAbbr,   setAwayAbbr]   = useState('')
  const [gameDate,   setGameDate]   = useState(todayStr())
  const [speedMode,  setSpeedMode]  = useState(false)
  const [showAdv,    setShowAdv]    = useState(false)

  const [result,     setResult]     = useState<FullPredictResponse | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // CI toggle
  const [showCI,     setShowCI]     = useState(false)

  // Parlay
  const [parlayOpen,      setParlayOpen]      = useState(false)
  const [homeWinLeg,      setHomeWinLeg]      = useState(false)
  const [awayWinLeg,      setAwayWinLeg]      = useState(false)
  const [homePtsLine,     setHomePtsLine]     = useState('')
  const [awayPtsLine,     setAwayPtsLine]     = useState('')
  const [totalLine,       setTotalLine]       = useState('')
  const [spreadLine,      setSpreadLine]      = useState('')
  const [parlayResult,    setParlayResult]    = useState<ParlayResponse | null>(null)
  const [parlayLoading,   setParlayLoading]   = useState(false)
  const [parlayError,     setParlayError]     = useState<string | null>(null)

  // Only one win leg at a time
  const toggleHomeWin = () => { setHomeWinLeg(v => !v); setAwayWinLeg(false) }
  const toggleAwayWin = () => { setAwayWinLeg(v => !v); setHomeWinLeg(false) }

  // History
  const [history, setHistory] = useState<PredictionHistoryEntry[]>([])
  const nextId = useRef(1)

  useEffect(() => {
    fetchTeams()
      .then((data: Team[]) => {
        const sorted = [...data].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
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
    setParlayResult(null)
    setShowCI(false)

    try {
      const data = await predictFull({
        home_team_abbr: homeAbbr,
        away_team_abbr: awayAbbr,
        game_date: gameDate,
        speed_mode: speedMode,
      })
      setResult(data)
      setHistory(prev => [{
        id: nextId.current++,
        ran_at: new Date(),
        home_team_abbr: data.home_team_abbr,
        away_team_abbr: data.away_team_abbr,
        game_date: data.game_date,
        home_win_prob: data.win_probability.ensemble_prob,
        away_win_prob: 1 - data.win_probability.ensemble_prob,
        home_pts: data.points.home_pts,
        away_pts: data.points.away_pts,
        spread: data.points.spread,
        total: data.points.total,
      }, ...prev])
    } catch {
      setError('Prediction failed. Check that the API and model data are ready.')
    } finally {
      setLoading(false)
    }
  }

  const runParlay = async () => {
    if (!result) return
    setParlayLoading(true)
    setParlayError(null)
    const req: ParlayRequest = {
      home_team_abbr: result.home_team_abbr,
      away_team_abbr: result.away_team_abbr,
      home_pts: result.points.home_pts,
      away_pts: result.points.away_pts,
      home_resid_std: result.points.home_resid_std,
      away_resid_std: result.points.away_resid_std,
      home_win_prob: homeWinLeg ? result.win_probability.ensemble_prob : undefined,
      away_win_prob: awayWinLeg ? (1 - result.win_probability.ensemble_prob) : undefined,
      home_points_line: homePtsLine !== '' ? parseFloat(homePtsLine) : null,
      away_points_line: awayPtsLine !== '' ? parseFloat(awayPtsLine) : null,
      total_line:       totalLine   !== '' ? parseFloat(totalLine)   : null,
      spread_line:      spreadLine  !== '' ? parseFloat(spreadLine)  : null,
    }
    try {
      setParlayResult(await predictParlay(req))
    } catch {
      setParlayError('Parlay calculation failed.')
    } finally {
      setParlayLoading(false)
    }
  }

  const homeWinPct  = result ? (result.win_probability.ensemble_prob * 100).toFixed(1)   : null
  const awayWinPct  = result ? ((1 - result.win_probability.ensemble_prob) * 100).toFixed(1) : null
  const homeIsWinner = result?.predicted_winner === 'home'

  // CI (90%) computed from residual std in response
  function ciStr(pred: number, std: number) {
    const margin = Z90 * std
    return `[${(pred - margin).toFixed(1)}, ${(pred + margin).toFixed(1)}]`
  }

  return (
    <div>
      <div className="page-header">
        <h1>Predict</h1>
        <p>Win probability, score prediction, and parlay probabilities for any matchup</p>
      </div>

      {/* ── Section 1: Input bar ── */}
      <div className="predict-input-bar">
        <div className="select-row">
          <div className="control-group">
            <label htmlFor="home-team">Home Team</label>
            <select id="home-team" value={homeAbbr} onChange={e => setHomeAbbr(e.target.value)}>
              {teams.map(t => (
                <option key={t.team_id} value={t.abbreviation}>
                  {t.abbreviation} – {t.nickname}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="away-team">Away Team</label>
            <select id="away-team" value={awayAbbr} onChange={e => setAwayAbbr(e.target.value)}>
              {teams.map(t => (
                <option key={t.team_id} value={t.abbreviation}>
                  {t.abbreviation} – {t.nickname}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="game-date">Game Date</label>
            <input
              id="game-date"
              type="date"
              value={gameDate}
              onChange={e => setGameDate(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={loading || !homeAbbr || !awayAbbr}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading ? 'Running…' : 'Run Prediction'}
          </button>
        </div>

        {/* Advanced toggle */}
        <div style={{ marginTop: '0.5rem' }}>
          <button className="adv-link" onClick={() => setShowAdv(v => !v)}>
            {showAdv ? '▾' : '▸'} Advanced
          </button>
          {showAdv && (
            <span style={{ marginLeft: '1rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Speed Mode:&nbsp;
              <span
                className={`toggle-btn${!speedMode ? ' active' : ''}`}
                style={{ cursor: 'pointer', padding: '0.2rem 0.6rem', borderRadius: '5px 0 0 5px', border: '1px solid var(--input-border)', fontSize: '0.78rem' }}
                onClick={() => setSpeedMode(false)}
              >
                Standard
              </span>
              <span
                className={`toggle-btn${speedMode ? ' active' : ''}`}
                style={{ cursor: 'pointer', padding: '0.2rem 0.6rem', borderRadius: '0 5px 5px 0', border: '1px solid var(--input-border)', borderLeft: 'none', fontSize: '0.78rem' }}
                onClick={() => setSpeedMode(true)}
              >
                Fast
              </span>
            </span>
          )}
        </div>
      </div>

      {error && <div className="error-msg" style={{ textAlign: 'left', padding: '0.75rem 0' }}>{error}</div>}

      {/* ── Section 2: Prediction card ── */}
      {result && homeWinPct && awayWinPct && (
        <div className="pred-card">
          {/* Card header */}
          <div className="pred-card-header">
            <span>
              <strong>{result.home_team_abbr}</strong> vs <strong>{result.away_team_abbr}</strong>
              &nbsp;·&nbsp;{result.game_date}
            </span>
            <span className={`pred-winner-badge ${homeIsWinner ? 'badge-home' : 'badge-away'}`}>
              {homeIsWinner ? result.home_team_abbr : result.away_team_abbr} favored&nbsp;
              <strong>{(result.winner_confidence * 100).toFixed(1)}%</strong>
            </span>
          </div>

          {/* Two-column body */}
          <div className="pred-card-body">
            {/* Left: win probability */}
            <div className="pred-col">
              <div className="pred-col-label">Win Probability</div>

              <div className="prob-block">
                <div className="prob-row">
                  <span className="prob-team">{result.home_team_abbr} (Home)</span>
                  <span className={`prob-pct ${parseFloat(homeWinPct) >= 50 ? 'high' : 'low'}`}>
                    {homeWinPct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${homeWinPct}%` }} />
                </div>
              </div>

              <div className="prob-block">
                <div className="prob-row">
                  <span className="prob-team">{result.away_team_abbr} (Away)</span>
                  <span className={`prob-pct ${parseFloat(awayWinPct) >= 50 ? 'high' : 'low'}`}>
                    {awayWinPct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill bar-fill-secondary" style={{ width: `${awayWinPct}%` }} />
                </div>
              </div>

              {/* Sub-rows: classifier vs regression */}
              <div className="prob-sub-rows">
                <div className="prob-sub-row">
                  <span>Classifier</span>
                  <span>{pct(result.win_probability.classifier_prob)}</span>
                </div>
                <div className="prob-sub-row">
                  <span>Score model</span>
                  <span>{pct(result.win_probability.regression_prob)}</span>
                </div>
              </div>
            </div>

            {/* Right: score prediction */}
            <div className="pred-col">
              <div className="pred-col-label">Score Prediction</div>

              <div className="score-boxes">
                <div className="score-box score-box-home">
                  <div className="score-box-abbr">{result.home_team_abbr}</div>
                  <div className="score-box-pts">{Math.round(result.points.home_pts)}</div>
                </div>
                <div className="score-box-sep">–</div>
                <div className="score-box score-box-away">
                  <div className="score-box-abbr">{result.away_team_abbr}</div>
                  <div className="score-box-pts">{Math.round(result.points.away_pts)}</div>
                </div>
              </div>

              <div className="score-meta">
                <span>
                  Spread:&nbsp;
                  <strong>{result.points.spread >= 0 ? result.home_team_abbr : result.away_team_abbr}&nbsp;
                    {result.points.spread >= 0 ? `−${pts(result.points.spread)}` : `+${pts(Math.abs(result.points.spread))}`}
                  </strong>
                </span>
                <span>Total: <strong>{pts(result.points.total)}</strong></span>
              </div>

              {/* CI toggle */}
              <button className="adv-link" style={{ marginTop: '0.6rem' }} onClick={() => setShowCI(v => !v)}>
                {showCI ? '▾' : '▸'} Show 90% CI
              </button>
              {showCI && (
                <div className="ci-block">
                  <div className="ci-row">
                    <span>{result.home_team_abbr} pts</span>
                    <span>{pts(result.points.home_pts)} {ciStr(result.points.home_pts, result.points.home_resid_std)}</span>
                  </div>
                  <div className="ci-row">
                    <span>{result.away_team_abbr} pts</span>
                    <span>{pts(result.points.away_pts)} {ciStr(result.points.away_pts, result.points.away_resid_std)}</span>
                  </div>
                  <div className="ci-row">
                    <span>Spread</span>
                    <span>{pts(result.points.spread)} {ciStr(result.points.spread, Math.sqrt(result.points.home_resid_std ** 2 + result.points.away_resid_std ** 2))}</span>
                  </div>
                  <div className="ci-row">
                    <span>Total</span>
                    <span>{pts(result.points.total)} {ciStr(result.points.total, Math.sqrt(result.points.home_resid_std ** 2 + result.points.away_resid_std ** 2))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Model badge */}
          <div className="model-badge">
            {result.regression_model_used} + {result.classifier_model_used}
            &nbsp;·&nbsp;trained on data before {result.trained_before}
          </div>
        </div>
      )}

      {/* ── Section 3: Parlay calculator ── */}
      {result && (
        <div className="parlay-panel">
          <button className="parlay-header" onClick={() => setParlayOpen(v => !v)}>
            <span>{parlayOpen ? '▾' : '▸'} Parlay Calculator</span>
            <span className="parlay-header-hint">enter Vegas lines to get probabilities</span>
          </button>

          {parlayOpen && (
            <div className="parlay-body">
              {/* Win leg checkboxes */}
              <div className="parlay-win-checks">
                <label className="parlay-check-label">
                  <input
                    type="checkbox"
                    checked={homeWinLeg}
                    onChange={toggleHomeWin}
                  />
                  {result.home_team_abbr} Wins&nbsp;
                  <span className="parlay-check-prob">({pct(result.win_probability.ensemble_prob)})</span>
                </label>
                <label className="parlay-check-label">
                  <input
                    type="checkbox"
                    checked={awayWinLeg}
                    onChange={toggleAwayWin}
                  />
                  {result.away_team_abbr} Wins&nbsp;
                  <span className="parlay-check-prob">({pct(1 - result.win_probability.ensemble_prob)})</span>
                </label>
              </div>

              <div className="parlay-inputs">
                <div className="control-group">
                  <label>Home Pts Line ({result.home_team_abbr})</label>
                  <input type="number" step="0.5" placeholder="e.g. 113.5"
                    value={homePtsLine} onChange={e => setHomePtsLine(e.target.value)} />
                </div>
                <div className="control-group">
                  <label>Away Pts Line ({result.away_team_abbr})</label>
                  <input type="number" step="0.5" placeholder="e.g. 107.5"
                    value={awayPtsLine} onChange={e => setAwayPtsLine(e.target.value)} />
                </div>
                <div className="control-group">
                  <label>Over/Under Total</label>
                  <input type="number" step="0.5" placeholder="e.g. 222.5"
                    value={totalLine} onChange={e => setTotalLine(e.target.value)} />
                </div>
                <div className="control-group">
                  <label>Spread (home perspective)</label>
                  <input type="number" step="0.5" placeholder="e.g. -5.5"
                    value={spreadLine} onChange={e => setSpreadLine(e.target.value)} />
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={runParlay}
                disabled={parlayLoading || (!homeWinLeg && !awayWinLeg && !homePtsLine && !awayPtsLine && !totalLine && !spreadLine)}
              >
                {parlayLoading ? 'Calculating…' : 'Calculate Parlay'}
              </button>

              {parlayError && (
                <div className="error-msg" style={{ textAlign: 'left', padding: '0.5rem 0' }}>{parlayError}</div>
              )}

              {parlayResult && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Leg</th>
                          <th>Prob Over</th>
                          <th>Prob Under</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parlayResult.legs.map(leg => (
                          <tr key={leg.label}>
                            <td style={{ fontWeight: 500 }}>{leg.label}</td>
                            <td className={leg.prob_over >= 0.5 ? 'win' : 'loss'}>{pct(leg.prob_over)}</td>
                            <td className={leg.prob_under >= 0.5 ? 'win' : 'loss'}>{pct(leg.prob_under)}</td>
                          </tr>
                        ))}
                        <tr className="parlay-combined-row">
                          <td style={{ fontWeight: 700 }}>Combined (all Over)</td>
                          <td className={parlayResult.combined_prob >= 0.5 ? 'win' : 'loss'} style={{ fontWeight: 700 }}>
                            {pct(parlayResult.combined_prob)}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                    Combined probability assumes all legs played as "over".
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section 4: History ── */}
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
                <th>Date</th>
                <th>Home Win%</th>
                <th>Away Win%</th>
                <th>Home Pts</th>
                <th>Away Pts</th>
                <th>Spread</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td className="outcome-pending">{formatTime(h.ran_at)}</td>
                  <td><span className="tag tag-home">{h.home_team_abbr}</span></td>
                  <td><span className="tag tag-away">{h.away_team_abbr}</span></td>
                  <td style={{ opacity: 0.7, fontSize: '0.82rem' }}>{h.game_date}</td>
                  <td className={h.home_win_prob >= 0.5 ? 'win' : 'loss'}>{pct(h.home_win_prob)}</td>
                  <td className={h.away_win_prob >= 0.5 ? 'win' : 'loss'}>{pct(h.away_win_prob)}</td>
                  <td style={{ fontWeight: 600 }}>{h.home_pts.toFixed(1)}</td>
                  <td style={{ fontWeight: 600 }}>{h.away_pts.toFixed(1)}</td>
                  <td className={h.spread >= 0 ? 'win' : 'loss'}>{h.spread >= 0 ? '+' : ''}{h.spread.toFixed(1)}</td>
                  <td>{h.total.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
