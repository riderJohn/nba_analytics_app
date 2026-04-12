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
        {/* Always mounted — hidden with CSS so state is preserved across tab switches */}
        <div style={{ display: page === 'schedule' ? 'block' : 'none' }}><Schedule /></div>
        <div style={{ display: page === 'games'    ? 'block' : 'none' }}><Games /></div>
        <div style={{ display: page === 'predict'  ? 'block' : 'none' }}><Predict /></div>
      </main>
    </>
  )
}
