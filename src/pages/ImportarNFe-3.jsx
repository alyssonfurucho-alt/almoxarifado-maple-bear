import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR } from '../lib/utils'

function tag(node, name) {
  const el = node.getElementsByTagName(name)[0]
  return el ? el.textContent.trim() : ''
}

function normalizeUnidade(u) {
  const m = { UN:'un', UNID:'un', PC:'un', CX:'cx', PCT:'pct', KG:'kg', G:'g', L:'l', ML:'ml', MT:'m', M:'m', PAR:'par', RESMA:'resma' }
  return m[u?.toUpperCase()] || u?.toLowerCase() || 'un'
}

function inferCategoria(nome) {
  const n = nome.toLowerCase()
  if (/papel|resma|caderno|bloco|fichario|pasta/.test(n)) return 'Escritório'
  if (/detergente|sabao|sabão|desinfetante|limpeza|vassoura|rodo|pano/.test(n)) return 'Limpeza'
  if (/bola|rede|cone|colchonete|esporte/.test(n)) return 'Esportivo'
  return 'Material escolar'
}

export default function ImportarNFe() {
  const [tabAtiva, setTabAtiva] = useState('importar') // importar | historico
  const [etapa, setEtapa] = useState('upload')
  const [itensPrevia, setItensPrevia] = useState([])
  const [nfInfo, setNfInfo] = useState(null)
  const [selecionados, setSelecionados] = useState({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)
  const [notasImportadas, setNotasImportadas] = useState([])
  const [loadingNotas, setLoadingNotas] = useState(false)
  const [desfazendoId, setDesfazendoId] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    if (tabAtiva === 'historico') loadNotas()
  }, [tabAtiva])

  async function loadNotas() {
    setLoadingNotas(true)
    const { data } = await supabase
      .from('nfe_importacoes')
      .select('*')
      .order('created_at', { ascending: false })
    setNotasImportadas(data || [])
    setLoadingNotas(false)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xml')) { setErro('Selecione um arquivo .xml de NF-e'); return }
    setErro('')
    const reader = new FileReader()
    reader.onload = ev => parseNFe(ev.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  async function parseNFe(xmlStr) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlStr, 'application/xml')
      if (doc.querySelector('parsererror')) { setErro('Arquivo XML inválido ou corrompido.'); return }

      const ide = doc.getElementsByTagName('ide')[0]
      const emit = doc.getElementsByTagName('emit')[0]
      const info = {
        numero: tag(ide, 'nNF'), serie: tag(ide, 'serie'),
        dataEmissao: tag(ide, 'dhEmi') || tag(ide, 'dEmi'),
        emitente: tag(emit, 'xNome'), cnpj: tag(emit, 'CNPJ'),
      }
      setNfInfo(info)

      const dets = doc.getElementsByTagName('det')
      if (!dets.length) { setErro('Nenhum produto encontrado na NF-e.'); return }

      // Busca todos os produtos cadastrados para cruzar pelo EAN
      const { data: produtosCadastrados } = await supabase
        .from('produtos').select('id,nome,codigo_barras,cor,tamanho')

      // Busca itens de estoque para dar entrada
      const { data: itensCadastrados } = await supabase
        .from('itens').select('id,nome,quantidade,custo_unitario,produto_id,codigo_barras')

      const itens = []
      for (const det of dets) {
        const prod = det.getElementsByTagName('prod')[0]
        const nome    = tag(prod, 'xProd')
        const qtd     = parseFloat(tag(prod, 'qCom').replace(',', '.')) || 0
        const custo   = parseFloat(tag(prod, 'vUnCom').replace(',', '.')) || 0
        const unidade = normalizeUnidade(tag(prod, 'uCom'))
        const cean    = tag(prod, 'cEAN')
        const codProd = tag(prod, 'cProd')
        const eanLimpo = (cean && cean !== 'SEM GTIN') ? cean.replace(/\D/g, '') : null

        // 1. Cruza com tabela PRODUTOS pelo codigo_barras
        const produtoExistente = eanLimpo
          ? produtosCadastrados?.find(p => p.codigo_barras === eanLimpo)
          : null

        // 2. Cruza com tabela ITENS (estoque) pelo produto_id ou codigo_barras
        const itemEstoque = produtoExistente
          ? itensCadastrados?.find(i => i.produto_id === produtoExistente.id)
          : itensCadastrados?.find(i =>
              (eanLimpo && i.codigo_barras === eanLimpo) ||
              i.nome.toLowerCase().trim() === nome.toLowerCase().trim()
            )

        itens.push({
          nome,
          qtd,
          custo,
          unidade,
          cean: eanLimpo,
          codProd,
          categoria: inferCategoria(nome),
          produtoExistente: produtoExistente || null,  // produto já cadastrado
          existente: itemEstoque || null,              // item de estoque já cadastrado
        })
      }

      setItensPrevia(itens)
      const sel = {}; itens.forEach((_, i) => sel[i] = true)
      setSelecionados(sel)
      setEtapa('previa')
    } catch (e) {
      setErro('Erro ao processar o XML: ' + e.message)
    }
  }

  async function confirmar() {
    const lista = itensPrevia.filter((_, i) => selecionados[i])
    if (!lista.length) { alert('Selecione pelo menos um item'); return }

    setSaving(true)
    let cadastrados = 0, atualizados = 0, erros = 0
    const itensLog = []

    // Busca dados frescos do banco no momento da confirmação
    const { data: produtosDB } = await supabase.from('produtos').select('id,nome,codigo_barras')
    const { data: itensDB }    = await supabase.from('itens').select('id,nome,quantidade,custo_unitario,produto_id,codigo_barras')

    for (const item of lista) {
      try {
        const nomeItem = (item.nome || '').trim()
        const ean      = (item.cean || '').replace(/\D/g, '')

        // ---------- PASSO 1: Resolve produto ----------
        // Tenta achar produto pelo EAN (dados frescos)
        let produto = ean ? produtosDB?.find(p => p.codigo_barras === ean) : null

        // Se não achou e tem EAN → cria produto novo
        if (!produto && ean) {
          const { data: novo, error: e1 } = await supabase
            .from('produtos')
            .insert({ codigo_barras: ean, nome: nomeItem, ativo: true })
            .select().single()
          if (e1) { console.error('Erro produto:', nomeItem, e1.message); erros++; continue }
          produto = novo
          // adiciona na lista local para evitar duplicar em loop
          produtosDB?.push(novo)
        }

        const produtoId = produto?.id || null

        // ---------- PASSO 2: Resolve item de estoque ----------
        // Tenta achar item pelo produto_id, depois pelo EAN, depois pelo nome
        let itemExistente = null
        if (produtoId) {
          itemExistente = itensDB?.find(i => i.produto_id === produtoId)
        }
        if (!itemExistente && ean) {
          itemExistente = itensDB?.find(i => i.codigo_barras === ean)
        }
        if (!itemExistente) {
          itemExistente = itensDB?.find(i => i.nome?.toLowerCase().trim() === nomeItem.toLowerCase())
        }

        if (itemExistente) {
          // ---------- PASSO 3a: Item existe → atualiza quantidade ----------
          const novaQtd = (itemExistente.quantidade || 0) + item.qtd
          const { error: e2 } = await supabase
            .from('itens')
            .update({
              quantidade: novaQtd,
              custo_unitario: item.custo,
              ...(produtoId && !itemExistente.produto_id ? { produto_id: produtoId } : {}),
            })
            .eq('id', itemExistente.id)
          if (e2) { console.error('Erro update item:', nomeItem, e2.message); erros++; continue }
          itensLog.push({ id: itemExistente.id, nome: nomeItem, qtd: item.qtd, tipo: 'entrada' })
          // atualiza lista local
          itemExistente.quantidade = novaQtd
          atualizados++

        } else {
          // ---------- PASSO 3b: Item não existe → cria novo ----------
          const { data: novoItem, error: e3 } = await supabase
            .from('itens')
            .insert({
              produto_id: produtoId,
              nome: nomeItem,
              categoria: item.categoria || 'Material escolar',
              custo_unitario: item.custo || 0,
              quantidade: item.qtd,
              unidade: item.unidade || 'un',
              codigo_barras: ean || null,
            })
            .select().single()
          if (e3) { console.error('Erro insert item:', nomeItem, e3.message); erros++; continue }
          itensLog.push({ id: novoItem.id, nome: nomeItem, qtd: item.qtd, tipo: 'cadastro' })
          itensDB?.push(novoItem)
          cadastrados++
        }
      } catch (e) {
        console.error('Erro inesperado:', item.nome, e)
        erros++
      }
    }

    // Salva registro da NF no histórico
    await supabase.from('nfe_importacoes').insert({
      numero: nfInfo?.numero,
      serie: nfInfo?.serie,
      emitente: nfInfo?.emitente,
      cnpj: nfInfo?.cnpj,
      data_emissao: nfInfo?.dataEmissao ? nfInfo.dataEmissao.split('T')[0] : null,
      itens_json: JSON.stringify(itensLog),
      itens_cadastrados: cadastrados,
      itens_atualizados: atualizados,
    })

    setSaving(false)
    setResultado({ cadastrados, atualizados, erros })
    setEtapa('sucesso')
  }

  async function desfazerNota(nota) {
    if (!window.confirm(`Desfazer a importação da NF ${nota.numero}?\n\nIsso irá subtrair as quantidades adicionadas. Itens novos serão zerados (não excluídos).`)) return
    setDesfazendoId(nota.id)
    try {
      const itensLog = JSON.parse(nota.itens_json || '[]')
      for (const it of itensLog) {
        const { data: item } = await supabase.from('itens').select('quantidade').eq('id', it.id).single()
        if (!item) continue
        const novaQtd = Math.max(0, item.quantidade - it.qtd)
        await supabase.from('itens').update({ quantidade: novaQtd }).eq('id', it.id)
        await supabase.from('movimentacoes').insert({
          item_id: it.id, item_nome: it.nome,
          tipo: 'ajuste', quantidade: it.qtd,
          observacoes: `Estorno NF-e ${nota.numero} — ${nota.emitente}`,
        })
      }
      await supabase.from('nfe_importacoes').update({ desfeita: true, desfeita_em: new Date().toISOString() }).eq('id', nota.id)
      loadNotas()
    } catch (e) {
      alert('Erro ao desfazer: ' + e.message)
    }
    setDesfazendoId(null)
  }

  function reiniciar() {
    setEtapa('upload'); setItensPrevia([]); setNfInfo(null)
    setSelecionados({}); setErro(''); setResultado(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalSel = Object.values(selecionados).filter(Boolean).length
  const novos    = itensPrevia.filter((it, i) => selecionados[i] && !it.existente).length
  const entradas = itensPrevia.filter((it, i) => selecionados[i] && it.existente).length

  return (
    <div>
      <div className="page-header"><div className="page-title">NF-e</div></div>
      <div className="tabs">
        <div className={`tab${tabAtiva === 'importar' ? ' active' : ''}`} onClick={() => setTabAtiva('importar')}>Importar NF-e</div>
        <div className={`tab${tabAtiva === 'historico' ? ' active' : ''}`} onClick={() => setTabAtiva('historico')}>Notas importadas</div>
      </div>

      {/* ---- IMPORTAR ---- */}
      {tabAtiva === 'importar' && (
        <>
          {etapa === 'upload' && (
            <div style={{ maxWidth: 560 }}>
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                Importe uma NF-e em XML para cadastrar itens novos e dar entrada no estoque automaticamente.
              </div>
              {erro && <div className="alert alert-danger">{erro}</div>}
              <div className="card">
                <div
                  style={{ border: '2px dashed #d1d5db', borderRadius: 10, padding: '40px 24px', textAlign: 'center', cursor: 'pointer' }}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#1d4ed8' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = '#d1d5db' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#d1d5db'; const f = e.dataTransfer.files[0]; if (f) handleFile({ target: { files: [f] } }) }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>Clique ou arraste o arquivo XML aqui</div>
                  <div style={{ fontSize: 12, color: '#888' }}>Apenas arquivos .xml de NF-e</div>
                  <input ref={fileRef} type="file" accept=".xml" style={{ display: 'none' }} onChange={handleFile} />
                </div>
              </div>
            </div>
          )}

          {etapa === 'previa' && (
            <>
              {nfInfo && (
                <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Emitente</div><div style={{ fontWeight: 500 }}>{nfInfo.emitente}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>CNPJ</div><div style={{ fontWeight: 500 }}>{nfInfo.cnpj}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>NF / Série</div><div style={{ fontWeight: 500 }}>{nfInfo.numero} / {nfInfo.serie}</div></div>
                  <div><div style={{ fontSize: 11, color: '#888' }}>Emissão</div><div style={{ fontWeight: 500 }}>{nfInfo.dataEmissao ? new Date(nfInfo.dataEmissao).toLocaleDateString('pt-BR') : '—'}</div></div>
                </div>
              )}
              <div className="cards-grid" style={{ marginBottom: 16 }}>
                <div className="metric-card"><div className="metric-label">Total na nota</div><div className="metric-value">{itensPrevia.length}</div></div>
                <div className="metric-card"><div className="metric-label">Selecionados</div><div className="metric-value blue">{totalSel}</div></div>
                <div className="metric-card"><div className="metric-label">Itens novos</div><div className="metric-value green">{novos}</div></div>
                <div className="metric-card"><div className="metric-label">Entradas em estoque</div><div className="metric-value yellow">{entradas}</div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => { const s = {}; itensPrevia.forEach((_, i) => s[i] = true); setSelecionados(s) }}>Selecionar todos</button>
                  <button className="btn btn-sm" onClick={() => setSelecionados({})}>Desmarcar todos</button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm" onClick={reiniciar}>← Voltar</button>
                  <button className="btn btn-primary btn-sm" onClick={confirmar} disabled={saving || !totalSel}>
                    {saving ? 'Importando...' : `Confirmar importação (${totalSel})`}
                  </button>
                </div>
              </div>
              <div className="card">
                <table>
                  <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={totalSel === itensPrevia.length} onChange={e => { const s = {}; itensPrevia.forEach((_, i) => s[i] = e.target.checked); setSelecionados(s) }} style={{ accentColor: '#1d4ed8' }} /></th><th>Produto</th><th>Cód. barras</th><th>Qtd</th><th>Custo unit.</th><th>Unidade</th><th>Categoria</th><th>Situação</th><th>Estoque atual → novo</th></tr></thead>
                  <tbody>
                    {itensPrevia.map((item, i) => (
                      <tr key={i} style={{ opacity: selecionados[i] ? 1 : 0.4 }}>
                        <td><input type="checkbox" checked={!!selecionados[i]} onChange={() => setSelecionados(s => ({ ...s, [i]: !s[i] }))} style={{ accentColor: '#1d4ed8' }} /></td>
                        <td><strong style={{ fontWeight: 500 }}>{item.nome}</strong></td>
                        <td>{item.cean ? <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f5f5f3', padding: '2px 6px', borderRadius: 4 }}>{item.cean}</span> : <span style={{ color: '#aaa', fontSize: 12 }}>—</span>}</td>
                        <td>{item.qtd}</td>
                        <td>{fmtR(item.custo)}</td>
                        <td>{item.unidade}</td>
                        <td>
                          {item.existente ? <span style={{ fontSize: 12, color: '#888' }}>—</span> : (
                            <select value={item.categoria} onChange={e => setItensPrevia(prev => prev.map((it, idx) => idx === i ? { ...it, categoria: e.target.value } : it))} style={{ padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
                              <option>Material escolar</option><option>Limpeza</option><option>Escritório</option><option>Esportivo</option><option>Outro</option>
                            </select>
                          )}
                        </td>
                        <td>
                          {item.produtoExistente && item.existente
                            ? <span className="badge badge-warning">Entrada — produto existente</span>
                            : item.produtoExistente && !item.existente
                            ? <span className="badge badge-info">Novo estoque — produto existente</span>
                            : item.existente
                            ? <span className="badge badge-warning">Entrada em estoque</span>
                            : <span className="badge badge-success">Novo produto + estoque</span>}
                        </td>
                        <td>{item.existente ? <span style={{ fontSize: 12 }}>{item.existente.quantidade} → <strong style={{ color: '#16a34a' }}>{item.existente.quantidade + item.qtd}</strong></span> : <span style={{ fontSize: 12, color: '#888' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {etapa === 'sucesso' && resultado && (
            <div style={{ maxWidth: 480 }}>
              <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Importação concluída!</h3>
                <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>Os dados da NF-e foram processados com sucesso.</p>
                <div className="cards-grid" style={{ marginBottom: 24 }}>
                  <div className="metric-card"><div className="metric-label">Cadastrados</div><div className="metric-value green">{resultado.cadastrados}</div></div>
                  <div className="metric-card"><div className="metric-label">Atualizados</div><div className="metric-value yellow">{resultado.atualizados}</div></div>
                  {resultado.erros > 0 && <div className="metric-card"><div className="metric-label">Erros</div><div className="metric-value red">{resultado.erros}</div></div>}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="btn" onClick={reiniciar}>Importar outra NF-e</button>
                  <button className="btn btn-primary" onClick={() => setTabAtiva('historico')}>Ver notas importadas</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- HISTÓRICO DE NOTAS ---- */}
      {tabAtiva === 'historico' && (
        <>
          {loadingNotas ? <div className="loading">Carregando...</div> : (
            <div className="card">
              <table>
                <thead>
                  <tr><th>NF / Série</th><th>Emitente</th><th>CNPJ</th><th>Data emissão</th><th>Importado em</th><th>Cadastrados</th><th>Atualizados</th><th>Status</th><th>Ação</th></tr>
                </thead>
                <tbody>
                  {notasImportadas.map(nota => (
                    <tr key={nota.id} style={{ opacity: nota.desfeita ? 0.5 : 1 }}>
                      <td><strong style={{ fontWeight: 500 }}>{nota.numero} / {nota.serie}</strong></td>
                      <td>{nota.emitente}</td>
                      <td style={{ fontSize: 12, color: '#888' }}>{nota.cnpj}</td>
                      <td>{fmtData(nota.data_emissao)}</td>
                      <td style={{ fontSize: 12, color: '#888' }}>{nota.created_at ? new Date(nota.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                      <td><span className="badge badge-info">{nota.itens_cadastrados}</span></td>
                      <td><span className="badge badge-warning">{nota.itens_atualizados}</span></td>
                      <td>
                        {nota.desfeita
                          ? <span className="badge badge-neutral">Desfeita</span>
                          : <span className="badge badge-success">Ativa</span>}
                      </td>
                      <td>
                        {!nota.desfeita && (
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={desfazendoId === nota.id}
                            onClick={() => desfazerNota(nota)}
                          >
                            {desfazendoId === nota.id ? 'Desfazendo...' : 'Desfazer'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!notasImportadas.length && <tr><td colSpan={9} className="empty">Nenhuma NF-e importada ainda</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
