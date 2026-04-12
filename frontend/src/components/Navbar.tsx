import { Page } from '../App'
import { Theme } from '../types'

interface Props {
  page: Page
  setPage: (p: Page) => void
  theme: Theme
  setTheme: (t: Theme) => void
}

const PAGES: { key: Page; label: string }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'games',    label: 'Games'    },
  { key: 'predict',  label: 'Predict'  },
]

const THEMES: { key: Theme; label: string }[] = [
  { key: 'dark',  label: 'Dark Glass' },
  { key: 'nba',   label: 'NBA Blue'   },
  { key: 'retro', label: 'Retro'      },
]

export default function Navbar({ page, setPage, theme, setTheme }: Props) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="brand-dot" />
        NBA Analytics
      </div>

      <div className="navbar-right">
        <div className="nav-links">
          {PAGES.map(p => (
            <button
              key={p.key}
              className={`nav-btn${page === p.key ? ' active' : ''}`}
              onClick={() => setPage(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="theme-dots" title="Switch theme">
          {THEMES.map(t => (
            <button
              key={t.key}
              className={`theme-dot theme-dot--${t.key}${theme === t.key ? ' active' : ''}`}
              title={t.label}
              onClick={() => setTheme(t.key)}
              aria-label={`Switch to ${t.label} theme`}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
