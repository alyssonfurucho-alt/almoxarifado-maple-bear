import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fmtR } from '../lib/utils'

// Lê o texto de um nó XML com segurança
function tag(node, name) {
  const el = node.getElementsByTagName(name)[0]
  return el ? el.textContent.trim() : ''
}

// Determina unidade a partir do xUnCom da NF-e
function normalizeUnidade(u) {
  const m = { UN: 'un', UNID: 'un', PC: 'un', PÇ: 'un', CX: 'cx', PCT: 'pct',
    KG: 'kg', G: 'g', L: 'l', ML: 'ml', MT: 'm', M: 'm', PAR: 'par', RESMA: 'resma' }
  return m[u?.toUpperCase()] || u?.toLowerCase() || 'un'
}

// Determina categoria com base no nome do item (heurística simples)
function inferCategoria(nome) {
  const n = nome.toLowerCase()
  if (/papel|resma|caderno|bloco|fichario|pasta/.test(n)) return 'Escritório'
  if (/detergente|sabão|sabao|desinfetante|limpeza|vassoura|rodo|pano/.test(n)) return 'Limpeza'
  if (/bola|rede|cone|colchonete|esporte/.test(n)) return 'Esportivo'
  return 'Material escolar'
}

export default function ImportarNFe() {
  const [etapa, setEtapa] = useState('upload') // upload | previa | sucesso
  const [itensPrevia, setItensPrevia] = useState([])
  const [nfInfo, setNfInfo] = useState(null)
  const [selecionados, setSelecionados] = useState({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xml')) { setErro('Selecione um arquivo .xml de NF-e'); return }
    setErro('')
    const reader = new FileReader()
    reader.onload = (ev) => parseNFe(ev.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  async function parseNFe(xmlStr) {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlStr, 'application/xml')

      if (doc.querySelector('parsererror')) {
        setErro('Arquivo XML inválido ou corrompido.'); return
      }

      // Informações da nota
      const ide = doc.getElementsByTagName('ide')[0]
      const emit = doc.getElementsByTagName('emit')[0]
      const nfInfo = {
        numero: tag(ide, 'nNF'),
        serie: tag(ide, 'serie'),
        dataEmissao: tag(ide, 'dhEmi') || tag(ide, 'dEmi'),
        emitente: tag(emit, 'xNome'),
        cnpj: tag(emit, 'CNPJ'),
      }
      setNfInfo(nfInfo)

      // Produtos da nota
      const dets = doc.getElementsByTagName('det')
      if (!dets.length) { setErro('Nenhum produto encontrado na NF-e.'); return }

      // Busca itens já cadastrados no banco para cruzar por nome
      const { data: itensCadastrados } = await supabase.from('itens').select('id, nome, quantidade, custo_unitario')

      const itens = []
      for (const det of dets) {
        const prod = det.getElementsByTagName('prod')[0]
        const nome = tag(prod, 'xProd')
        const qtd = parseFloat(tag(prod, 'qCom').replace(',', '.')) || 0
        const custo = parseFloat(tag(prod, 'vUnCom').replace(',', '.')) || 0
        const unidade = normalizeUnidade(tag(prod, 'uCom'))
        const codProd = tag(prod, 'cProd')

        // Verifica se já existe no estoque (busca por nome similar)
        const existente = itensCadastrados?.find(
          i => i.nome.toLowerCase().trim() === nome.toLowerCase().trim()
        )

        itens.push({
          codProd,
          nome,
          qtd,
          custo,
          unidade,
          categoria: inferCategoria(nome),
          existente: existente || null, // null = novo item
          // se existente, mostra qtd atual e novo custo
        })
      }

      setItensPrevia(itens)
      // Seleciona todos por padrão
      const sel = {}
      itens.forEach((_, i) => sel[i] = true)
      setSelecionados(sel)
      setEtapa('previa')
    } catch (e) {
      setErro('Erro ao processar o XML: ' + e.message)
    }
  }

  function toggleItem(i) {
    setSelecionados(s => ({ ...s, [i]: !s[i] }))
  }

  function toggleTodos(v) {
    const sel = {}
    itensPrevia.forEach((_, i) => sel[i] = v)
    setSelecionados(sel)
  }

  function updateCategoria(i, v) {
    setItensPrevia(prev => prev.map((it, idx) => idx === i ? { ...it, categoria: v } : it))
  }

  async function confirmar() {
    const selecionadosList = itensPrevia.filter((_, i) => selecionados[i])
    if (!selecionadosList.length) { alert('Selecione pelo menos um item'); return }

    setSaving(true)
    let cadastrados = 0, atualizados = 0, erros = 0

    for (const item of selecionadosList) {
      try {
        if (item.existente) {
          // Dá entrada no estoque e atualiza custo
          const { error } = await supabase.from('itens').update({
            quantidade: item.existente.quantidade + item.qtd,
            custo_unitario: item.custo,
          }).eq('id', item.existente.id)
          if (error) throw error
          atualizados++
        } else {
          // Cadastra novo item
          const { error } = await supabase.from('itens').insert({
            nome: item.nome,
            categoria: item.categoria,
            custo_unitario: item.custo,
            quantidade: item.qtd,
            unidade: item.unidade,
          })
          if (error) throw error
          cadastrados++
        }
      } catch {
        erros++
      }
    }

    setSaving(false)
    setResultado({ cadastrados, atualizados, erros })
    setEtapa('sucesso')
  }

  function reiniciar() {
    setEtapa('upload')
    setItensPrevia([])
    setNfInfo(null)
    setSelecionados({})
    setErro('')
    setResultado(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const totalSelecionados = Object.values(selecionados).filter(Boolean).length
  const novos = itensPrevia.filter((it, i) => selecionados[i] && !it.existente).length
  const entradas = itensPrevia.filter((it, i) => selecionados[i] && it.existente).length

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Importar NF-e (XML)</div>
      </div>

      {/* ETAPA 1: UPLOAD */}
      {etapa === 'upload' && (
        <div style={{ maxWidth: 560 }}>
          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            Importe uma Nota Fiscal Eletrônica em XML para cadastrar itens novos e dar entrada no estoque automaticamente.
          </div>
          {erro && <div className="alert alert-danger">{erro}</div>}
          <div className="card">
            <div
              style={{
                border: '2px dashed #d1d5db', borderRadius: 10, padding: '40px 24px',
                textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#1d4ed8' }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#d1d5db' }}
              onDrop={e => {
                e.preventDefault()
                e.currentTarget.style.borderColor = '#d1d5db'
                const file = e.dataTransfer.files[0]
                if (file) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: [file] } }) }
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>Clique ou arraste o arquivo XML aqui</div>
              <div style={{ fontSize: 12, color: '#888' }}>Apenas arquivos .xml de NF-e</div>
              <input ref={fileRef} type="file" accept=".xml" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            <div className="card-title">Como funciona</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8 }}>
              <div>1. Faça o download do XML da NF-e no portal do fornecedor ou na SEFAZ</div>
              <div>2. Selecione o arquivo aqui</div>
              <div>3. Revise os itens na prévia antes de confirmar</div>
              <div>4. Itens novos serão cadastrados; itens existentes terão o estoque atualizado</div>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 2: PRÉVIA */}
      {etapa === 'previa' && (
        <>
          {/* Info da nota */}
          {nfInfo && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 11, color: '#888' }}>Emitente</div><div style={{ fontWeight: 500 }}>{nfInfo.emitente}</div></div>
              <div><div style={{ fontSize: 11, color: '#888' }}>CNPJ</div><div style={{ fontWeight: 500 }}>{nfInfo.cnpj}</div></div>
              <div><div style={{ fontSize: 11, color: '#888' }}>Nº / Série</div><div style={{ fontWeight: 500 }}>{nfInfo.numero} / {nfInfo.serie}</div></div>
              <div><div style={{ fontSize: 11, color: '#888' }}>Emissão</div><div style={{ fontWeight: 500 }}>{nfInfo.dataEmissao ? new Date(nfInfo.dataEmissao).toLocaleDateString('pt-BR') : '-'}</div></div>
            </div>
          )}

          {/* Resumo */}
          <div className="cards-grid" style={{ marginBottom: 16 }}>
            <div className="metric-card"><div className="metric-label">Total na nota</div><div className="metric-value">{itensPrevia.length}</div></div>
            <div className="metric-card"><div className="metric-label">Selecionados</div><div className="metric-value blue">{totalSelecionados}</div></div>
            <div className="metric-card"><div className="metric-label">Itens novos</div><div className="metric-value green">{novos}</div></div>
            <div className="metric-card"><div className="metric-label">Entradas em estoque</div><div className="metric-value yellow">{entradas}</div></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => toggleTodos(true)}>Selecionar todos</button>
              <button className="btn btn-sm" onClick={() => toggleTodos(false)}>Desmarcar todos</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={reiniciar}>← Voltar</button>
              <button className="btn btn-primary btn-sm" onClick={confirmar} disabled={saving || !totalSelecionados}>
                {saving ? 'Importando...' : `Confirmar importação (${totalSelecionados})`}
              </button>
            </div>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={totalSelecionados === itensPrevia.length}
                      onChange={e => toggleTodos(e.target.checked)}
                      style={{ accentColor: '#1d4ed8' }}
                    />
                  </th>
                  <th>Produto (NF-e)</th>
                  <th>Qtd</th>
                  <th>Custo unit.</th>
                  <th>Unidade</th>
                  <th>Categoria</th>
                  <th>Situação</th>
                  <th>Estoque atual</th>
                </tr>
              </thead>
              <tbody>
                {itensPrevia.map((item, i) => (
                  <tr key={i} style={{ opacity: selecionados[i] ? 1 : 0.4 }}>
                    <td>
                      <input type="checkbox" checked={!!selecionados[i]} onChange={() => toggleItem(i)} style={{ accentColor: '#1d4ed8' }} />
                    </td>
                    <td><strong style={{ fontWeight: 500 }}>{item.nome}</strong></td>
                    <td>{item.qtd}</td>
                    <td>{fmtR(item.custo)}</td>
                    <td>{item.unidade}</td>
                    <td>
                      {item.existente ? (
                        <span style={{ fontSize: 12, color: '#888' }}>—</span>
                      ) : (
                        <select
                          value={item.categoria}
                          onChange={e => updateCategoria(i, e.target.value)}
                          style={{ padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
                        >
                          <option>Material escolar</option>
                          <option>Limpeza</option>
                          <option>Escritório</option>
                          <option>Esportivo</option>
                          <option>Outro</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {item.existente
                        ? <span className="badge badge-warning">Entrada em estoque</span>
                        : <span className="badge badge-info">Novo item</span>}
                    </td>
                    <td>
                      {item.existente
                        ? <span style={{ fontSize: 12 }}>{item.existente.quantidade} → <strong style={{ color: '#16a34a' }}>{item.existente.quantidade + item.qtd}</strong></span>
                        : <span style={{ fontSize: 12, color: '#888' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ETAPA 3: SUCESSO */}
      {etapa === 'sucesso' && resultado && (
        <div style={{ maxWidth: 480 }}>
          <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Importação concluída!</h3>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>Os dados da NF-e foram processados com sucesso.</p>
            <div className="cards-grid" style={{ marginBottom: 24 }}>
              <div className="metric-card">
                <div className="metric-label">Itens cadastrados</div>
                <div className="metric-value green">{resultado.cadastrados}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Estoques atualizados</div>
                <div className="metric-value yellow">{resultado.atualizados}</div>
              </div>
              {resultado.erros > 0 && (
                <div className="metric-card">
                  <div className="metric-label">Erros</div>
                  <div className="metric-value red">{resultado.erros}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn" onClick={reiniciar}>Importar outra NF-e</button>
              <a href="/estoque" className="btn btn-primary" style={{ textDecoration: 'none' }}>Ver estoque</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
