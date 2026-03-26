import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR } from '../lib/utils'

function tag(node, name) {
  const el = node.getElementsByTagName(name)[0]
  return el ? el.textContent.trim() : ''
}
function limparEan(v) {
  return (v || '').replace(/\D/g, '')
}
function normalizeUnidade(u) {
  const m = { UN:'un', UNID:'un', PC:'un', CX:'cx', PCT:'pct',
    KG:'kg', G:'g', L:'l', ML:'ml', MT:'m', M:'m', PAR:'par', RESMA:'resma' }
  return m[u?.toUpperCase()] || u?.toLowerCase() || 'un'
}
function inferCategoria(nome) {
  const n = (nome||'').toLowerCase()
  if (/papel|resma|caderno|bloco|fichario|pasta/.test(n)) return 'Escritório'
  if (/detergente|sabao|sabão|desinfetante|limpeza|vassoura|rodo|pano/.test(n)) return 'Limpeza'
  if (/bola|rede|cone|colchonete|esporte/.test(n)) return 'Esportivo'
  return 'Material escolar'
}

export default function ImportarNFe() {
  const [tabAtiva, setTabAtiva]         = useState('importar')
  const [etapa, setEtapa]               = useState('upload')   // upload | previa | confirmando | sucesso
  const [nfInfo, setNfInfo]             = useState(null)
  const [linhas, setLinhas]             = useState([])
  const [selecionados, setSelecionados] = useState({})
  const [saving, setSaving]             = useState(false)
  const [erro, setErro]                 = useState('')
  const [resultado, setResultado]       = useState(null)
  const [notas, setNotas]               = useState([])
  const [loadingNotas, setLoadingNotas] = useState(false)
  const [desfazendoId, setDesfazendoId] = useState(null)

  // ── estado do step de confirmação item a item ──
  const [stepIdx, setStepIdx]           = useState(0)    // índice do item atual
  const [stepLinhas, setStepLinhas]     = useState([])   // cópia das linhas para editar no step
  const [stepQtd, setStepQtd]           = useState(1)    // qtd editável no popup
  const [stepCat, setStepCat]           = useState('')   // categoria editável no popup
  const [stepPular, setStepPular]       = useState(false)// pular este item

  const fileRef = useRef()

  useEffect(() => { if (tabAtiva === 'historico') carregarNotas() }, [tabAtiva])

  async function carregarNotas() {
    setLoadingNotas(true)
    const { data } = await supabase.from('nfe_importacoes').select('*').order('created_at', { ascending: false })
    setNotas(data || [])
    setLoadingNotas(false)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xml')) { setErro('Selecione um arquivo .xml de NF-e'); return }
    setErro('')
    const reader = new FileReader()
    reader.onload = ev => lerXML(ev.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  async function lerXML(xmlStr) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlStr, 'application/xml')
      if (doc.querySelector('parsererror')) { setErro('Arquivo XML inválido.'); return }

      const ide  = doc.getElementsByTagName('ide')[0]
      const emit = doc.getElementsByTagName('emit')[0]
      setNfInfo({
        numero:      tag(ide, 'nNF'),
        serie:       tag(ide, 'serie'),
        dataEmissao: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).split('T')[0] || null,
        emitente:    tag(emit, 'xNome'),
        cnpj:        tag(emit, 'CNPJ'),
      })

      const dets = doc.getElementsByTagName('det')
      if (!dets.length) { setErro('Nenhum produto encontrado na NF-e.'); return }

      const { data: produtosDB } = await supabase.from('produtos').select('id, nome, codigo_barras, cor, tamanho')
      const { data: estoqueDB }  = await supabase.from('estoque').select('id, nome, quantidade, custo_unitario, produto_id, codigo_barras')

      const novasLinhas = []
      for (const det of dets) {
        const prod    = det.getElementsByTagName('prod')[0]
        const nome    = tag(prod, 'xProd')
        const qtd     = parseFloat(tag(prod, 'qCom').replace(',', '.')) || 0
        const custo   = parseFloat(tag(prod, 'vUnCom').replace(',', '.')) || 0
        const unidade = normalizeUnidade(tag(prod, 'uCom'))
        const ean     = limparEan(tag(prod, 'cEAN'))

        const produto = ean ? (produtosDB||[]).find(p => p.codigo_barras === ean) : null

        let itemEstoque = null
        if (produto) {
          itemEstoque = (estoqueDB||[]).find(i => i.produto_id === produto.id)
          if (!itemEstoque) {
            itemEstoque = (estoqueDB||[]).find(i =>
              (i.nome||'').toLowerCase().trim() === (produto.nome||'').toLowerCase().trim()
            )
          }
        }
        if (!itemEstoque && ean) {
          itemEstoque = (estoqueDB||[]).find(i => i.codigo_barras === ean)
        }
        if (!itemEstoque) {
          itemEstoque = (estoqueDB||[]).find(i =>
            (i.nome||'').toLowerCase().trim() === nome.toLowerCase().trim()
          )
        }

        novasLinhas.push({
          nome, qtd, custo, unidade, ean,
          categoria:   inferCategoria(nome),
          produto,
          itemEstoque,
          pular: false,  // flag para pular este item
        })
      }

      setLinhas(novasLinhas)
      const sel = {}; novasLinhas.forEach((_, i) => sel[i] = true)
      setSelecionados(sel)
      setEtapa('previa')
    } catch (e) {
      setErro('Erro ao processar XML: ' + e.message)
    }
  }

  // ── inicia o step de confirmação item a item ──
  function iniciarConfirmacao() {
    const lista = linhas.filter((_, i) => selecionados[i])
    if (!lista.length) { alert('Selecione pelo menos um item'); return }
    // cópia das linhas selecionadas para o step
    const copia = linhas
      .map((l, i) => ({ ...l, idxOriginal: i, selecionado: !!selecionados[i] }))
      .filter(l => l.selecionado)
    setStepLinhas(copia)
    setStepIdx(0)
    setStepQtd(copia[0].qtd)
    setStepCat(copia[0].categoria)
    setStepPular(false)
    setEtapa('confirmando')
  }

  // ── avança para próximo item no step ──
  function stepProximo(pular = false) {
    // salva o estado atual do item
    setStepLinhas(prev => prev.map((l, i) => {
      if (i !== stepIdx) return l
      return { ...l, qtd: pular ? 0 : stepQtd, categoria: stepCat, pular }
    }))

    const proximo = stepIdx + 1
    if (proximo >= stepLinhas.length) {
      // todos confirmados — vai para commit
      const linhasFinais = stepLinhas.map((l, i) => {
        if (i === stepIdx) return { ...l, qtd: pular ? 0 : stepQtd, categoria: stepCat, pular }
        return l
      }).filter(l => !l.pular)
      commitarNoEstoque(linhasFinais)
    } else {
      setStepIdx(proximo)
      setStepQtd(stepLinhas[proximo].qtd)
      setStepCat(stepLinhas[proximo].categoria)
      setStepPular(false)
    }
  }

  function stepAnterior() {
    if (stepIdx === 0) { setEtapa('previa'); return }
    const ant = stepIdx - 1
    setStepIdx(ant)
    setStepQtd(stepLinhas[ant].qtd)
    setStepCat(stepLinhas[ant].categoria)
    setStepPular(false)
  }

  // ── commit final no banco ──
  async function commitarNoEstoque(linhasConfirmadas) {
    setSaving(true)
    let qtdCadastrados = 0, qtdAtualizados = 0, qtdErros = 0
    const log = []

    for (const linha of linhasConfirmadas) {
      try {
        const nomeItem = (linha.nome || '').trim()
        const ean      = linha.ean || ''

        // A: garante produto
        let produtoId = linha.produto?.id || null
        if (!produtoId && ean) {
          const { data: novoProd, error: errP } = await supabase
            .from('produtos')
            .insert({ codigo_barras: ean, nome: nomeItem, ativo: true, categoria: linha.categoria })
            .select('id').single()
          if (errP) throw new Error('Produto: ' + errP.message)
          produtoId = novoProd.id
        }

        // B: busca estoque fresco
        let itemEstoqueAtual = linha.itemEstoque
        if (!itemEstoqueAtual && produtoId) {
          const { data: f } = await supabase.from('estoque').select('id,quantidade,produto_id').eq('produto_id', produtoId).maybeSingle()
          if (f) itemEstoqueAtual = f
        }
        if (!itemEstoqueAtual && ean) {
          const { data: f } = await supabase.from('estoque').select('id,quantidade,produto_id').eq('codigo_barras', ean).maybeSingle()
          if (f) itemEstoqueAtual = f
        }

        if (itemEstoqueAtual) {
          const novaQtd = (itemEstoqueAtual.quantidade || 0) + linha.qtd
          const payload = { quantidade: novaQtd, custo_unitario: linha.custo }
          if (produtoId && !itemEstoqueAtual.produto_id) payload.produto_id = produtoId
          const { error: errU } = await supabase.from('estoque').update(payload).eq('id', itemEstoqueAtual.id)
          if (errU) throw new Error('Update: ' + errU.message)
          log.push({ id: itemEstoqueAtual.id, nome: nomeItem, qtd: linha.qtd, tipo: 'entrada' })
          qtdAtualizados++
        } else {
          const { data: novo, error: errI } = await supabase.from('estoque').insert({
            produto_id: produtoId, nome: nomeItem, categoria: linha.categoria,
            custo_unitario: linha.custo, quantidade: linha.qtd,
            unidade: linha.unidade, codigo_barras: ean || null,
          }).select('id').single()
          if (errI) throw new Error('Insert: ' + errI.message)
          log.push({ id: novo.id, nome: nomeItem, qtd: linha.qtd, tipo: 'cadastro' })
          qtdCadastrados++
        }
      } catch (e) {
        console.error('[NF-e] erro:', linha.nome, e.message)
        qtdErros++
      }
    }

    await supabase.from('nfe_importacoes').insert({
      numero: nfInfo?.numero, serie: nfInfo?.serie,
      emitente: nfInfo?.emitente, cnpj: nfInfo?.cnpj,
      data_emissao: nfInfo?.dataEmissao || null,
      itens_json: JSON.stringify(log),
      itens_cadastrados: qtdCadastrados,
      itens_atualizados: qtdAtualizados,
    })

    setSaving(false)
    setResultado({ cadastrados: qtdCadastrados, atualizados: qtdAtualizados, erros: qtdErros, log })
    setEtapa('sucesso')
  }

  async function desfazerNota(nota) {
    if (!window.confirm(`Desfazer a importação da NF ${nota.numero}?\n\nAs quantidades adicionadas serão subtraídas do estoque.`)) return
    setDesfazendoId(nota.id)
    try {
      const estoqueLog = JSON.parse(nota.itens_json || '[]')
      for (const it of estoqueLog) {
        const { data: item } = await supabase.from('estoque').select('quantidade').eq('id', it.id).single()
        if (!item) continue
        await supabase.from('estoque').update({ quantidade: Math.max(0, item.quantidade - it.qtd) }).eq('id', it.id)
        await supabase.from('movimentacoes').insert({
          item_id: it.id, item_nome: it.nome, tipo: 'ajuste', quantidade: it.qtd,
          observacoes: `Estorno NF-e ${nota.numero}`,
        })
      }
      await supabase.from('nfe_importacoes').update({ desfeita: true, desfeita_em: new Date().toISOString() }).eq('id', nota.id)
      carregarNotas()
    } catch (e) { alert('Erro ao desfazer: ' + e.message) }
    setDesfazendoId(null)
  }

  function reiniciar() {
    setEtapa('upload'); setLinhas([]); setNfInfo(null)
    setSelecionados({}); setErro(''); setResultado(null)
    setStepIdx(0); setStepLinhas([])
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalSel = Object.values(selecionados).filter(Boolean).length

  // ── item atual no step ──
  const itemAtual = stepLinhas[stepIdx]
  const jaTemEstoque = !!itemAtual?.itemEstoque
  const qtdAtual = itemAtual?.itemEstoque?.quantidade ?? 0

  return (
    <div>
      <div className="page-header"><div className="page-title">NF-e</div></div>
      <div className="tabs">
        <div className={`tab${tabAtiva==='importar'?' active':''}`} onClick={() => setTabAtiva('importar')}>Importar NF-e</div>
        <div className={`tab${tabAtiva==='historico'?' active':''}`} onClick={() => setTabAtiva('historico')}>Notas importadas</div>
      </div>

      {tabAtiva === 'importar' && (
        <>
          {/* ── UPLOAD ── */}
          {etapa === 'upload' && (
            <div style={{ maxWidth:560 }}>
              <div className="alert alert-info" style={{ marginBottom:20 }}>
                Importe uma NF-e em XML. Você revisará cada item antes de confirmar a entrada no estoque.
              </div>
              {erro && <div className="alert alert-danger">{erro}</div>}
              <div className="card">
                <div style={{ border:'2px dashed #d1d5db', borderRadius:10, padding:'40px 24px', textAlign:'center', cursor:'pointer' }}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor='#d1d5db' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='#d1d5db'; const f=e.dataTransfer.files[0]; if(f) handleFile({target:{files:[f]}}) }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📄</div>
                  <div style={{ fontWeight:500, marginBottom:6 }}>Clique ou arraste o arquivo XML aqui</div>
                  <div style={{ fontSize:12, color:'#888' }}>Apenas arquivos .xml de NF-e</div>
                  <input ref={fileRef} type="file" accept=".xml" style={{ display:'none' }} onChange={handleFile} />
                </div>
              </div>
            </div>
          )}

          {/* ── PRÉVIA GERAL ── */}
          {etapa === 'previa' && (
            <>
              {nfInfo && (
                <div className="card" style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:16 }}>
                  <div><div style={{ fontSize:11, color:'#888' }}>Emitente</div><div style={{ fontWeight:500 }}>{nfInfo.emitente}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>CNPJ</div><div style={{ fontWeight:500 }}>{nfInfo.cnpj}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>NF / Série</div><div style={{ fontWeight:500 }}>{nfInfo.numero} / {nfInfo.serie}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>Emissão</div><div style={{ fontWeight:500 }}>{nfInfo.dataEmissao ? new Date(nfInfo.dataEmissao+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                </div>
              )}
              <div className="cards-grid" style={{ marginBottom:16 }}>
                <div className="metric-card"><div className="metric-label">Itens na nota</div><div className="metric-value">{linhas.length}</div></div>
                <div className="metric-card"><div className="metric-label">Selecionados</div><div className="metric-value blue">{totalSel}</div></div>
                <div className="metric-card"><div className="metric-label">Novos</div><div className="metric-value green">{linhas.filter((l,i)=>selecionados[i]&&!l.itemEstoque).length}</div></div>
                <div className="metric-card"><div className="metric-label">Entradas</div><div className="metric-value yellow">{linhas.filter((l,i)=>selecionados[i]&&l.itemEstoque).length}</div></div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, gap:8, flexWrap:'wrap' }}>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-sm" onClick={() => { const s={}; linhas.forEach((_,i)=>s[i]=true); setSelecionados(s) }}>Selecionar todos</button>
                  <button className="btn btn-sm" onClick={() => setSelecionados({})}>Desmarcar todos</button>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-sm" onClick={reiniciar}>← Voltar</button>
                  <button className="btn btn-primary btn-sm" onClick={iniciarConfirmacao} disabled={!totalSel}>
                    Revisar e confirmar ({totalSel}) →
                  </button>
                </div>
              </div>
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width:36 }}>
                        <input type="checkbox" checked={totalSel===linhas.length}
                          onChange={e => { const s={}; linhas.forEach((_,i)=>s[i]=e.target.checked); setSelecionados(s) }}
                          style={{ accentColor:'#1d4ed8' }} />
                      </th>
                      <th>Produto (NF-e)</th><th>EAN</th><th>Qtd NF</th><th>Custo unit.</th><th>Unid.</th><th>Situação</th><th>Estoque atual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, i) => {
                      const jaExiste = !!linha.itemEstoque
                      let situacao, cls
                      if (linha.produto && jaExiste) { situacao='Entrada — produto existente'; cls='badge-warning' }
                      else if (linha.produto && !jaExiste) { situacao='Novo estoque — produto existente'; cls='badge-info' }
                      else if (!linha.produto && linha.ean) { situacao='Novo produto + estoque'; cls='badge-success' }
                      else { situacao='Novo estoque (sem EAN)'; cls='badge-neutral' }
                      return (
                        <tr key={i} style={{ opacity:selecionados[i]?1:0.4 }}>
                          <td><input type="checkbox" checked={!!selecionados[i]} onChange={() => setSelecionados(s=>({...s,[i]:!s[i]}))} style={{ accentColor:'#1d4ed8' }} /></td>
                          <td>
                            <strong style={{ fontWeight:500 }}>{linha.nome}</strong>
                            {linha.produto?.cor    && <span style={{ marginLeft:6, fontSize:11, color:'#888' }}>{linha.produto.cor}</span>}
                            {linha.produto?.tamanho && <span style={{ marginLeft:4, fontSize:11, color:'#888' }}>{linha.produto.tamanho}</span>}
                          </td>
                          <td>{linha.ean ? <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'2px 6px', borderRadius:4 }}>{linha.ean}</span> : <span style={{ color:'#ccc' }}>—</span>}</td>
                          <td style={{ fontWeight:500 }}>{linha.qtd} {linha.unidade}</td>
                          <td>{fmtR(linha.custo)}</td>
                          <td>{linha.unidade}</td>
                          <td><span className={`badge ${cls}`}>{situacao}</span></td>
                          <td style={{ fontSize:12 }}>{jaExiste ? linha.itemEstoque.quantidade : <span style={{ color:'#aaa' }}>—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── STEP DE CONFIRMAÇÃO ITEM A ITEM ── */}
          {etapa === 'confirmando' && itemAtual && (
            <div style={{ maxWidth:560 }}>
              {/* barra de progresso */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#888', marginBottom:6 }}>
                  <span>Revisando item {stepIdx+1} de {stepLinhas.length}</span>
                  <span>{Math.round(((stepIdx)/stepLinhas.length)*100)}% concluído</span>
                </div>
                <div style={{ height:6, background:'#e8e8e5', borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', background:'#1d4ed8', borderRadius:4, width:`${((stepIdx)/stepLinhas.length)*100}%`, transition:'width 0.3s' }} />
                </div>
                {/* mini lista de progresso */}
                <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                  {stepLinhas.map((l, i) => (
                    <div key={i} style={{
                      width:24, height:24, borderRadius:'50%', fontSize:11,
                      display:'flex', alignItems:'center', justifyContent:'center', fontWeight:500,
                      background: l.pular ? '#fee2e2' : i < stepIdx ? '#dcfce7' : i === stepIdx ? '#1d4ed8' : '#f5f5f3',
                      color: l.pular ? '#dc2626' : i < stepIdx ? '#16a34a' : i === stepIdx ? '#fff' : '#888',
                      border: i === stepIdx ? '2px solid #1d4ed8' : '1px solid #e8e8e5',
                    }}>
                      {l.pular ? '✕' : i < stepIdx ? '✓' : i+1}
                    </div>
                  ))}
                </div>
              </div>

              {/* card do item atual */}
              <div className="card" style={{ marginBottom:16 }}>
                {/* cabeçalho do item */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>
                      {itemAtual.produto ? '✓ Produto cadastrado' : '+ Novo produto será criado'}
                    </div>
                    <div style={{ fontSize:16, fontWeight:600 }}>{itemAtual.nome}</div>
                    {itemAtual.produto?.cor    && <span style={{ fontSize:12, color:'#888' }}>{itemAtual.produto.cor}</span>}
                    {itemAtual.produto?.tamanho && <span style={{ fontSize:12, color:'#888', marginLeft:6 }}>{itemAtual.produto.tamanho}</span>}
                  </div>
                  {itemAtual.ean && (
                    <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'3px 8px', borderRadius:4, color:'#888' }}>
                      {itemAtual.ean}
                    </span>
                  )}
                </div>

                {/* situação do estoque atual */}
                {jaTemEstoque && (
                  <div style={{ background:'#f5f5f3', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'flex', gap:24, fontSize:13 }}>
                    <div><span style={{ color:'#888' }}>Estoque atual: </span><strong>{qtdAtual} {itemAtual.unidade}</strong></div>
                    <div><span style={{ color:'#888' }}>Após entrada: </span><strong style={{ color:'#16a34a' }}>{qtdAtual + (parseInt(stepQtd)||0)} {itemAtual.unidade}</strong></div>
                    <div><span style={{ color:'#888' }}>Custo atual: </span><strong>{fmtR(itemAtual.itemEstoque?.custo_unitario||0)}</strong></div>
                  </div>
                )}
                {!jaTemEstoque && (
                  <div style={{ background:'#eff6ff', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#1d4ed8' }}>
                    Este item será criado no estoque com a quantidade informada.
                  </div>
                )}

                {/* campos editáveis */}
                <div className="form-grid">
                  <div className="form-row">
                    <label>
                      Quantidade a creditar
                      <span style={{ fontSize:11, color:'#888', marginLeft:6 }}>(NF-e: {itemAtual.qtd} {itemAtual.unidade})</span>
                    </label>
                    <input
                      type="number" min="0"
                      value={stepQtd}
                      onChange={e => setStepQtd(Math.max(0, parseInt(e.target.value)||0))}
                      style={{ fontSize:18, fontWeight:600, textAlign:'center' }}
                      autoFocus
                    />
                  </div>
                  <div className="form-row">
                    <label>Custo unitário</label>
                    <input
                      type="number" step="0.01"
                      value={itemAtual.custo}
                      onChange={e => setStepLinhas(prev => prev.map((l,i) => i===stepIdx ? {...l, custo: parseFloat(e.target.value)||0} : l))}
                      style={{ textAlign:'center' }}
                    />
                  </div>
                </div>
                {!jaTemEstoque && (
                  <div className="form-row">
                    <label>Categoria</label>
                    <select value={stepCat} onChange={e => setStepCat(e.target.value)}>
                      <option>Material escolar</option>
                      <option>Limpeza</option>
                      <option>Escritório</option>
                      <option>Esportivo</option>
                      <option>Outro</option>
                    </select>
                  </div>
                )}
              </div>

              {/* ações do step */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <button className="btn" onClick={stepAnterior}>
                  ← {stepIdx===0 ? 'Voltar à lista' : 'Anterior'}
                </button>
                <div style={{ display:'flex', gap:8 }}>
                  <button
                    className="btn btn-danger"
                    onClick={() => stepProximo(true)}
                    style={{ fontSize:13 }}>
                    Pular este item
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => stepProximo(false)}
                    disabled={saving}
                    style={{ minWidth:140 }}>
                    {saving
                      ? 'Salvando...'
                      : stepIdx === stepLinhas.length - 1
                      ? '✓ Confirmar e finalizar'
                      : `Confirmar e avançar →`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── SUCESSO ── */}
          {etapa === 'sucesso' && resultado && (
            <div style={{ maxWidth:520 }}>
              <div className="card" style={{ textAlign:'center', padding:'32px 24px' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
                <h3 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Importação concluída!</h3>
                <p style={{ color:'#888', fontSize:13, marginBottom:24 }}>Estoque atualizado com sucesso.</p>
                <div className="cards-grid" style={{ marginBottom:24 }}>
                  <div className="metric-card"><div className="metric-label">Novos no estoque</div><div className="metric-value green">{resultado.cadastrados}</div></div>
                  <div className="metric-card"><div className="metric-label">Entradas realizadas</div><div className="metric-value yellow">{resultado.atualizados}</div></div>
                  {resultado.erros > 0 && <div className="metric-card"><div className="metric-label">Erros</div><div className="metric-value red">{resultado.erros}</div></div>}
                </div>
                {resultado.log?.length > 0 && (
                  <div style={{ textAlign:'left', borderTop:'1px solid #e8e8e5', paddingTop:16 }}>
                    <div style={{ fontSize:12, color:'#888', marginBottom:8, fontWeight:500 }}>Itens processados:</div>
                    <div style={{ maxHeight:200, overflowY:'auto' }}>
                      {resultado.log.map((l,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #f5f5f3', fontSize:13 }}>
                          <span>{l.nome}</span>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <span style={{ color:'#16a34a', fontWeight:500 }}>+{l.qtd}</span>
                            <span className={`badge ${l.tipo==='entrada'?'badge-warning':'badge-success'}`}>{l.tipo}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:20 }}>
                  <button className="btn" onClick={reiniciar}>Importar outra NF-e</button>
                  <button className="btn btn-primary" onClick={() => setTabAtiva('historico')}>Ver notas importadas</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── HISTÓRICO ── */}
      {tabAtiva === 'historico' && (
        loadingNotas ? <div className="loading">Carregando...</div> : (
          <div className="card">
            <table>
              <thead>
                <tr><th>NF / Série</th><th>Emitente</th><th>CNPJ</th><th>Data emissão</th><th>Importado em</th><th>Novos</th><th>Entradas</th><th>Status</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {notas.map(nota => (
                  <tr key={nota.id} style={{ opacity: nota.desfeita ? 0.5 : 1 }}>
                    <td><strong style={{ fontWeight:500 }}>{nota.numero} / {nota.serie}</strong></td>
                    <td>{nota.emitente}</td>
                    <td style={{ fontSize:12, color:'#888' }}>{nota.cnpj}</td>
                    <td>{fmtData(nota.data_emissao)}</td>
                    <td style={{ fontSize:12, color:'#888' }}>{nota.created_at ? new Date(nota.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td><span className="badge badge-success">{nota.itens_cadastrados}</span></td>
                    <td><span className="badge badge-warning">{nota.itens_atualizados}</span></td>
                    <td>{nota.desfeita ? <span className="badge badge-neutral">Desfeita</span> : <span className="badge badge-success">Ativa</span>}</td>
                    <td>
                      {!nota.desfeita && (
                        <button className="btn btn-sm btn-danger" disabled={desfazendoId===nota.id} onClick={() => desfazerNota(nota)}>
                          {desfazendoId===nota.id ? 'Desfazendo...' : 'Desfazer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!notas.length && <tr><td colSpan={9} className="empty">Nenhuma NF-e importada ainda</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
