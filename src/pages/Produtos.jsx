import { useEffect, useState } from 'react'
import { useSort } from '../lib/useSort'
import Th from '../components/Th'
import { supabase } from '../lib/supabase'

// Remove qualquer caractere que não seja número
function limparCodigo(v) {
  return v.replace(/\D/g, '')
}

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const emptyForm = { codigo_barras: '', nome: '', cor: '', tamanho: '', categoria: '' }
  const [categoriasDB, setCategoriasDB] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [erroCodigo, setErroCodigo] = useState('')

  const { sorted: produtosSorted, sortKey, sortDir, toggleSort } = useSort(produtos, 'nome', 'asc')
  useEffect(() => { load(); loadCategorias() }, [])

  async function loadCategorias() {
    try {
      const { data } = await supabase.from('categorias').select('id,nome').eq('ativo',true).order('nome')
      setCategoriasDB(data || [])
    } catch { setCategoriasDB([]) }
  }

  async function load() {
    const { data } = await supabase.from('produtos').select('*').order('nome')
    setProdutos(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setEditando(null); setForm(emptyForm); setErroCodigo(''); setModal(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setForm({ codigo_barras: p.codigo_barras || '', nome: p.nome, cor: p.cor || '', tamanho: p.tamanho || '', categoria: p.categoria || 'Material escolar' })
    setErroCodigo('')
    setModal(true)
  }

  function handleCodigo(e) {
    const limpo = limparCodigo(e.target.value)
    setForm({ ...form, codigo_barras: limpo })
    setErroCodigo('')
  }

  async function salvar() {
    if (!form.nome.trim()) return alert('Informe o nome do produto')

    // Regra: codigo_barras obrigatorio, exceto se cor OU tamanho preenchidos
    if (!form.codigo_barras && !form.cor.trim() && !form.tamanho.trim()) {
      setErroCodigo('Informe o código de barras, ou preencha pelo menos Cor ou Tamanho.')
      return
    }

    // Valida unicidade do código de barras
    if (form.codigo_barras) {
      const query = supabase.from('produtos').select('id,nome').eq('codigo_barras', form.codigo_barras)
      if (editando) query.neq('id', editando.id)
      const { data: dup } = await query.single()
      if (dup) {
        setErroCodigo(`Código já usado pelo produto "${dup.nome}"`)
        return
      }
    }

    setSaving(true)
    const payload = {
      codigo_barras: form.codigo_barras || null,
      nome: form.nome.trim(),
      cor: form.cor.trim() || null,
      tamanho: form.tamanho.trim() || null,
      categoria: form.categoria || 'Material escolar',
    }
    if (editando) {
      await supabase.from('produtos').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('produtos').insert({ ...payload, ativo: true })
    }
    setModal(false); setSaving(false); load()
  }

  async function toggleAtivo(p) {
    await supabase.from('produtos').update({ ativo: !p.ativo }).eq('id', p.id)
    load()
  }

  const f = v => e => setForm({ ...form, [v]: e.target.value })

  const lista = produtosSorted.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.codigo_barras || '').includes(busca) ||
    (p.cor || '').toLowerCase().includes(busca.toLowerCase()) ||
    (p.tamanho || '').toLowerCase().includes(busca.toLowerCase())
  )
  const ativos   = lista.filter(p => p.ativo)
  const inativos = lista.filter(p => !p.ativo)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Produtos</div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo produto</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total</div><div className="metric-value blue">{produtos.length}</div></div>
        <div className="metric-card"><div className="metric-label">Ativos</div><div className="metric-value green">{produtos.filter(p => p.ativo).length}</div></div>
        <div className="metric-card"><div className="metric-label">Com código de barras</div><div className="metric-value">{produtos.filter(p => p.codigo_barras).length}</div></div>
      </div>

      <div className="search-bar">
        <input placeholder="Buscar por nome, código, cor ou tamanho..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <div className="card">
        <table>
          <thead><tr><Th label="Código de barras" colKey="codigo_barras" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Nome" colKey="nome" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Categoria" colKey="categoria" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Cor" colKey="cor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Tamanho" colKey="tamanho" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {ativos.map(p => (
              <tr key={p.id}>
                <td>
                  {p.codigo_barras
                    ? <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f3', padding: '2px 8px', borderRadius: 4 }}>{p.codigo_barras}</span>
                    : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td><strong style={{ fontWeight: 500 }}>{p.nome}</strong></td>
                <td>{p.categoria || '—'}</td>
                <td>{p.cor
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: p.cor.toLowerCase(), border: '1px solid #e8e8e5', display: 'inline-block' }} />
                      {p.cor}
                    </span>
                  : <span style={{ color: '#ccc' }}>—</span>}
                </td>
                <td>{p.tamanho || <span style={{ color: '#ccc' }}>—</span>}</td>
                <td><span className="badge badge-success">Ativo</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => abrirEditar(p)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => toggleAtivo(p)}>Desativar</button>
                </td>
              </tr>
            ))}
            {!ativos.length && <tr><td colSpan={6} className="empty">Nenhum produto encontrado</td></tr>}
          </tbody>
        </table>
      </div>

      {inativos.length > 0 && (
        <>
          <div className="section-title" style={{ color: '#888' }}>Inativos</div>
          <div className="card">
            <table>
              <thead><tr><th>Código de barras</th><th>Nome</th><th>Cor</th><th>Tamanho</th><th>Ações</th></tr></thead>
              <tbody>
                {inativos.map(p => (
                  <tr key={p.id} style={{ opacity: 0.6 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.codigo_barras || '—'}</td>
                    <td>{p.nome}</td>
                    <td>{p.cor || '—'}</td>
                    <td>{p.tamanho || '—'}</td>
                    <td><button className="btn btn-sm btn-success" onClick={() => toggleAtivo(p)}>Reativar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal">
          <h3>{editando ? 'Editar produto' : 'Novo produto'}</h3>
          <div className="form-row">
            <label>Nome do produto</label>
            <input value={form.nome} onChange={f('nome')} placeholder="Ex: Camiseta polo" />
          </div>
          <div className="form-row">
            <label>
              Código de barras (EAN)
              <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>somente números</span>
            </label>
            <input
              value={form.codigo_barras}
              onChange={handleCodigo}
              placeholder="Ex: 7891234567890"
              inputMode="numeric"
              style={{ borderColor: erroCodigo ? '#dc2626' : undefined }}
            />
            {erroCodigo && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{erroCodigo}</div>}
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Cor</label>
              <input value={form.cor} onChange={f('cor')} placeholder="Ex: Azul, Vermelho..." />
            </div>
            <div className="form-row">
              <label>Tamanho</label>
              <input value={form.tamanho} onChange={f('tamanho')} placeholder="Ex: P, M, G, 42..." />
            </div>
            <div className="form-row">
              <label>Categoria</label>
              <select value={form.categoria} onChange={f('categoria')}>
                <option value="">Selecione...</option>
                {categoriasDB.map(cat => <option key={cat.id}>{cat.nome}</option>)}
              </select>
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
