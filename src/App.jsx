import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Estoque from './pages/Estoque'
import Saidas from './pages/Saidas'
import Devolucoes from './pages/Devolucoes'
import Cobranca from './pages/Cobranca'
import Relatorios from './pages/Relatorios'
import Usuarios from './pages/Usuarios'
import ImportarNFe from './pages/ImportarNFe'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Carregando...</div>
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Carregando...</div>
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="saidas" element={<Saidas />} />
        <Route path="devolucoes" element={<Devolucoes />} />
        <Route path="cobranca" element={<Cobranca />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="importar" element={<ImportarNFe />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
