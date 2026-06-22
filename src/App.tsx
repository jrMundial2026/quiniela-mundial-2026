import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import PublicTablePage from './pages/PublicTablePage'
import AdminPage from './pages/AdminPage'
import ComparePredictionsPage from './pages/ComparePredictionsPage'

const viewOptions = [
  { path: '/tabla', label: 'Menu: Tabla General' },
  { path: '/comparar', label: 'Menu: Comparación' },
]

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()

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