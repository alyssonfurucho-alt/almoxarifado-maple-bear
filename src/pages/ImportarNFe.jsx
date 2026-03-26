import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR } from '../lib/utils'

// ── helpers XML ──────────────────────────────────────────────
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

// ── componente ───────────────────────────────────────────────
export default function ImportarNFe() {
  const [tabAtiva, setTabAtiva]           = useState('importar')
  const [etapa, setEtapa]                 = useState('upload')
  const [nfInfo, setNfInfo]               = useState(null)
  const [linhas, setLinhas]               = useState([])      // estoque da prévia
  const [selecionados, setSelecionados]   = useState({})
  const [saving, setSaving]               = useState(false)
  const [erro, setErro]                   = useState('')
  const [resultado, setResultado]         = useState(null)
  const [notas, setNotas]                 = useState([])
  const [loadingNotas, setLoadingNotas]   = useState(false)
  const [desfazendoId, setDesfazendoId]   = useState(null)
  const fileRef = useRef()

  useEffect(() => { if (tabAtiva === 'historico') carregarNotas() }, [tabAtiva])

  async function carregarNotas() {
    setLoadingNotas(true)
    const { data } = await supabase.from('nfe_importacoes').select('*').order('created_at', { ascending: false })
    setNotas(data || [])
    setLoadingNotas(false)
  }

  // ── leitura do arquivo ──
  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xml')) { setErro('Selecione um arquivo .xml de NF-e'); return }
    setErro('')
    const reader = new FileReader()
    reader.onload = ev => lerXML(ev.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  // ── leitura do XML + montagem da prévia ──
  async function lerXML(xmlStr) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlStr, 'application/xml')
      if (doc.querySelector('parsererror')) { setErro('Arquivo XML inválido.'); return }

      // dados da nota
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

      // busca produtos e estoque existentes no banco
      const { data: produtosDB } = await supabase
        .from('produtos').select('id, nome, codigo_barras, cor, tamanho')
      const { data: estoqueDB } = await supabase
        .from('estoque').select('id, nome, quantidade, custo_unitario, produto_id, codigo_barras')

      const novasLinhas = []
      for (const det of dets) {
        const prod    = det.getElementsByTagName('prod')[0]
        const nome    = tag(prod, 'xProd')
        const qtd     = parseFloat(tag(prod, 'qCom').replace(',', '.')) || 0
        const custo   = parseFloat(tag(prod, 'vUnCom').replace(',', '.')) || 0
        const unidade = normalizeUnidade(tag(prod, 'uCom'))
        const ean     = limparEan(tag(prod, 'cEAN'))  // só números, sem 'SEM GTIN'

        // cruza produto pelo EAN
        const produto = ean ? (produtosDB||[]).find(p => p.codigo_barras === ean) : null

        // cruza item de estoque pelo produto_id → EAN → nome do produto → nome do item
        let itemEstoque = null
        if (produto) {
          // busca pelo produto_id primeiro
          itemEstoque = (estoqueDB||[]).find(i => i.produto_id === produto.id)
          // busca pelo nome do produto cadastrado
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
          nome,
          qtd,
          custo,
          unidade,
          ean,
          categoria:       inferCategoria(nome),
          produto,         // registro em produtos (ou null)
          itemEstoque,     // registro em itens (ou null)
        })
      }

      setLinhas(novasLinhas)
      const sel = {}
      novasLinhas.forEach((_, i) => sel[i] = true)
      setSelecionados(sel)
      setEtapa('previa')
    } catch (e) {
      setErro('Erro ao processar XML: ' + e.message)
    }
  }

  // ── confirmação: persiste no banco ──
  async function confirmar() {
    const lista = linhas.filter((_, i) => selecionados[i])
    if (!lista.length) { alert('Selecione pelo menos um item'); return }

    setSaving(true)
    let qtdCadastrados = 0
    let qtdAtualizados = 0
    let qtdErros       = 0
    const log = []

    for (const linha of lista) {
      try {
        const nomeItem = (linha.nome || '').trim()
        const ean      = linha.ean || ''

        // ── A: garante produto na tabela produtos ──────────────────
        let produtoId = linha.produto?.id || null

        if (!produtoId && ean) {
          // produto não existe → cria
          const { data: novoProd, error: errP } = await supabase
            .from('produtos')
            .insert({ codigo_barras: ean, nome: nomeItem, ativo: true })
            .select('id')
            .single()
          if (errP) throw new Error('Produto: ' + errP.message)
          produtoId = novoProd.id
        }

        // ── B: atualiza ou cria item de estoque ────────────────────
        // Busca fresca no banco pelo produto_id para garantir dados atuais
        let itemEstoqueAtual = linha.itemEstoque
        if (!itemEstoqueAtual && produtoId) {
          const { data: found } = await supabase
            .from('estoque')
            .select('id, quantidade, produto_id')
            .eq('produto_id', produtoId)
            .maybeSingle()
          if (found) itemEstoqueAtual = found
        }
        if (!itemEstoqueAtual && linha.ean) {
          const { data: found } = await supabase
            .from('estoque')
            .select('id, quantidade, produto_id')
            .eq('codigo_barras', linha.ean)
            .maybeSingle()
          if (found) itemEstoqueAtual = found
        }

        if (itemEstoqueAtual) {
          // item já existe → atualiza quantidade e custo
          const novaQtd = (itemEstoqueAtual.quantidade || 0) + linha.qtd

          const payload = {
            quantidade:     novaQtd,
            custo_unitario: linha.custo,
          }
          // vincula ao produto se ainda não estiver vinculado
          if (produtoId && !itemEstoqueAtual.produto_id) {
            payload.produto_id = produtoId
          }

          const { error: errU } = await supabase
            .from('estoque')
            .update(payload)
            .eq('id', itemEstoqueAtual.id)

          if (errU) throw new Error('Update estoque: ' + errU.message)

          log.push({ id: itemEstoqueAtual.id, nome: nomeItem, qtd: linha.qtd, tipo: 'entrada' })
          qtdAtualizados++

        } else {
          // item não existe → cria
          const { data: novoEstoque, error: errI } = await supabase
            .from('estoque')
            .insert({
              produto_id:     produtoId,
              nome:           nomeItem,
              categoria:      linha.categoria,
              custo_unitario: linha.custo,
              quantidade:     linha.qtd,
              unidade:        linha.unidade,
              codigo_barras:  ean || null,
            })
            .select('id')
            .single()

          if (errI) throw new Error('Insert estoque: ' + errI.message)

          log.push({ id: novoEstoque.id, nome: nomeItem, qtd: linha.qtd, tipo: 'cadastro' })
          qtdCadastrados++
        }

      } catch (e) {
        console.error('[NF-e] erro em item:', linha.nome, e.message)
        qtdErros++
      }
    }

    // registra a NF no histórico
    await supabase.from('nfe_importacoes').insert({
      numero:            nfInfo?.numero,
      serie:             nfInfo?.serie,
      emitente:          nfInfo?.emitente,
      cnpj:              nfInfo?.cnpj,
      data_emissao:      nfInfo?.dataEmissao || null,
      itens_json:        JSON.stringify(log),
      itens_cadastrados: qtdCadastrados,
      itens_atualizados: qtdAtualizados,
    })

    setSaving(false)
    setResultado({ cadastrados: qtdCadastrados, atualizados: qtdAtualizados, erros: qtdErros, log })
    setEtapa('sucesso')
  }

  // ── desfazer importação ──
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
          item_id: it.id, item_nome: it.nome,
          tipo: 'ajuste', quantidade: it.qtd,
          observacoes: `Estorno NF-e ${nota.numero}`,
        })
      }
      await supabase.from('nfe_importacoes')
        .update({ desfeita: true, desfeita_em: new Date().toISOString() })
        .eq('id', nota.id)
      carregarNotas()
    } catch (e) { alert('Erro ao desfazer: ' + e.message) }
    setDesfazendoId(null)
  }

  function reiniciar() {
    setEtapa('upload'); setLinhas([]); setNfInfo(null)
    setSelecionados({}); setErro(''); setResultado(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalSel = Object.values(selecionados).filter(Boolean).length

  // ── render ──
  return (
    <div>
      <div className="page-header"><div className="page-title">NF-e</div></div>
      <div className="tabs">
        <div className={`tab${tabAtiva==='importar'?' active':''}`} onClick={() => setTabAtiva('importar')}>Importar NF-e</div>
        <div className={`tab${tabAtiva==='historico'?' active':''}`} onClick={() => setTabAtiva('historico')}>Notas importadas</div>
      </div>

      {/* ══ IMPORTAR ══ */}
      {tabAtiva === 'importar' && (
        <>
          {/* upload */}
          {etapa === 'upload' && (
            <div style={{ maxWidth: 560 }}>
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                Importe uma NF-e em XML. O sistema cruza o EAN com a tabela de produtos,
                cria o produto se necessário e dá entrada no estoque automaticamente.
              </div>
              {erro && <div className="alert alert-danger">{erro}</div>}
              <div className="card">
                <div
                  style={{ border:'2px dashed #d1d5db', borderRadius:10, padding:'40px 24px', textAlign:'center', cursor:'pointer' }}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor='#d1d5db' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='#d1d5db'; const f=e.dataTransfer.files[0]; if(f) handleFile({target:{files:[f]}}) }}
                >
                  <div style={{ fontSize:36, marginBottom:12 }}>📄</div>
                  <div style={{ fontWeight:500, marginBottom:6 }}>Clique ou arraste o arquivo XML aqui</div>
                  <div style={{ fontSize:12, color:'#888' }}>Apenas arquivos .xml de NF-e</div>
                  <input ref={fileRef} type="file" accept=".xml" style={{ display:'none' }} onChange={handleFile} />
                </div>
              </div>
            </div>
          )}

          {/* prévia */}
          {etapa === 'previa' && (
            <>
              {/* cabeçalho da nota */}
              {nfInfo && (
                <div className="card" style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:16 }}>
                  <div><div style={{ fontSize:11, color:'#888' }}>Emitente</div><div style={{ fontWeight:500 }}>{nfInfo.emitente}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>CNPJ</div><div style={{ fontWeight:500 }}>{nfInfo.cnpj}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>NF / Série</div><div style={{ fontWeight:500 }}>{nfInfo.numero} / {nfInfo.serie}</div></div>
                  <div><div style={{ fontSize:11, color:'#888' }}>Emissão</div><div style={{ fontWeight:500 }}>{nfInfo.dataEmissao ? new Date(nfInfo.dataEmissao+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                </div>
              )}

              {/* resumo */}
              <div className="cards-grid" style={{ marginBottom:16 }}>
                <div className="metric-card"><div className="metric-label">Itens na nota</div><div className="metric-value">{linhas.length}</div></div>
                <div className="metric-card"><div className="metric-label">Selecionados</div><div className="metric-value blue">{totalSel}</div></div>
                <div className="metric-card"><div className="metric-label">Novos no estoque</div><div className="metric-value green">{linhas.filter((l,i)=>selecionados[i]&&!l.itemEstoque).length}</div></div>
                <div className="metric-card"><div className="metric-label">Entradas (existentes)</div><div className="metric-value yellow">{linhas.filter((l,i)=>selecionados[i]&&l.itemEstoque).length}</div></div>
              </div>

              {/* ações */}
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, gap:8, flexWrap:'wrap' }}>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-sm" onClick={() => { const s={}; linhas.forEach((_,i)=>s[i]=true); setSelecionados(s) }}>Selecionar todos</button>
                  <button className="btn btn-sm" onClick={() => setSelecionados({})}>Desmarcar todos</button>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-sm" onClick={reiniciar}>← Voltar</button>
                  <button className="btn btn-primary btn-sm" onClick={confirmar} disabled={saving||!totalSel}>
                    {saving ? 'Importando...' : `Confirmar importação (${totalSel})`}
                  </button>
                </div>
              </div>

              {/* tabela de estoque */}
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width:36 }}>
                        <input type="checkbox"
                          checked={totalSel===linhas.length}
                          onChange={e => { const s={}; linhas.forEach((_,i)=>s[i]=e.target.checked); setSelecionados(s) }}
                          style={{ accentColor:'#1d4ed8' }} />
                      </th>
                      <th>Produto (NF-e)</th>
                      <th>EAN</th>
                      <th>Qtd</th>
                      <th>Custo unit.</th>
                      <th>Unid.</th>
                      <th>Categoria</th>
                      <th>Situação</th>
                      <th>Estoque atual → após importar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((linha, i) => {
                      const jaTemProduto  = !!linha.produto
                      const jaTemEstoque  = !!linha.itemEstoque
                      const qtdAtual      = linha.itemEstoque?.quantidade ?? 0
                      const qtdApos       = qtdAtual + (parseInt(linha.qtd) || 0)

                      let situacao, situacaoCls
                      if (jaTemProduto && jaTemEstoque) {
                        situacao = 'Entrada — produto existente'; situacaoCls = 'badge-warning'
                      } else if (jaTemProduto && !jaTemEstoque) {
                        situacao = 'Novo estoque — produto existente'; situacaoCls = 'badge-info'
                      } else if (!jaTemProduto && linha.ean) {
                        situacao = 'Novo produto + estoque'; situacaoCls = 'badge-success'
                      } else {
                        situacao = 'Novo estoque (sem EAN)'; situacaoCls = 'badge-neutral'
                      }

                      return (
                        <tr key={i} style={{ opacity: selecionados[i] ? 1 : 0.4 }}>
                          <td>
                            <input type="checkbox" checked={!!selecionados[i]}
                              onChange={() => setSelecionados(s => ({...s,[i]:!s[i]}))}
                              style={{ accentColor:'#1d4ed8' }} />
                          </td>
                          <td>
                            <strong style={{ fontWeight:500 }}>{linha.nome}</strong>
                            {jaTemProduto && linha.produto.cor    && <span style={{ marginLeft:6, fontSize:11, color:'#888' }}>{linha.produto.cor}</span>}
                            {jaTemProduto && linha.produto.tamanho && <span style={{ marginLeft:4, fontSize:11, color:'#888' }}>{linha.produto.tamanho}</span>}
                          </td>
                          <td>
                            {linha.ean
                              ? <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'2px 6px', borderRadius:4 }}>{linha.ean}</span>
                              : <span style={{ color:'#ccc' }}>—</span>}
                          </td>
                          <td>
                            <input
                              type="number" min="1"
                              value={linha.qtd}
                              onChange={e => setLinhas(prev => prev.map((l,idx) =>
                                idx===i ? {...l, qtd: Math.max(1, parseInt(e.target.value)||1)} : l
                              ))}
                              style={{ width:70, padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, textAlign:'center' }}
                            />
                          </td>
                          <td>{fmtR(linha.custo)}</td>
                          <td>{linha.unidade}</td>
                          <td>
                            {jaTemEstoque
                              ? <span style={{ fontSize:12, color:'#aaa' }}>—</span>
                              : <select value={linha.categoria}
                                  onChange={e => setLinhas(prev => prev.map((l,idx) => idx===i ? {...l,categoria:e.target.value} : l))}
                                  style={{ padding:'3px 6px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12 }}>
                                  <option>Material escolar</option>
                                  <option>Limpeza</option>
                                  <option>Escritório</option>
                                  <option>Esportivo</option>
                                  <option>Outro</option>
                                </select>}
                          </td>
                          <td><span className={`badge ${situacaoCls}`}>{situacao}</span></td>
                          <td>
                            {jaTemEstoque
                              ? <span style={{ fontSize:12 }}>{qtdAtual} → <strong style={{ color:'#16a34a' }}>{qtdApos}</strong></span>
                              : <span style={{ fontSize:12, color:'#16a34a', fontWeight:500 }}>+ {parseInt(linha.qtd)||0}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* sucesso */}
          {etapa === 'sucesso' && resultado && (
            <div style={{ maxWidth:480 }}>
              <div className="card" style={{ textAlign:'center', padding:'32px 24px' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
                <h3 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Importação concluída!</h3>
                <p style={{ color:'#888', fontSize:13, marginBottom:24 }}>Estoque atualizado com sucesso.</p>
                <div className="cards-grid" style={{ marginBottom:24 }}>
                  <div className="metric-card"><div className="metric-label">Novos no estoque</div><div className="metric-value green">{resultado.cadastrados}</div></div>
                  <div className="metric-card"><div className="metric-label">Entradas realizadas</div><div className="metric-value yellow">{resultado.atualizados}</div></div>
                  {resultado.erros > 0 && <div className="metric-card"><div className="metric-label">Erros</div><div className="metric-value red">{resultado.erros}</div></div>}
                </div>
                {resultado.erros > 0 && (
                  <div className="alert alert-warning" style={{ marginBottom:16, textAlign:'left' }}>
                    {resultado.erros} item(ns) com erro. Verifique o console do navegador (F12) para detalhes.
                  </div>
                )}
                <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:16 }}>
                  <button className="btn" onClick={reiniciar}>Importar outra NF-e</button>
                  <button className="btn btn-primary" onClick={() => setTabAtiva('historico')}>Ver notas importadas</button>
                </div>
                {resultado.log && resultado.log.length > 0 && (
                  <div style={{ textAlign:'left', marginTop:8 }}>
                    <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>Detalhes:</div>
                    <table style={{ width:'100%', fontSize:12 }}>
                      <thead><tr><th style={{ textAlign:'left', padding:'4px 8px', background:'#f5f5f3' }}>Item</th><th style={{ textAlign:'left', padding:'4px 8px', background:'#f5f5f3' }}>Qtd</th><th style={{ textAlign:'left', padding:'4px 8px', background:'#f5f5f3' }}>Tipo</th></tr></thead>
                      <tbody>{resultado.log.map((l,i) => (
                        <tr key={i}><td style={{ padding:'3px 8px' }}>{l.nome}</td><td style={{ padding:'3px 8px' }}>{l.qtd}</td><td style={{ padding:'3px 8px' }}><span className={l.tipo==='entrada'?'badge badge-warning':'badge badge-success'}>{l.tipo}</span></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {resultado.erros > 0 && (
                  <div style={{ textAlign:'left', marginTop:8, fontSize:12, color:'#dc2626' }}>
                    ⚠ {resultado.erros} item(ns) com erro — abra o console (F12) para ver detalhes.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ HISTÓRICO ══ */}
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
                        <button className="btn btn-sm btn-danger"
                          disabled={desfazendoId===nota.id}
                          onClick={() => desfazerNota(nota)}>
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
