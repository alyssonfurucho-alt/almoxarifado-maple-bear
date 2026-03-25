import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Professores() {
  const [professores, setProfessores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const emptyForm = { nome: '', registro: '', especialidade: '', email: '', telefone: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('professores').select('*').order('nome')
    setProfessores(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null); setForm(emptyForm); setModal(true)
  }
  function abrirEditar(p) {
    setEditando(p)
    setForm({ nome: p.nome, registro: p.registro||'', especialidade: p.especialidade||'', email: p.email||'', telefone: p.telefone||'' })
    setModal(true)
  }

  async function salvar() {
    if (!form.nome.trim()) return alert('Informe o nome')
    setSaving(true)
    const payload = { nome: form.nome.trim(), registro: form.registro.trim()||null, especialidade: form.especialidade.trim()||null, email: form.email.trim()||null, telefone: form.telefone.trim()||null }
    editando
      ? await supabase.from('professores').update(payload).eq('id', editando.id)
      : await supabase.from('professores').insert({ ...payload, ativo: true })
    setModal(false); setSaving(false); load()
  }

  async function toggleAtivo(p) {
    await supabase.from('professores').update({ ativo: !p.ativo }).eq('id', p.id)
    load()
  }

  const f = v => e => setForm({ ...form, [v]: e.target.value })
  const lista = professores.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.registro||'').toLowerCase().includes(busca.toLowerCase()) ||
    (p.especialidade||'').toLowerCase().includes(busca.toLowerCase())
  )
  const ativos = lista.filter(p => p.ativo)
  const inativos = lista.filter(p => !p.ativo)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Professores</div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo professor(a)</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value blue">{professores.length}</div></div>
        <div className="metric-card"><div className="metric-label">Ativos</div><div className="metric-value green">{professores.filter(p=>p.ativo).length}</div></div>
        <div className="metric-card"><div className="metric-label">Inativos</div><div className="metric-value">{professores.filter(p=>!p.ativo).length}</div></div>
      </div>

      <div className="search-bar">
        <input placeholder="Buscar por nome, registro ou especialidade..." value={busca} onChange={e=>setBusca(e.target.value)} />
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Registro</th><th>Especialidade</th><th>E-mail</th><th>Telefone</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {ativos.map(p => (
              <tr key={p.id}>
                <td><strong style={{fontWeight:500}}>{p.nome}</strong></td>
                <td><span className="badge badge-neutral">{p.registro||'—'}</span></td>
                <td>{p.especialidade||'—'}</td>
                <td style={{fontSize:12,color:'#888'}}>{p.email||'—'}</td>
                <td style={{fontSize:12,color:'#888'}}>{p.telefone||'—'}</td>
                <td><span className="badge badge-success">Ativo</span></td>
                <td style={{display:'flex',gap:6}}>
                  <button className="btn btn-sm" onClick={()=>abrirEditar(p)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={()=>toggleAtivo(p)}>Desativar</button>
                </td>
              </tr>
            ))}
            {!ativos.length && <tr><td colSpan={7} className="empty">Nenhum professor(a) ativo encontrado</td></tr>}
          </tbody>
        </table>
      </div>

      {inativos.length > 0 && (
        <>
          <div className="section-title" style={{color:'#888'}}>Inativos</div>
          <div className="card">
            <table>
              <thead><tr><th>Nome</th><th>Registro</th><th>Especialidade</th><th>Ações</th></tr></thead>
              <tbody>
                {inativos.map(p => (
                  <tr key={p.id} style={{opacity:0.6}}>
                    <td>{p.nome}</td>
                    <td>{p.registro||'—'}</td>
                    <td>{p.especialidade||'—'}</td>
                    <td><button className="btn btn-sm btn-success" onClick={()=>toggleAtivo(p)}>Reativar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={`modal-overlay${modal?' open':''}`}>
        <div className="modal">
          <h3>{editando ? 'Editar professor(a)' : 'Novo professor(a)'}</h3>
          <div className="form-row"><label>Nome completo</label><input value={form.nome} onChange={f('nome')} placeholder="Nome do(a) professor(a)" /></div>
          <div className="form-grid">
            <div className="form-row"><label>Registro / Matrícula</label><input value={form.registro} onChange={f('registro')} placeholder="Ex: REG-001" /></div>
            <div className="form-row"><label>Especialidade</label><input value={form.especialidade} onChange={f('especialidade')} placeholder="Ex: Matemática" /></div>
            <div className="form-row"><label>E-mail</label><input type="email" value={form.email} onChange={f('email')} placeholder="email@escola.com" /></div>
            <div className="form-row"><label>Telefone</label><input value={form.telefone} onChange={f('telefone')} placeholder="(67) 99999-9999" /></div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

