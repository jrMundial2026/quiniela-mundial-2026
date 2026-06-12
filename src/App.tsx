import { Link, Navigate, Route, Routes } from 'react-router-dom'
import PublicTablePage from './pages/PublicTablePage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Quiniela del Mundial</div>
          <div className="subtitle">Tabla general y administración</div>
        </div>
        <nav className="nav">
          <Link to="/tabla">Tabla</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/tabla" replace />} />
          <Route path="/tabla" element={<PublicTablePage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  )
}
