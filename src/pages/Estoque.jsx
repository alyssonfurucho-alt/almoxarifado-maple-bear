import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtR, fmtData } from '../lib/utils'
import { useSort } from '../lib/useSort'
import Th from '../components/Th'

export default function Estoque() {
  const [estoqueRaw, setEstoqueRaw]     = useState([])
  const [produtos, setProdutos]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [busca, setBusca]               = useState('')
  const [mostrarZerados, setMostrarZerados] = useState(false)
  const [filtroAbaixoMedia, setFiltroAbaixoMedia] = useState(false)
  const [modal, setModal]               = useState(false)
  const [modalEntrada, setModalEntrada] = useState(null)
  const emptyLinha = { produto_id:'', produto:null, custo_unitario:'', quantidade:'', unidade:'un', inventario:false, busca:'', sugestoes:[], showSug:false }
  const [linhasModal, setLinhasModal]   = useState([{...emptyLinha}])
  const [entQtd, setEntQtd]            = useState('')
  const [entCusto, setEntCusto]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [mediasMensais, setMediasMensais]       = useState({})
  const [categoriasDB, setCategoriasDB]         = useState([])
  const [ultimasEntradas, setUltimasEntradas]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const tresMesesAtras = new Date()
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3)
    const dataInicio = tresMesesAtras.toISOString().split('T')[0]

    const [{ data: e }, { data: p }, { data: saidas }, { data: cats }, { data: movs }] = await Promise.all([
      supabase.from('estoque').select('*, produtos(id,nome,codigo_barras,cor,tamanho)').order('nome'),
      supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
      supabase.from('saidas').select('item_id, quantidade, data_saida').gte('data_saida', dataInicio),
      supabase.from('categorias').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('movimentacoes').select('item_id, created_at').eq('tipo', 'entrada').order('created_at', { ascending: false }),
    ])

    setEstoqueRaw(e || [])
    setProdutos(p || [])
    setCategoriasDB(cats || [])

    const totais = {}
    for (const s of saidas || []) {
      if (!s.item_id) continue
      totais[s.item_id] = (totais[s.item_id] || 0) + s.quantidade
    }
    const medias = {}
    for (const [id, total] of Object.entries(totais)) {
      medias[id] = Math.round((total / 3) * 10) / 10
    }
    setMediasMensais(medias)

    const ultimas = {}
    for (const m of movs || []) {
      if (!ultimas[m.item_id]) ultimas[m.item_id] = m.created_at
    }
    setUltimasEntradas(ultimas)
    setLoading(false)
  }

  async function salvar() {
    const linhasValidas = linhasModal.filter(l => l.produto_id)
    if (!linhasValidas.length) return alert('Adicione pelo menos um produto')
    setSaving(true)
    for (const linha of linhasValidas) {
      const produto = linha.produto
      const qtd     = parseFloat(linha.quantidade) || 0
      const custo   = parseFloat(linha.custo_unitario) || 0
      const existente = estoqueRaw.find(i => i.produto_id === linha.produto_id)
      if (existente) {
        // produto já tem estoque — faz entrada
        const qtdAtual = existente.quantidade || 0
        const novaQtd  = qtdAtual + qtd
        const custoMedioAnt = existente.custo_medio || existente.custo_unitario || 0
        const custoMedio = qtdAtual > 0 ? ((qtdAtual * custoMedioAnt) + (qtd * custo)) / novaQtd : custo
        await supabase.from('estoque').update({
          quantidade: novaQtd,
          custo_unitario: custo,
          custo_medio: parseFloat(custoMedio.toFixed(2)),
        }).eq('id', existente.id)
        if (qtd > 0) {
          await supabase.from('movimentacoes').insert({
            item_id: existente.id, item_nome: produto?.nome,
            tipo: 'entrada', quantidade: qtd, observacoes: 'Entrada manual',
          })
        }
      } else {
        // produto novo no estoque — cria
        const { data: novoEstoque } = await supabase.from('estoque').insert({
          produto_id:     linha.produto_id,
          nome:           produto?.nome,
          categoria:      produto?.categoria || 'Material escolar',
          custo_unitario: custo,
          custo_medio:    custo,
          quantidade:     qtd,
          unidade:        linha.unidade || 'un',
          inventario:     linha.inventario,
          codigo_barras:  produto?.codigo_barras || null,
        }).select().single()
        if (novoEstoque && qtd > 0) {
          await supabase.from('movimentacoes').insert({
            item_id: novoEstoque.id, item_nome: produto?.nome,
            tipo: 'entrada', quantidade: qtd, observacoes: 'Cadastro inicial',
          })
        }
      }
    }
    setModal(false)
    setLinhasModal([{...emptyLinha}])
    setSaving(false)
    load()
  }

  async function entrada() {
    const n = parseFloat(entQtd)
    const novoCusto = parseFloat(entCusto) || 0
    if (!n || n <= 0) return alert('Informe a quantidade')
    setSaving(true)
    const qtdAtual = modalEntrada.quantidade || 0
    const novaQtd = qtdAtual + n
    const custoMedioAnt = modalEntrada.custo_medio || modalEntrada.custo_unitario || 0
    const custoMedio = qtdAtual > 0
      ? ((qtdAtual * custoMedioAnt) + (n * novoCusto)) / novaQtd
      : novoCusto
    await supabase.from('estoque').update({
      quantidade: novaQtd,
      custo_unitario: novoCusto,
      custo_medio: parseFloat(custoMedio.toFixed(2)),
      ultimo_custo: novoCusto,
    }).eq('id', modalEntrada.id)
    await supabase.from('movimentacoes').insert({
      item_id: modalEntrada.id, item_nome: modalEntrada.produtos?.nome || modalEntrada.nome,
      tipo: 'entrada', quantidade: n, observacoes: 'Entrada manual',
    })
    setModalEntrada(null); setEntQtd(''); setEntCusto(''); setSaving(false); load()
  }

  async function toggleInventario(item) {
    await supabase.from('estoque').update({ inventario: !item.inventario }).eq('id', item.id)
    load()
  }

  function handleBuscaLinha(idx, v) {
    const matches = !v.trim() ? [] : produtos.filter(p =>
      p.nome.toLowerCase().includes(v.toLowerCase()) ||
      (p.codigo_barras || '').includes(v) ||
      (p.cor || '').toLowerCase().includes(v.toLowerCase()) ||
      (p.tamanho || '').toLowerCase().includes(v.toLowerCase())
    ).slice(0, 8)
    setLinhasModal(prev => prev.map((l, i) => i === idx
      ? { ...l, busca: v, produto_id: '', produto: null, sugestoes: matches, showSug: matches.length > 0 }
      : l))
  }

  function selecionarProdutoLinha(idx, p) {
    setLinhasModal(prev => prev.map((l, i) => i === idx
      ? { ...l, produto_id: p.id, produto: p, busca: `${p.nome}${p.cor ? ` — ${p.cor}` : ''}${p.tamanho ? ` ${p.tamanho}` : ''}`, sugestoes: [], showSug: false, unidade: l.unidade || 'un' }
      : l))
  }

  function addLinha() {
    setLinhasModal(prev => [...prev, {...emptyLinha}])
  }

  function removeLinha(idx) {
    setLinhasModal(prev => prev.length === 1 ? [{...emptyLinha}] : prev.filter((_, i) => i !== idx))
  }

  function updateLinha(idx, field, value) {
    setLinhasModal(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const f = v => e => setForm({ ...form, [v]: e.target.value })
  const nomeItem = i => i.produtos?.nome || i.nome || '—'
  const corItem  = i => i.produtos?.cor || ''
  const tamItem  = i => i.produtos?.tamanho || ''
  const eanItem  = i => i.produtos?.codigo_barras || i.codigo_barras || ''

  // enriquece com campos para ordenação
  const estoqueEnriquecido = estoqueRaw.map(i => ({
    ...i,
    _nome:          nomeItem(i),
    _ean:           eanItem(i),
    _cor:           corItem(i),
    _tamanho:       tamItem(i),
    _media:         mediasMensais[i.id] || 0,
    _ultima_entrada: ultimasEntradas[i.id] || '',
  }))

  const { sorted, sortKey, sortDir, toggleSort } = useSort(estoqueEnriquecido, '_nome', 'asc')

  const lista = sorted
    .filter(i => mostrarZerados ? true : i.quantidade > 0)
    .filter(i => filtroAbaixoMedia ? ((mediasMensais[i.id] || 0) > 0 && i.quantidade < mediasMensais[i.id]) : true)
    .filter(i => {
      const q = busca.toLowerCase()
      return !q || i._nome.toLowerCase().includes(q) || i._ean.includes(busca) ||
        i._cor.toLowerCase().includes(q) || i._tamanho.toLowerCase().includes(q)
    })

  const totalZerados = estoqueRaw.filter(i => i.quantidade === 0).length
  const thP = { sortKey, sortDir, onSort: toggleSort }

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Estoque</div>
        <button className="btn btn-primary" onClick={() => { setLinhasModal([{...emptyLinha}]); setModal(true) }}>+ Novo item</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total de itens</div><div className="metric-value blue">{estoqueRaw.length}</div></div>
        <div className="metric-card"><div className="metric-label">Em estoque</div><div className="metric-value green">{estoqueRaw.filter(i => i.quantidade > 0).length}</div></div>
        <div className="metric-card"><div className="metric-label">Zerados</div><div className="metric-value red">{totalZerados}</div></div>
        <div className="metric-card"><div className="metric-label">Abaixo da média</div><div className="metric-value red">{estoqueRaw.filter(i => i.quantidade > 0 && (mediasMensais[i.id]||0) > 0 && i.quantidade < mediasMensais[i.id]).length}</div></div>
        <div className="metric-card"><div className="metric-label">Inventário</div><div className="metric-value">{estoqueRaw.filter(i => i.inventario).length}</div></div>
      </div>

      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:'1 1 200px', marginBottom:0 }}>
          <input placeholder="Buscar por nome, código, cor, tamanho..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', color:'#555', whiteSpace:'nowrap' }}>
          <input type="checkbox" checked={mostrarZerados} onChange={e => setMostrarZerados(e.target.checked)} style={{ accentColor:'#1d4ed8' }} />
          Mostrar zerados {totalZerados > 0 && `(${totalZerados})`}
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', color: filtroAbaixoMedia ? '#dc2626' : '#555', whiteSpace:'nowrap' }}>
          <input type="checkbox" checked={filtroAbaixoMedia} onChange={e => setFiltroAbaixoMedia(e.target.checked)} style={{ accentColor:'#dc2626' }} />
          Apenas abaixo da média
        </label>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <Th label="Produto"         colKey="_nome"          {...thP} />
              <Th label="Cód. barras"     colKey="_ean"           {...thP} />
              <Th label="Cor"             colKey="_cor"           {...thP} />
              <Th label="Tamanho"         colKey="_tamanho"       {...thP} />
              <Th label="Categoria"       colKey="categoria"      {...thP} />
              <Th label="Qtd"             colKey="quantidade"     {...thP} />
              <Th label="Média/mês"       colKey="_media"         {...thP} />
              <Th label="Última entrada"  colKey="_ultima_entrada" {...thP} />
              <Th label="Custo médio"     colKey="custo_medio"    {...thP} />
              <th>Inventário</th>
              <Th label="Situação"        colKey="quantidade"     {...thP} style={{ pointerEvents:'none', opacity:0.6 }} />
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(i => {
              const media = mediasMensais[i.id] || 0
              return (
                <tr key={i.id}>
                  <td><strong style={{ fontWeight:500 }}>{nomeItem(i)}</strong>{i.inventario && <span style={{ marginLeft:6, fontSize:11, background:'#ede9fe', color:'#7c3aed', padding:'1px 7px', borderRadius:4, fontWeight:500 }}>inventário</span>}</td>
                  <td>{eanItem(i) ? <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'2px 6px', borderRadius:4 }}>{eanItem(i)}</span> : <span style={{ color:'#ccc' }}>—</span>}</td>
                  <td>{corItem(i) || <span style={{ color:'#ccc' }}>—</span>}</td>
                  <td>{tamItem(i) || <span style={{ color:'#ccc' }}>—</span>}</td>
                  <td>{i.categoria}</td>
                  <td>{i.quantidade} {i.unidade}</td>
                  <td>{media > 0 ? <span style={{ fontSize:13, color: i.quantidade < media ? '#d97706' : '#555', fontWeight: i.quantidade < media ? 600 : 400 }}>{media} {i.unidade}</span> : <span style={{ color:'#ccc', fontSize:12 }}>—</span>}</td>
                  <td>{ultimasEntradas[i.id] ? <span style={{ fontSize:12, color:'#555' }}>{new Date(ultimasEntradas[i.id]).toLocaleDateString('pt-BR')}</span> : <span style={{ color:'#ccc', fontSize:12 }}>—</span>}</td>
                  <td>{i.custo_medio > 0 ? <span style={{ color:'#16a34a', fontWeight:500 }}>{fmtR(i.custo_medio)}</span> : <span style={{ color:'#aaa', fontSize:12 }}>—</span>}</td>
                  <td><button onClick={() => toggleInventario(i)} style={{ padding:'3px 10px', fontSize:12, borderRadius:6, cursor:'pointer', border: i.inventario ? '1px solid #7c3aed' : '1px solid #d1d5db', background: i.inventario ? '#ede9fe' : '#fff', color: i.inventario ? '#7c3aed' : '#888', fontWeight: i.inventario ? 500 : 400 }}>{i.inventario ? 'Sim' : 'Não'}</button></td>
                  <td>{i.quantidade === 0 ? <span className="badge badge-danger">Sem estoque</span> : media > 0 && i.quantidade < media ? <span className="badge badge-warning">Estoque baixo</span> : media > 0 ? <span className="badge badge-success">OK</span> : <span className="badge badge-neutral">Sem histórico</span>}</td>
                  <td><button className="btn btn-sm" onClick={() => { setModalEntrada(i); setEntQtd(''); setEntCusto(i.custo_unitario?.toString() || '') }}>+ Entrada</button></td>
                </tr>
              )
            })}
            {!lista.length && <tr><td colSpan={12} className="empty">{mostrarZerados ? 'Nenhum item encontrado' : 'Nenhum item em estoque'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal novo item — múltiplos produtos */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal" style={{ maxWidth: 680, width: '95vw' }}>
          <h3>Entrada de estoque</h3>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            {linhasModal.map((linha, idx) => (
              <div key={idx} style={{ border: '1px solid #e8e8e5', borderRadius: 10, padding: '12px 14px', marginBottom: 10, position: 'relative', background: linha.produto_id ? '#fafafa' : '#fff' }}>
                {/* cabeçalho da linha */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>Produto {idx + 1}</span>
                  {linhasModal.length > 1 && (
                    <button onClick={() => removeLinha(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                  )}
                </div>

                {/* busca do produto */}
                <div className="form-row" style={{ position: 'relative', marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Produto <span style={{ color: '#888', fontWeight: 400 }}>(busque por nome, código ou cor)</span></label>
                  <input
                    value={linha.busca}
                    onChange={e => handleBuscaLinha(idx, e.target.value)}
                    onFocus={() => linha.sugestoes.length > 0 && updateLinha(idx, 'showSug', true)}
                    onBlur={() => setTimeout(() => updateLinha(idx, 'showSug', false), 150)}
                    placeholder="Digite para buscar..."
                    autoComplete="off"
                    style={{ borderColor: linha.produto_id ? '#16a34a' : undefined }}
                  />
                  {linha.produto_id && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>✓ {linha.produto?.categoria || 'Material escolar'}</div>}
                  {linha.showSug && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2, overflow: 'hidden' }}>
                      {linha.sugestoes.map(p => (
                        <div key={p.id} onMouseDown={() => selecionarProdutoLinha(idx, p)}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f3' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f5f5f3'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div>
                            <strong style={{ fontWeight: 500 }}>{p.nome}</strong>
                            {p.cor && <span style={{ marginLeft: 6, fontSize: 12, color: '#888' }}>{p.cor}</span>}
                            {p.tamanho && <span style={{ marginLeft: 4, fontSize: 12, color: '#888' }}>{p.tamanho}</span>}
                          </div>
                          {p.codigo_barras && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>{p.codigo_barras}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* campos numéricos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Quantidade</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={linha.quantidade}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        if (isNaN(v) || v >= 0) updateLinha(idx, 'quantidade', e.target.value)
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Custo unitário (R$)</label>
                    <input type="number" step="0.01" min="0" value={linha.custo_unitario} onChange={e => updateLinha(idx, 'custo_unitario', e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12 }}>Unidade</label>
                    <input value={linha.unidade} onChange={e => updateLinha(idx, 'unidade', e.target.value)} placeholder="un" />
                  </div>
                </div>

                {/* inventário */}
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={linha.inventario} onChange={e => updateLinha(idx, 'inventario', e.target.checked)} style={{ accentColor: '#7c3aed' }} />
                    <span>Marcar como <strong style={{ color: '#7c3aed' }}>inventário</strong></span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* botão adicionar linha */}
          <button onClick={addLinha} className="btn btn-sm" style={{ width: '100%', marginBottom: 12, borderStyle: 'dashed' }}>
            + Adicionar outro produto
          </button>

          <div className="modal-footer">
            <button className="btn" onClick={() => { setModal(false); setLinhasModal([{...emptyLinha}]) }}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : `Salvar ${linhasModal.filter(l => l.produto_id).length > 1 ? `(${linhasModal.filter(l => l.produto_id).length} produtos)` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Modal entrada */}
      <div className={`modal-overlay${modalEntrada ? ' open' : ''}`}>
        <div className="modal" style={{ width:400 }}>
          <h3>Entrada de estoque</h3>
          <p style={{ fontSize:13, color:'#888', marginBottom:12 }}>Produto: <strong>{modalEntrada ? nomeItem(modalEntrada) : ''}</strong></p>
          {modalEntrada && (modalEntrada.custo_medio > 0 || modalEntrada.custo_unitario > 0) && (
            <div style={{ display:'flex', gap:16, marginBottom:12, fontSize:13 }}>
              {modalEntrada.custo_medio > 0 && <div style={{ background:'#f0fdf4', borderRadius:8, padding:'8px 12px' }}><div style={{ fontSize:11, color:'#16a34a' }}>Custo médio atual</div><div style={{ fontWeight:600, color:'#16a34a' }}>{fmtR(modalEntrada.custo_medio)}</div></div>}
              {modalEntrada.custo_unitario > 0 && <div style={{ background:'#f5f5f3', borderRadius:8, padding:'8px 12px' }}><div style={{ fontSize:11, color:'#888' }}>Último custo</div><div style={{ fontWeight:600 }}>{fmtR(modalEntrada.custo_unitario)}</div></div>}
            </div>
          )}
          <div className="form-grid">
            <div className="form-row"><label>Quantidade a adicionar</label><input type="number" min="0.001" step="0.001" value={entQtd} onChange={e => setEntQtd(e.target.value)} placeholder="0" autoFocus /></div>
            <div className="form-row"><label>Custo unitário desta entrada</label><input type="number" step="0.01" value={entCusto} onChange={e => setEntCusto(e.target.value)} placeholder="0,00" /></div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModalEntrada(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={entrada} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
