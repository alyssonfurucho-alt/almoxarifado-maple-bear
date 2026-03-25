import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const navItems = [
  { to:'/',            label:'Dashboard',    icon:'◉', end:true },
  { to:'/estoque',     label:'Estoque',      icon:'▦' },
  { to:'/saidas',      label:'Saídas',       icon:'↑' },
  { to:'/devolucoes',  label:'Devoluções',   icon:'↩' },
  { to:'/cobranca',    label:'Cobrança',     icon:'!' },
  { to:'/relatorios',  label:'Relatórios',   icon:'≡' },
  { to:'/historico',   label:'Histórico',    icon:'☰' },
  { to:'/importar',    label:'Importar NF-e',icon:'↓' },
  { to:'/professores', label:'Professores',  icon:'▲' },
  { to:'/turmas',      label:'Turmas',       icon:'▣' },
  { to:'/usuarios',    label:'Usuários',     icon:'◎' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() { await signOut(); navigate('/login') }

  const initials = profile?.nome
    ? profile.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : 'AD'

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      {/* SIDEBAR */}
      <aside style={{
        width: 210, minWidth: 210,
        background: '#fff',
        borderRight: '1px solid #e8e8e5',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #e8e8e5', flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:600, color:'#1a1a1a' }}>Almoxarifado</div>
          <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Escola Municipal</div>
        </div>

        {/* Nav — scrollável */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'6px 0' }}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? '#1d4ed8' : '#555',
                background: isActive ? '#eff6ff' : 'transparent',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'background 0.1s',
              })}
              onMouseEnter={e => { if (!e.currentTarget.style.background.includes('eff6ff')) e.currentTarget.style.background = '#f5f5f3' }}
              onMouseLeave={e => { if (!e.currentTarget.style.background.includes('eff6ff')) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ width:16, textAlign:'center', fontSize:13 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Rodapé — fixo embaixo */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #e8e8e5',
          flexShrink: 0,
          background: '#fff',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background:'#eff6ff', color:'#1d4ed8',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:600,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:500, color:'#1a1a1a' }}>{profile?.nome || 'Usuário'}</div>
              <div style={{ fontSize:11, color:'#888' }}>{profile?.perfil || 'Admin'}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width:'100%', padding:'6px 0', fontSize:12,
              border:'1px solid #d1d5db', borderRadius:6,
              background:'#fff', color:'#555', cursor:'pointer',
            }}
          >
            Sair
          </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main style={{ flex:1, overflowY:'auto', padding:28 }}>
        <Outlet />
      </main>
    </div>
  )
}
