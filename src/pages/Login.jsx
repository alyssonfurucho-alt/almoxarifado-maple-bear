import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError('E-mail ou senha incorretos.')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f3'
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>Almoxarifado Escolar</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>Faça login para continuar</p>
        </div>
        <div className="card">
          {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>E-mail</label>
              <input
                type="email" value={email} required
                placeholder="seu@email.com"
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Senha</label>
              <input
                type="password" value={password} required
                placeholder="••••••••"
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit" className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: 10 }}
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
