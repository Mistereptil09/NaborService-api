import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ConfigBar } from './components/ConfigBar'
import { AuthPage } from './pages/AuthPage'
import { NeighbourhoodsPage } from './pages/NeighbourhoodsPage'
import { BanPage } from './pages/BanPage'
import { AppContext, type AppState } from './context/AppContext'

export type Page = 'auth' | 'neighbourhoods' | 'ban'

export default function App() {
  const [page, setPage] = useState<Page>('auth')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [appState, setAppState] = useState<AppState>({
    jwt: null,
    baseUrl: 'http://localhost:3000',
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <AppContext.Provider value={{ appState, setAppState }}>
      <div className="app-shell">
        <Sidebar
          page={page}
          onNavigate={setPage}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          jwt={appState.jwt}
        />
        <main className="main-content" id="main">
          <ConfigBar
            value={appState.baseUrl}
            onChange={v => setAppState(s => ({ ...s, baseUrl: v }))}
          />
          {page === 'auth' && <AuthPage />}
          {page === 'neighbourhoods' && <NeighbourhoodsPage />}
          {page === 'ban' && <BanPage />}
        </main>
      </div>
    </AppContext.Provider>
  )
}
