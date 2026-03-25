import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/',            label: 'Dashboard',    icon: '◉', end: true },
  { to: '/estoque',     label: 'Estoque',       icon: '▦' },
  { to: '/saidas',      label: 'Saídas',        icon: '↑' },
  { to: '/devolucoes',  label: 'Devoluções',    icon: '↩' },
  { to: '/cobranca',    label: 'Cobrança',      icon: '!' },
  { to: '/relatorios',  label: 'Relatórios',    icon: '≡' },
  { to: '/importar',    label: 'Importar NF-e', icon: '↓' },
  { to: '/professores', label: 'Professores',   icon: '▲' },
  { to: '/turmas',      label: 'Turmas',        icon: '▣' },
  { to: '/usuarios',    label: 'Usuários',      icon: '◎' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.nome
    ? profile.nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()
    : 'AD'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>Almoxarifado</h2>
          <p>Escola Municipal</p>
        </div>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="sidebar-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div className="avatar">{initials}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{profile?.nome || 'Usuário'}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{profile?.perfil || 'Admin'}</div>
            </div>
          </div>
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={handleSignOut}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
