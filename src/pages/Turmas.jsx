import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TURNOS = ['Manhã', 'Tarde', 'Noite']

export default function Turmas() {
  const [turmas, setTurmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const emptyForm = { codigo: '', turno: 'Manhã', ano: new Date().getFullYear().toString() }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('turmas').select('*').order('turno').order('codigo')
    setTurmas(data || [])
    setLoading(false)
  }

  function abrirNovo() { setEditando(null); setForm(emptyForm); setModal(true) }
  function abrirEditar(t) {
    setEditando(t)
    setForm({ codigo: t.codigo, turno: t.turno, ano: t.ano||'' })
    setModal(true)
  }

  async function salvar() {
    if (!form.codigo.trim()) return alert('Informe o código da turma')
    setSaving(true)
    const payload = { codigo: form.codigo.trim().toUpperCase(), turno: form.turno, ano: form.ano||null }
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
  const lista = turmas.filter(t =>
    t.codigo.toLowerCase().includes(busca.toLowerCase()) ||
    (t.ano||'').includes(busca)
  )

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Turmas</div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova turma</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value blue">{turmas.length}</div></div>
        {TURNOS.map(t => (
          <div key={t} className="metric-card">
            <div className="metric-label">{t}</div>
            <div className="metric-value">{turmas.filter(x=>x.turno===t&&x.ativo).length}</div>
          </div>
        ))}
      </div>

      <div className="search-bar">
        <input placeholder="Buscar por código ou ano..." value={busca} onChange={e=>setBusca(e.target.value)} />
      </div>

      {TURNOS.map(turno => {
        const grupo = lista.filter(t => t.turno === turno && t.ativo)
        if (!grupo.length) return null
        return (
          <div key={turno}>
            <div className="section-title">{turno}</div>
            <div className="card">
              <table>
                <thead><tr><th>Código</th><th>Turno</th><th>Ano letivo</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  {grupo.map(t => (
                    <tr key={t.id}>
                      <td><strong style={{fontWeight:500}}>{t.codigo}</strong></td>
                      <td><span className={`badge ${t.turno==='Manhã'?'badge-info':t.turno==='Tarde'?'badge-warning':'badge-neutral'}`}>{t.turno}</span></td>
                      <td>{t.ano||'—'}</td>
                      <td><span className="badge badge-success">Ativa</span></td>
                      <td style={{display:'flex',gap:6}}>
                        <button className="btn btn-sm" onClick={()=>abrirEditar(t)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={()=>toggleAtivo(t)}>Desativar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {lista.filter(t=>!t.ativo).length > 0 && (
        <>
          <div className="section-title" style={{color:'#888'}}>Inativas</div>
          <div className="card">
            <table>
              <thead><tr><th>Código</th><th>Turno</th><th>Ano</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.filter(t=>!t.ativo).map(t=>(
                  <tr key={t.id} style={{opacity:0.6}}>
                    <td>{t.codigo}</td><td>{t.turno}</td><td>{t.ano||'—'}</td>
                    <td><button className="btn btn-sm btn-success" onClick={()=>toggleAtivo(t)}>Reativar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!lista.length && <div className="card"><div className="empty">Nenhuma turma encontrada</div></div>}

      <div className={`modal-overlay${modal?' open':''}`}>
        <div className="modal">
          <h3>{editando ? 'Editar turma' : 'Nova turma'}</h3>
          <div className="form-grid">
            <div className="form-row"><label>Código da turma</label><input value={form.codigo} onChange={f('codigo')} placeholder="Ex: 3A, EF2-B, 101" /></div>
            <div className="form-row"><label>Ano letivo</label><input value={form.ano} onChange={f('ano')} placeholder={new Date().getFullYear()} /></div>
            <div className="form-row"><label>Turno</label>
              <select value={form.turno} onChange={f('turno')}>
                {TURNOS.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
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
