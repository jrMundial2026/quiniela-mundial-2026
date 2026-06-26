import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import PublicTablePage from './pages/PublicTablePage'
import AdminPage from './pages/AdminPage'
import ComparePredictionsPage from './pages/ComparePredictionsPage'

const viewOptions = [
  { path: '/tabla', label: 'Menu: Tabla General' },
  { path: '/comparar', label: 'Menu: Comparación' },
]

const CURRENT_APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

function useAutoReloadOnNewVersion() {
  useEffect(() => {
    if (CURRENT_APP_VERSION === 'dev') return

    let cancelled = false

    async function checkVersion() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, {
          cache: 'no-store',
        })

        if (!response.ok) return

        const data = await response.json()
        const latestVersion = String(data.version ?? '')

        if (!cancelled && latestVersion && latestVersion !== CURRENT_APP_VERSION) {
          window.location.reload()
        }
      } catch {
        // Si falla la red, no hacemos nada.
      }
    }

    const interval = window.setInterval(checkVersion, 30000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkVersion()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void checkVersion()

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()

  useAutoReloadOnNewVersion()

  const currentValue = viewOptions.some((view) => view.path === location.pathname)
    ? location.pathname
    : '/tabla'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">Quiniela del Mundial</div>
          <div className="subtitle">Puedes ver tus aciertos, predicciones, resultados y proximos partidos.</div>
        </div>

        <div className="view-selector">
          <select
            id="view-selector"
            value={currentValue}
            onChange={(e) => navigate(e.target.value)}
            className="view-selector-control"
          >
            {viewOptions.map((view) => (
              <option key={view.path} value={view.path}>
                {view.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/tabla" replace />} />
          <Route path="/tabla" element={<PublicTablePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/comparar" element={<ComparePredictionsPage />} />
        </Routes>
      </main>
    </div>
  )
}
