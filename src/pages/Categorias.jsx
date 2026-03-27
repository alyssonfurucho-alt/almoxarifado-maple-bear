import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [editando, setEditando]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [busca, setBusca]           = useState('')
  const emptyForm = { nome: '', descricao: '' }
  const [form, setForm]             = useState(emptyForm)
  const [erroNome, setErroNome]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('categorias').select('*').order('nome')
    setCategorias(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null); setForm(emptyForm); setErroNome(''); setModal(true)
  }
  function abrirEditar(cat) {
    setEditando(cat)
    setForm({ nome: cat.nome, descricao: cat.descricao || '' })
    setErroNome(''); setModal(true)
  }

  async function salvar() {
    if (!form.nome.trim()) return setErroNome('Informe o nome da categoria')
    // verifica duplicata
    const dup = categorias.find(c =>
      c.nome.toLowerCase().trim() === form.nome.toLowerCase().trim() &&
      (!editando || c.id !== editando.id)
    )
    if (dup) return setErroNome('Já existe uma categoria com este nome')
    setSaving(true)
    const payload = { nome: form.nome.trim(), descricao: form.descricao.trim() || null }
    editando
      ? await supabase.from('categorias').update(payload).eq('id', editando.id)
      : await supabase.from('categorias').insert({ ...payload, ativo: true })
    setModal(false); setSaving(false); load()
  }

  async function toggleAtivo(cat) {
    await supabase.from('categorias').update({ ativo: !cat.ativo }).eq('id', cat.id)
    load()
  }

  async function excluir(cat) {
    if (!window.confirm(`Excluir a categoria "${cat.nome}"?\n\nIsso não afeta produtos ou itens já cadastrados com esta categoria.`)) return
    await supabase.from('categorias').delete().eq('id', cat.id)
    load()
  }

  const f = v => e => { setForm({ ...form, [v]: e.target.value }); setErroNome('') }
  const lista = categorias.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
  const ativas = lista.filter(c => c.ativo)
  const inativas = lista.filter(c => !c.ativo)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Categorias</div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova categoria</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value blue">{categorias.length}</div></div>
        <div className="metric-card"><div className="metric-label">Ativas</div><div className="metric-value green">{categorias.filter(c => c.ativo).length}</div></div>
      </div>

      <div className="search-bar">
        <input placeholder="Buscar categoria..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Descrição</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {ativas.map(cat => (
              <tr key={cat.id}>
                <td><strong style={{ fontWeight: 500 }}>{cat.nome}</strong></td>
                <td style={{ color: '#888', fontSize: 13 }}>{cat.descricao || '—'}</td>
                <td><span className="badge badge-success">Ativa</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => abrirEditar(cat)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => toggleAtivo(cat)}>Desativar</button>
                </td>
              </tr>
            ))}
            {!ativas.length && <tr><td colSpan={4} className="empty">Nenhuma categoria ativa</td></tr>}
          </tbody>
        </table>
      </div>

      {inativas.length > 0 && (
        <>
          <div className="section-title" style={{ color: '#888' }}>Inativas</div>
          <div className="card">
            <table>
              <thead><tr><th>Nome</th><th>Descrição</th><th>Ações</th></tr></thead>
              <tbody>
                {inativas.map(cat => (
                  <tr key={cat.id} style={{ opacity: 0.6 }}>
                    <td>{cat.nome}</td>
                    <td style={{ fontSize: 13, color: '#888' }}>{cat.descricao || '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-success" onClick={() => toggleAtivo(cat)}>Reativar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => excluir(cat)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal" style={{ width: 400 }}>
          <h3>{editando ? 'Editar categoria' : 'Nova categoria'}</h3>
          <div className="form-row">
            <label>Nome da categoria</label>
            <input value={form.nome} onChange={f('nome')} placeholder="Ex: Material escolar"
              style={{ borderColor: erroNome ? '#dc2626' : undefined }} />
            {erroNome && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{erroNome}</div>}
          </div>
          <div className="form-row">
            <label>Descrição <span style={{ color: '#888', fontSize: 11 }}>(opcional)</span></label>
            <textarea rows={2} value={form.descricao} onChange={f('descricao')} placeholder="Descrição da categoria..." />
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
