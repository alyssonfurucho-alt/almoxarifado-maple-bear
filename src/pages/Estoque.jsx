import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtR, fmtData } from '../lib/utils'

export default function Estoque() {
  const [estoque, setEstoque]           = useState([])
  const [produtos, setProdutos]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [busca, setBusca]               = useState('')
  const [mostrarZerados, setMostrarZerados] = useState(false)
  const [filtroAbaixoMedia, setFiltroAbaixoMedia] = useState(false)
  const [modal, setModal]               = useState(false)
  const [modalEntrada, setModalEntrada] = useState(null)
  const emptyForm = { produto_id:'', categoria:'', custo_unitario:'', quantidade:'', unidade:'un', inventario:false }
  const [form, setForm]                 = useState(emptyForm)
  const [entQtd, setEntQtd]            = useState('')
  const [entCusto, setEntCusto]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [sugestoes, setSugestoes]       = useState([])
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [mediasMensais, setMediasMensais]       = useState({})
  const [categoriasDB, setCategoriasDB]         = useState([])
  const [ultimasEntradas, setUltimasEntradas]   = useState({}) // { estoque_id: data } // { estoque_id: media }

  useEffect(() => { load() }, [])

  async function load() {
    // data de 3 meses atrás para calcular média
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

    setEstoque(e || [])
    setProdutos(p || [])

    // calcula média mensal por item (total saídas / 3 meses)
    const totais = {}
    for (const s of saidas || []) {
      if (!s.item_id) continue
      totais[s.item_id] = (totais[s.item_id] || 0) + s.quantidade
    }
    const medias = {}
    for (const [id, total] of Object.entries(totais)) {
      medias[id] = Math.round((total / 3) * 10) / 10  // 1 casa decimal
    }
    setMediasMensais(medias)
    setCategoriasDB(cats || [])

    // última entrada por item (primeiro resultado já é o mais recente)
    const ultimas = {}
    for (const m of movs || []) {
      if (!ultimas[m.item_id]) ultimas[m.item_id] = m.created_at
    }
    setUltimasEntradas(ultimas)
    setLoading(false)
  }

  async function salvar() {
    if (!form.produto_id) return alert('Selecione um produto')
    const existente = estoque.find(i => i.produto_id === form.produto_id)
    if (existente) {
      alert('Já existe estoque para este produto. Use "+ Entrada".')
      return
    }
    setSaving(true)
    const produto = produtos.find(p => p.id === form.produto_id)
    const qtd = parseInt(form.quantidade) || 0
    const custoUnit = parseFloat(form.custo_unitario) || 0
    const { data: novoEstoque } = await supabase.from('estoque').insert({
      produto_id:     form.produto_id,
      nome:           produto?.nome,
      categoria:      form.categoria,
      custo_unitario: custoUnit,
      custo_medio:    custoUnit,
      ultimo_custo:   custoUnit,
      total_entradas: qtd,
      quantidade:     qtd,
      unidade:        form.unidade || 'un',
      inventario:     form.inventario,
      codigo_barras:  produto?.codigo_barras || null,
    }).select().single()
    if (novoEstoque && qtd > 0) {
      await supabase.from('movimentacoes').insert({
        item_id: novoEstoque.id, item_nome: produto?.nome,
        tipo: 'entrada', quantidade: qtd, observacoes: 'Cadastro inicial',
      })
    }
    setModal(false); setForm(emptyForm); setBuscaProduto(''); setSaving(false); load()
  }

  async function entrada() {
    const n    = parseInt(entQtd)
    const novo_custo = parseFloat(entCusto)
    if (!n || n < 1) return alert('Informe a quantidade')
    if (!entCusto || isNaN(novo_custo) || novo_custo < 0) return alert('Informe o custo unitário')
    setSaving(true)
    const qtdAtual       = modalEntrada.quantidade || 0
    const novaQtd        = qtdAtual + n
    const custoMedioAnt  = modalEntrada.custo_medio || modalEntrada.custo_unitario || 0
    // custo médio ponderado com o novo custo informado
    const custoMedio = qtdAtual > 0
      ? ((qtdAtual * custoMedioAnt) + (n * novo_custo)) / novaQtd
      : novo_custo
    await supabase.from('estoque').update({
      quantidade:     novaQtd,
      custo_unitario: novo_custo,
      custo_medio:    parseFloat(custoMedio.toFixed(2)),
      ultimo_custo:   novo_custo,
      total_entradas: (modalEntrada.total_entradas || 0) + n,
    }).eq('id', modalEntrada.id)
    await supabase.from('movimentacoes').insert({
      item_id:    modalEntrada.id,
      item_nome:  modalEntrada.produtos?.nome || modalEntrada.nome,
      tipo:       'entrada',
      quantidade: n,
      observacoes: `Entrada manual — custo: R$ ${novo_custo.toFixed(2)}`,
    })
    setModalEntrada(null); setEntQtd(''); setEntCusto(''); setSaving(false); load()
  }

  async function toggleInventario(item) {
    await supabase.from('estoque').update({ inventario: !item.inventario }).eq('id', item.id)
    load()
  }

  function handleBuscaProduto(e) {
    const v = e.target.value
    setBuscaProduto(v)
    setForm({ ...form, produto_id: '' })
    if (!v.trim()) { setSugestoes([]); setMostrarSugestoes(false); return }
    const matches = produtos.filter(p =>
      p.nome.toLowerCase().includes(v.toLowerCase()) ||
      (p.codigo_barras || '').includes(v) ||
      (p.cor || '').toLowerCase().includes(v.toLowerCase()) ||
      (p.tamanho || '').toLowerCase().includes(v.toLowerCase())
    ).slice(0, 8)
    setSugestoes(matches)
    setMostrarSugestoes(matches.length > 0)
  }

  function selecionarProduto(p) {
    setForm({ ...form, produto_id: p.id })
    setBuscaProduto(`${p.nome}${p.cor ? ` — ${p.cor}` : ''}${p.tamanho ? ` ${p.tamanho}` : ''}`)
    setSugestoes([]); setMostrarSugestoes(false)
  }

  const f = v => e => setForm({ ...form, [v]: e.target.value })
  const nomeItem = i => i.produtos?.nome || i.nome || '—'
  const corItem  = i => i.produtos?.cor || ''
  const tamItem  = i => i.produtos?.tamanho || ''
  const eanItem  = i => i.produtos?.codigo_barras || i.codigo_barras || ''

  const lista = estoque
    .filter(i => mostrarZerados ? true : i.quantidade > 0)
    .filter(i => filtroAbaixoMedia ? (mediasMensais[i.id] > 0 && i.quantidade < mediasMensais[i.id]) : true)
    .filter(i => {
      const q = busca.toLowerCase()
      return !q || nomeItem(i).toLowerCase().includes(q) ||
        eanItem(i).includes(busca) ||
        corItem(i).toLowerCase().includes(q) ||
        tamItem(i).toLowerCase().includes(q)
    })

  const totalZerados = estoque.filter(i => i.quantidade === 0).length

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Estoque</div>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setBuscaProduto(''); setSugestoes([]); setModal(true) }}>+ Novo item</button>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Total de itens</div><div className="metric-value blue">{estoque.length}</div></div>
        <div className="metric-card"><div className="metric-label">Em estoque</div><div className="metric-value green">{estoque.filter(i => i.quantidade > 0).length}</div></div>
        <div className="metric-card"><div className="metric-label">Zerados</div><div className="metric-value red">{totalZerados}</div></div>
        <div className="metric-card"><div className="metric-label">Abaixo da média</div><div className="metric-value red">{estoque.filter(i => i.quantidade > 0 && (mediasMensais[i.id] || 0) > 0 && i.quantidade < mediasMensais[i.id]).length}</div></div>
        <div className="metric-card"><div className="metric-label">Inventário</div><div className="metric-value">{estoque.filter(i => i.inventario).length}</div></div>
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
              <th>Produto</th>
              <th>Cód. barras</th>
              <th>Cor</th>
              <th>Tamanho</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Média/mês</th>
              <th>Última entrada</th>
              <th>Custo médio</th>
              <th>Inventário</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(i => {
              const media = mediasMensais[i.id] || 0
              return (
              <tr key={i.id}>
                {/* 1. Produto */}
                <td>
                  <strong style={{ fontWeight:500 }}>{nomeItem(i)}</strong>
                  {i.inventario && <span style={{ marginLeft:6, fontSize:11, background:'#ede9fe', color:'#7c3aed', padding:'1px 7px', borderRadius:4, fontWeight:500 }}>inventário</span>}
                </td>
                {/* 2. Cód. barras */}
                <td>{eanItem(i) ? <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'2px 6px', borderRadius:4 }}>{eanItem(i)}</span> : <span style={{ color:'#ccc' }}>—</span>}</td>
                {/* 3. Cor */}
                <td>{corItem(i) || <span style={{ color:'#ccc' }}>—</span>}</td>
                {/* 4. Tamanho */}
                <td>{tamItem(i) || <span style={{ color:'#ccc' }}>—</span>}</td>
                {/* 5. Categoria */}
                <td>{i.categoria}</td>
                {/* 6. Qtd */}
                <td>{i.quantidade} {i.unidade}</td>
                {/* 7. Média/mês */}
                <td>
                  {media > 0
                    ? <span style={{ fontSize:13, color: i.quantidade < media ? '#d97706' : '#555', fontWeight: i.quantidade < media ? 600 : 400 }}>
                        {media} {i.unidade}
                      </span>
                    : <span style={{ color:'#ccc', fontSize:12 }}>—</span>}
                </td>
                {/* 8. Última entrada */}
                <td>
                  {ultimasEntradas[i.id]
                    ? <span style={{ fontSize:12, color:'#555' }}>{new Date(ultimasEntradas[i.id]).toLocaleDateString('pt-BR')}</span>
                    : <span style={{ color:'#ccc', fontSize:12 }}>—</span>}
                </td>
                {/* 9. Custo médio */}
                <td>
                  {i.custo_medio > 0
                    ? <span style={{ color:'#16a34a', fontWeight:500 }}>{fmtR(i.custo_medio)}</span>
                    : <span style={{ color:'#aaa', fontSize:12 }}>—</span>}
                </td>
                {/* 10. Inventário */}
                <td>
                  <button onClick={() => toggleInventario(i)} style={{ padding:'3px 10px', fontSize:12, borderRadius:6, cursor:'pointer', border: i.inventario ? '1px solid #7c3aed' : '1px solid #d1d5db', background: i.inventario ? '#ede9fe' : '#fff', color: i.inventario ? '#7c3aed' : '#888', fontWeight: i.inventario ? 500 : 400 }}>
                    {i.inventario ? 'Sim' : 'Não'}
                  </button>
                </td>
                {/* 11. Situação */}
                <td>
                  {i.quantidade === 0                 ? <span className="badge badge-danger">Sem estoque</span>
                  : media > 0 && i.quantidade < media  ? <span className="badge badge-warning">Estoque baixo</span>
                  : media > 0 && i.quantidade >= media ? <span className="badge badge-success">OK</span>
                  :                                      <span className="badge badge-neutral">Sem histórico</span>}
                </td>
                {/* 12. Ações */}
                <td><button className="btn btn-sm" onClick={() => { setModalEntrada(i); setEntQtd(''); setEntCusto(i.custo_unitario?.toString() || '') }}>+ Entrada</button></td>
              </tr>
            )})}
            {!lista.length && <tr><td colSpan={12} className="empty">{mostrarZerados ? 'Nenhum item encontrado' : 'Nenhum item em estoque'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal novo item */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal">
          <h3>Adicionar ao estoque</h3>
          <div className="form-row" style={{ position:'relative' }}>
            <label>Produto <span style={{ fontSize:11, color:'#888' }}>(busque por nome, código ou cor)</span></label>
            <input value={buscaProduto} onChange={handleBuscaProduto}
              onFocus={() => sugestoes.length > 0 && setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              placeholder="Digite para buscar..." autoComplete="off" />
            {mostrarSugestoes && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:'#fff', border:'1px solid #d1d5db', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,0.1)', marginTop:2, overflow:'hidden' }}>
                {sugestoes.map(p => (
                  <div key={p.id} onMouseDown={() => selecionarProduto(p)}
                    style={{ padding:'8px 12px', cursor:'pointer', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f5f5f3' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f5f5f3'}
                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <div>
                      <strong style={{ fontWeight:500 }}>{p.nome}</strong>
                      {p.cor && <span style={{ marginLeft:6, fontSize:12, color:'#888' }}>{p.cor}</span>}
                      {p.tamanho && <span style={{ marginLeft:4, fontSize:12, color:'#888' }}>{p.tamanho}</span>}
                    </div>
                    {p.codigo_barras && <span style={{ fontFamily:'monospace', fontSize:11, color:'#aaa' }}>{p.codigo_barras}</span>}
                  </div>
                ))}
              </div>
            )}
            {!produtos.length && <div style={{ fontSize:12, color:'#d97706', marginTop:4 }}>Nenhum produto cadastrado. <a href="/produtos" style={{ color:'#1d4ed8' }}>Cadastre produtos primeiro.</a></div>}
          </div>
          <div className="form-grid">
            <div className="form-row"><label>Categoria</label>
              <select value={form.categoria} onChange={f('categoria')}>
                <option value="">Selecione...</option>
                {categoriasDB.map(cat => <option key={cat.id}>{cat.nome}</option>)}
              </select>
            </div>
            <div className="form-row"><label>Custo unitário (R$)</label>
              <input type="number" step="0.01" value={form.custo_unitario} onChange={f('custo_unitario')} placeholder="0,00" />
            </div>
            <div className="form-row"><label>Quantidade inicial</label>
              <input type="number" value={form.quantidade} onChange={f('quantidade')} placeholder="0" />
            </div>
            <div className="form-row"><label>Unidade</label>
              <input value={form.unidade} onChange={f('unidade')} placeholder="un, cx, pct..." />
            </div>
          </div>
          <div className="form-row" style={{ marginTop:4 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
              <input type="checkbox" checked={form.inventario} onChange={e => setForm({ ...form, inventario: e.target.checked })} style={{ accentColor:'#7c3aed' }} />
              <span>Marcar como <strong style={{ color:'#7c3aed' }}>inventário</strong></span>
            </label>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>

      {/* Modal entrada */}
      <div className={`modal-overlay${modalEntrada ? ' open' : ''}`}>
        <div className="modal" style={{ width:420 }}>
          <h3>Entrada de estoque</h3>
          <p style={{ fontSize:13, color:'#888', marginBottom:16 }}>
            Produto: <strong>{modalEntrada ? nomeItem(modalEntrada) : ''}</strong>
            {modalEntrada && corItem(modalEntrada) && <span style={{ color:'#888' }}> — {corItem(modalEntrada)}</span>}
            {modalEntrada && tamItem(modalEntrada) && <span style={{ color:'#888' }}> {tamItem(modalEntrada)}</span>}
          </p>

          {/* indicadores de custo atual */}
          {modalEntrada && (modalEntrada.custo_medio > 0 || modalEntrada.ultimo_custo > 0) && (
            <div style={{ display:'flex', gap:12, marginBottom:16 }}>
              {modalEntrada.custo_medio > 0 && (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'8px 14px', flex:1 }}>
                  <div style={{ fontSize:11, color:'#16a34a', marginBottom:2 }}>Custo médio atual</div>
                  <div style={{ fontWeight:600, color:'#16a34a' }}>R$ {modalEntrada.custo_medio?.toFixed(2).replace('.',',')}</div>
                </div>
              )}
              {modalEntrada.ultimo_custo > 0 && (
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 14px', flex:1 }}>
                  <div style={{ fontSize:11, color:'#d97706', marginBottom:2 }}>Último custo</div>
                  <div style={{ fontWeight:600, color:'#d97706' }}>R$ {modalEntrada.ultimo_custo?.toFixed(2).replace('.',',')}</div>
                </div>
              )}
            </div>
          )}

          <div className="form-grid">
            <div className="form-row">
              <label>Quantidade a adicionar</label>
              <input type="number" min="1" value={entQtd} onChange={e => setEntQtd(e.target.value)} placeholder="0" autoFocus />
            </div>
            <div className="form-row">
              <label>Custo unitário (R$)</label>
              <input type="number" min="0" step="0.01" value={entCusto} onChange={e => setEntCusto(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {/* prévia do novo custo médio */}
          {entQtd && entCusto && modalEntrada && (() => {
            const n = parseInt(entQtd) || 0
            const novoCusto = parseFloat(entCusto) || 0
            const qtdAtual = modalEntrada.quantidade || 0
            const novaQtd = qtdAtual + n
            const custoMedioAnt = modalEntrada.custo_medio || modalEntrada.custo_unitario || 0
            const novoMedio = qtdAtual > 0
              ? ((qtdAtual * custoMedioAnt) + (n * novoCusto)) / novaQtd
              : novoCusto
            return (
              <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13 }}>
                <div style={{ color:'#1d4ed8', fontWeight:500, marginBottom:4 }}>Prévia após entrada</div>
                <div style={{ display:'flex', gap:20, color:'#555' }}>
                  <span>Estoque: <strong>{qtdAtual} → {novaQtd}</strong></span>
                  <span>Novo custo médio: <strong style={{ color:'#16a34a' }}>R$ {novoMedio.toFixed(2).replace('.',',')}</strong></span>
                </div>
              </div>
            )
          })()}

          <div className="modal-footer">
            <button className="btn" onClick={() => { setModalEntrada(null); setEntCusto('') }}>Cancelar</button>
            <button className="btn btn-primary" onClick={entrada} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar entrada'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
