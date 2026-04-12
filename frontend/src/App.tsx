import { useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Schedule from './pages/Schedule'
import Games from './pages/Games'
import Predict from './pages/Predict'
import { Theme } from './types'

export type Page = 'schedule' | 'games' | 'predict'

export default function App() {
  const [page, setPage] = useState<Page>('schedule')
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <>
      <Navbar page={page} setPage={setPage} theme={theme} setTheme={setTheme} />
      <main className="content">
        {page === 'schedule' && <Schedule />}
        {page === 'games'    && <Games />}
        {page === 'predict'  && <Predict />}
      </main>
    </>
  )
}
