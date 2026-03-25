import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Usuarios() {
  const { profile } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'Professor(a)', sala: '', turno: 'Manhã' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('usuarios').select('*').order('nome')
    setUsuarios(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return alert('Informe o nome')
    if (!form.email.trim()) return alert('Informe o e-mail')
    if (!form.senha || form.senha.length < 6) return alert('A senha deve ter pelo menos 6 caracteres')
    setSaving(true)
    // Cria o usuário no Auth do Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: form.email,
      password: form.senha,
      email_confirm: true,
    })
    if (authError) {
      alert('Erro ao criar login: ' + authError.message)
      setSaving(false)
      return
    }
    // Cria o perfil na tabela usuarios
    await supabase.from('usuarios').insert({
      auth_id: authData.user.id,
      nome: form.nome.trim(),
      email: form.email.trim(),
      perfil: form.perfil,
      sala: form.sala || '-',
      turno: form.turno,
      ativo: true,
    })
    setModal(false)
    setForm({ nome: '', email: '', senha: '', perfil: 'Professor(a)', sala: '', turno: 'Manhã' })
    setSaving(false)
    load()
  }

  async function toggleAtivo(u) {
    await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id)
    load()
  }

  if (loading) return <div className="loading">Carregando...</div>

  const isAdmin = profile?.perfil === 'Administrador'

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Usuários</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setModal(true)}>+ Novo usuário</button>}
      </div>

      {!isAdmin && (
        <div className="alert alert-info">Apenas administradores podem gerenciar usuários.</div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Sala / Turno</th><th>Status</th>{isAdmin && <th>Ações</th>}</tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td><strong style={{ fontWeight: 500 }}>{u.nome}</strong></td>
                <td style={{ color: '#888', fontSize: 12 }}>{u.email}</td>
                <td>
                  <span className={`badge ${u.perfil === 'Administrador' ? 'badge-info' : u.perfil === 'Auxiliar' ? 'badge-warning' : 'badge-success'}`}>
                    {u.perfil}
                  </span>
                </td>
                <td>{u.sala} / {u.turno}</td>
                <td>
                  {u.ativo
                    ? <span className="badge badge-success">Ativo</span>
                    : <span className="badge badge-neutral">Inativo</span>}
                </td>
                {isAdmin && (
                  <td>
                    <button
                      className={`btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleAtivo(u)}
                    >
                      {u.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!usuarios.length && <tr><td colSpan={6} className="empty">Nenhum usuário cadastrado</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal novo usuário */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal">
          <h3>Cadastrar usuário</h3>
          <div className="form-grid">
            <div className="form-row">
              <label>Nome completo</label>
              <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome da professora..." />
            </div>
            <div className="form-row">
              <label>Perfil</label>
              <select value={form.perfil} onChange={e => setForm({ ...form, perfil: e.target.value })}>
                <option>Professor(a)</option>
                <option>Administrador</option>
                <option>Auxiliar</option>
              </select>
            </div>
            <div className="form-row">
              <label>E-mail (login)</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@escola.com" />
            </div>
            <div className="form-row">
              <label>Senha inicial</label>
              <input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-row">
              <label>Sala padrão</label>
              <input value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })} placeholder="Ex: Sala 3" />
            </div>
            <div className="form-row">
              <label>Turno padrão</label>
              <select value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })}>
                <option>Manhã</option><option>Tarde</option><option>Noite</option>
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Criando...' : 'Criar usuário'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
