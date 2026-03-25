import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Turmas() {
  const [turmas, setTurmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const emptyForm = { codigo: '', ano: new Date().getFullYear().toString() }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('turmas').select('*').order('codigo')
    setTurmas(data || [])
    setLoading(false)
  }

  function abrirNovo() { setEditando(null); setForm(emptyForm); setModal(true) }
  function abrirEditar(t) {
    setEditando(t)
    setForm({ codigo: t.codigo, ano: t.ano || '' })
    setModal(true)
  }

  async function salvar() {
    if (!form.codigo.trim()) return alert('Informe o código da turma')
    setSaving(true)
    const payload = { codigo: form.codigo.trim().toUpperCase(), ano: form.ano || null }
    editando
      ? await supabase.from('turmas').update(payload).eq('id', editando.id)
      : await supabase.from('turmas').insert({ ...payload, ativo: true })
    setModal(false); setSaving(false); load()
  }

  async function toggleAtivo(t) {
    await supabase.from('turmas').update({ ativo: !t.ativo }).eq('id', t.id)
    load()
  }

  const f = v => e => setForm({ ...form, [v]: e.target.value })
  const ativas   = turmas.filter(t => t.ativo && t.codigo.toLowerCase().includes(busca.toLowerCase()))
  const inativas = turmas.filter(t => !t.ativo && t.codigo.toLowerCase().includes(busca.toLowerCase()))

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Turmas</div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova turma</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value blue">{turmas.length}</div></div>
        <div className="metric-card"><div className="metric-label">Ativas</div><div className="metric-value green">{turmas.filter(t => t.ativo).length}</div></div>
        <div className="metric-card"><div className="metric-label">Inativas</div><div className="metric-value">{turmas.filter(t => !t.ativo).length}</div></div>
      </div>

      <div className="search-bar">
        <input placeholder="Buscar por código..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Código</th><th>Ano letivo</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {ativas.map(t => (
              <tr key={t.id}>
                <td><strong style={{ fontWeight: 500 }}>{t.codigo}</strong></td>
                <td>{t.ano || '—'}</td>
                <td><span className="badge badge-success">Ativa</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => abrirEditar(t)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => toggleAtivo(t)}>Desativar</button>
                </td>
              </tr>
            ))}
            {!ativas.length && <tr><td colSpan={4} className="empty">Nenhuma turma ativa encontrada</td></tr>}
          </tbody>
        </table>
      </div>

      {inativas.length > 0 && (
        <>
          <div className="section-title" style={{ color: '#888' }}>Inativas</div>
          <div className="card">
            <table>
              <thead><tr><th>Código</th><th>Ano letivo</th><th>Ações</th></tr></thead>
              <tbody>
                {inativas.map(t => (
                  <tr key={t.id} style={{ opacity: 0.6 }}>
                    <td>{t.codigo}</td>
                    <td>{t.ano || '—'}</td>
                    <td><button className="btn btn-sm btn-success" onClick={() => toggleAtivo(t)}>Reativar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal" style={{ width: 360 }}>
          <h3>{editando ? 'Editar turma' : 'Nova turma'}</h3>
          <div className="form-grid">
            <div className="form-row"><label>Código da turma</label>
              <input value={form.codigo} onChange={f('codigo')} placeholder="Ex: 3A, EF2-B, 101" />
            </div>
            <div className="form-row"><label>Ano letivo</label>
              <input value={form.ano} onChange={f('ano')} placeholder={new Date().getFullYear()} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
