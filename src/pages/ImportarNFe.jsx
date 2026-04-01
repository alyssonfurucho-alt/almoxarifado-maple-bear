import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR } from '../lib/utils'

// ── helpers XML ──────────────────────────────────────────────
function tag(node, name) {
  const el = node.getElementsByTagName(name)[0]
  return el ? el.textContent.trim() : ''
}
function limparEan(v) {
  if (!v || v === 'SEM GTIN') return ''
  return v.replace(/\D/g, '')
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

function parseXmlNFe(xmlStr) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlStr, 'application/xml')
  if (doc.querySelector('parsererror')) return null

  const ide  = doc.getElementsByTagName('ide')[0]
  const emit = doc.getElementsByTagName('emit')[0]
  const info = {
    numero:      tag(ide, 'nNF'),
    serie:       tag(ide, 'serie'),
    dataEmissao: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).split('T')[0] || null,
    emitente:    tag(emit, 'xNome'),
    cnpj:        tag(emit, 'CNPJ'),
  }

  const dets = doc.getElementsByTagName('det')
  const itens = []
  for (const det of dets) {
    const prod = det.getElementsByTagName('prod')[0]
    itens.push({
      nome:     tag(prod, 'xProd'),
      qtd:      parseFloat(tag(prod, 'qCom').replace(',', '.')) || 0,
      custoTotal:    parseFloat(tag(prod, 'vProd').replace(',', '.')) || 0,
      custoUnitario: parseFloat(tag(prod, 'vUnCom').replace(',', '.')) || 0,
      custo:         parseFloat(tag(prod, 'vProd').replace(',', '.')) || 0,
      unidade:  normalizeUnidade(tag(prod, 'uCom')),
      ean:      limparEan(tag(prod, 'cEAN')),
      codProd:  tag(prod, 'cProd'),
      categoria: inferCategoria(tag(prod, 'xProd')),
    })
  }
  return { info, itens }
}

// ── componente principal ──────────────────────────────────────
export default function ImportarNFe() {
  const [tabAtiva, setTabAtiva]       = useState('importar')

  // ── estado CSV ──
  const [csvLinhas, setCsvLinhas]     = useState([])   // linhas parseadas
  const [csvErros, setCsvErros]       = useState([])   // erros por linha
  const [csvSaving, setCsvSaving]     = useState(false)
  const [csvResultado, setCsvResultado] = useState(null)
  const [csvEtapa, setCsvEtapa]       = useState('upload') // upload | previa | sucesso
  const csvRef = useRef()
  // etapas: upload | selecao | confirmando | sucesso
  const [etapa, setEtapa]             = useState('upload')

  // lista de notas carregadas dos XMLs
  const [notas, setNotas]             = useState([])          // [{ fileName, info, itens, selecionados:{idx:bool} }]
  const [notaAtiva, setNotaAtiva]     = useState(0)           // índice da nota sendo visualizada

  // step de confirmação item a item
  const [stepNotas, setStepNotas]     = useState([])          // notas com itens filtrados para confirmar
  const [stepNotaIdx, setStepNotaIdx] = useState(0)
  const [stepItemIdx, setStepItemIdx] = useState(0)
  const [stepQtd, setStepQtd]         = useState(0)
  const [stepEan, setStepEan]         = useState('')
  const [stepEanErro, setStepEanErro] = useState('')
  const [stepCat, setStepCat]         = useState('')

  const [saving, setSaving]           = useState(false)
  const [resultado, setResultado]     = useState(null)
  const [erro, setErro]               = useState('')

  // histórico
  const [notasImportadas, setNotasImportadas] = useState([])
  const [loadingNotas, setLoadingNotas]       = useState(false)
  const [desfazendoId, setDesfazendoId]       = useState(null)

  const fileRef = useRef()

  useEffect(() => { if (tabAtiva === 'historico') carregarNotas() }, [tabAtiva])

  async function carregarNotas() {
    setLoadingNotas(true)
    const { data } = await supabase.from('nfe_importacoes').select('*').order('created_at', { ascending: false })
    setNotasImportadas(data || [])
    setLoadingNotas(false)
  }

  // ── leitura de múltiplos arquivos ──
  function handleFiles(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setErro('')
    const novasNotas = []
    let pending = files.length
    files.forEach(file => {
      if (!file.name.toLowerCase().endsWith('.xml')) { pending--; return }
      const reader = new FileReader()
      reader.onload = ev => {
        const parsed = parseXmlNFe(ev.target.result)
        if (parsed) {
          const selecionados = {}
          parsed.itens.forEach((_, i) => selecionados[i] = true)
          novasNotas.push({ fileName: file.name, info: parsed.info, itens: parsed.itens, selecionados })
        }
        pending--
        if (pending === 0) {
          if (!novasNotas.length) { setErro('Nenhum arquivo XML válido encontrado.'); return }
          setNotas(prev => {
            const combinado = [...prev, ...novasNotas]
            return combinado
          })
          setNotaAtiva(notas.length)  // abre na primeira nova
          setEtapa('selecao')
        }
      }
      reader.readAsText(file, 'UTF-8')
    })
  }

  // ── toggles de seleção ──
  function toggleItem(notaIdx, itemIdx) {
    setNotas(prev => prev.map((n, ni) => ni !== notaIdx ? n : {
      ...n,
      selecionados: { ...n.selecionados, [itemIdx]: !n.selecionados[itemIdx] }
    }))
  }

  function toggleTodosNota(notaIdx, valor) {
    setNotas(prev => prev.map((n, ni) => {
      if (ni !== notaIdx) return n
      const selecionados = {}
      n.itens.forEach((_, i) => selecionados[i] = valor)
      return { ...n, selecionados }
    }))
  }

  function removerNota(notaIdx) {
    setNotas(prev => {
      const novo = prev.filter((_, i) => i !== notaIdx)
      if (novo.length === 0) { setEtapa('upload'); return [] }
      setNotaAtiva(Math.min(notaAtiva, novo.length - 1))
      return novo
    })
  }

  // ── inicia confirmação ──
  function iniciarConfirmacao() {
    const notasComItens = notas
      .map(n => ({
        ...n,
        itensSelecionados: n.itens
          .map((it, i) => ({ ...it, idxOriginal: i }))
          .filter((_, i) => n.selecionados[i])
          .map(it => ({ ...it, eanConfirmado: '', pular: false }))
      }))
      .filter(n => n.itensSelecionados.length > 0)

    if (!notasComItens.length) { alert('Selecione pelo menos um item para importar.'); return }

    setStepNotas(notasComItens)
    setStepNotaIdx(0)
    setStepItemIdx(0)
    const primeiro = notasComItens[0].itensSelecionados[0]
    setStepQtd(primeiro.qtd)
    setStepEan('')
    setStepEanErro('')
    setStepCat(primeiro.categoria)
    setEtapa('confirmando')
  }

  // ── navegação no step ──
  function stepProximo(pular = false) {
    const eanNota = stepNotas[stepNotaIdx].itensSelecionados[stepItemIdx].ean
    const semEan  = !eanNota

    if (!pular) {
      const v = stepEan.trim()
      if (!v) {
        setStepEanErro(semEan ? 'Digite "indisponível" para avançar' : 'Digite o código de barras da nota para avançar')
        return
      }
      if (!semEan && v.replace(/\D/g,'') !== eanNota) {
        setStepEanErro(`Código incorreto. Digite exatamente: ${eanNota}`)
        return
      }
      if (semEan) {
        const vl = v.toLowerCase()
        if (vl !== 'indisponível' && vl !== 'indisponivel') {
          setStepEanErro('A nota não possui EAN. Digite "indisponível" para avançar.')
          return
        }
      }
    }

    const eanFinal = pular ? null
      : (() => { const vl = stepEan.trim().toLowerCase(); return (vl === 'indisponível' || vl === 'indisponivel') ? null : stepEan.replace(/\D/g,'') })()

    // salva no item atual
    const novasNotas = stepNotas.map((n, ni) => {
      if (ni !== stepNotaIdx) return n
      return {
        ...n,
        itensSelecionados: n.itensSelecionados.map((it, ii) => {
          if (ii !== stepItemIdx) return it
          return { ...it, qtd: pular ? 0 : stepQtd, eanConfirmado: eanFinal, categoria: stepCat, pular }
        })
      }
    })
    setStepNotas(novasNotas)

    // avança
    const nota = novasNotas[stepNotaIdx]
    const proxItem = stepItemIdx + 1
    if (proxItem < nota.itensSelecionados.length) {
      setStepItemIdx(proxItem)
      setStepQtd(nota.itensSelecionados[proxItem].qtd)
      setStepEan('')
      setStepEanErro('')
      setStepCat(nota.itensSelecionados[proxItem].categoria)
    } else {
      const proxNota = stepNotaIdx + 1
      if (proxNota < novasNotas.length) {
        setStepNotaIdx(proxNota)
        setStepItemIdx(0)
        const prox = novasNotas[proxNota].itensSelecionados[0]
        setStepQtd(prox.qtd)
        setStepEan('')
        setStepEanErro('')
        setStepCat(prox.categoria)
      } else {
        // todos confirmados
        commitarEstoque(novasNotas)
      }
    }
  }

  function stepAnterior() {
    if (stepItemIdx > 0) {
      const prev = stepItemIdx - 1
      setStepItemIdx(prev)
      const it = stepNotas[stepNotaIdx].itensSelecionados[prev]
      setStepQtd(it.qtd); setStepEan(''); setStepEanErro(''); setStepCat(it.categoria)
    } else if (stepNotaIdx > 0) {
      const prevNota = stepNotaIdx - 1
      setStepNotaIdx(prevNota)
      const itens = stepNotas[prevNota].itensSelecionados
      const prev  = itens.length - 1
      setStepItemIdx(prev)
      const it = itens[prev]
      setStepQtd(it.qtd); setStepEan(''); setStepEanErro(''); setStepCat(it.categoria)
    } else {
      setEtapa('selecao')
    }
  }

  // ── commit no banco ──
  async function commitarEstoque(notasFinais) {
    setSaving(true)
    const { data: produtosDB } = await supabase.from('produtos').select('id,nome,codigo_barras')
    const { data: estoqueDB }  = await supabase.from('estoque').select('id,nome,quantidade,custo_unitario,custo_medio,produto_id,codigo_barras')

    let totalCadastrados = 0, totalAtualizados = 0, totalErros = 0

    for (const nota of notasFinais) {
      const log = []
      let cadastrados = 0, atualizados = 0

      for (const item of nota.itensSelecionados.filter(it => !it.pular && it.qtd > 0)) {
        try {
          const ean = item.eanConfirmado || ''
          const nomeItem = item.nome.trim()
          // custo unitário = custo total / quantidade
          const custoUnitCalc = item.qtd > 0 ? item.custo / item.qtd : item.custo

          // A: produto
          let produtoId = ean ? produtosDB?.find(p => p.codigo_barras === ean)?.id : null
          if (!produtoId && ean) {
            const { data: np, error: ep } = await supabase.from('produtos')
              .insert({ codigo_barras: ean, nome: nomeItem, ativo: true, categoria: item.categoria })
              .select('id').single()
            if (ep) throw new Error(ep.message)
            produtoId = np.id
            produtosDB?.push({ id: np.id, nome: nomeItem, codigo_barras: ean })
          }

          // B: estoque
          let itemEst = null
          if (produtoId) itemEst = estoqueDB?.find(i => i.produto_id === produtoId)
          if (!itemEst && ean) itemEst = estoqueDB?.find(i => i.codigo_barras === ean)
          if (!itemEst) itemEst = estoqueDB?.find(i => (i.nome||'').toLowerCase().trim() === nomeItem.toLowerCase())

          if (!itemEst && produtoId) {
            const { data: f } = await supabase.from('estoque').select('id,quantidade,custo_unitario,custo_medio,produto_id').eq('produto_id', produtoId).maybeSingle()
            if (f) itemEst = f
          }

          if (itemEst) {
            const novaQtd = (itemEst.quantidade || 0) + item.qtd
            const custoAnt = itemEst.custo_medio || itemEst.custo_unitario || 0
            const qtdAnt = itemEst.quantidade || 0
            const custoMedio = qtdAnt > 0 ? ((qtdAnt * custoAnt) + (item.qtd * custoUnitCalc)) / novaQtd : custoUnitCalc
            const payload = { quantidade: novaQtd, custo_unitario: custoUnitCalc, custo_medio: parseFloat(custoMedio.toFixed(2)) }
            if (produtoId && !itemEst.produto_id) payload.produto_id = produtoId
            const { error: eu } = await supabase.from('estoque').update(payload).eq('id', itemEst.id)
            if (eu) throw new Error(eu.message)
            log.push({ id: itemEst.id, nome: nomeItem, qtd: item.qtd, tipo: 'entrada' })
            atualizados++
            itemEst.quantidade = novaQtd
          } else {
            const { data: ne, error: ei } = await supabase.from('estoque').insert({
              produto_id: produtoId, nome: nomeItem, categoria: item.categoria,
              custo_unitario: custoUnitCalc, custo_medio: custoUnitCalc,
              quantidade: item.qtd, unidade: item.unidade, codigo_barras: ean || null,
            }).select('id').single()
            if (ei) throw new Error(ei.message)
            log.push({ id: ne.id, nome: nomeItem, qtd: item.qtd, tipo: 'cadastro' })
            estoqueDB?.push({ id: ne.id, nome: nomeItem, quantidade: item.qtd, produto_id: produtoId, codigo_barras: ean })
            cadastrados++
          }
        } catch (e) {
          console.error('[NF-e]', item.nome, e.message)
          totalErros++
        }
      }

      await supabase.from('nfe_importacoes').insert({
        numero: nota.info.numero, serie: nota.info.serie,
        emitente: nota.info.emitente, cnpj: nota.info.cnpj,
        data_emissao: nota.info.dataEmissao || null,
        itens_json: JSON.stringify(log),
        itens_cadastrados: cadastrados,
        itens_atualizados: atualizados,
        origem: 'nfe',
      })
      totalCadastrados += cadastrados
      totalAtualizados += atualizados
    }

    setSaving(false)
    setResultado({ cadastrados: totalCadastrados, atualizados: totalAtualizados, erros: totalErros, notas: notasFinais })
    setEtapa('sucesso')
  }

  async function desfazerNota(nota) {
    const origem = nota.origem === 'csv' ? 'CSV' : `NF-e ${nota.numero}`
    const emitente = nota.origem === 'csv' ? '' : `\nEmitente: ${nota.emitente}`
    if (!window.confirm(`Desfazer a entrada via ${origem}?${emitente}\n\nAs quantidades adicionadas serão subtraídas do estoque.`)) return
    setDesfazendoId(nota.id)
    try {
      const log = JSON.parse(nota.itens_json || '[]')
      let erros = 0
      for (const it of log) {
        if (!it.id) continue  // itens CSV sem id (tipo:'csv') são ignorados
        try {
          const { data: item } = await supabase.from('estoque').select('quantidade').eq('id', it.id).single()
          if (!item) continue
          const novaQtd = Math.max(0, item.quantidade - it.qtd)
          await supabase.from('estoque').update({ quantidade: novaQtd }).eq('id', it.id)
          await supabase.from('movimentacoes').insert({
            item_id: it.id, item_nome: it.nome, tipo: 'ajuste', quantidade: it.qtd,
            observacoes: `Estorno ${origem}`,
          })
        } catch { erros++ }
      }
      await supabase.from('nfe_importacoes')
        .update({ desfeita: true, desfeita_em: new Date().toISOString() })
        .eq('id', nota.id)
      if (erros > 0) alert(`Atenção: ${erros} item(ns) não puderam ser revertidos.`)
      carregarNotas()
    } catch (e) { alert('Erro ao desfazer: ' + e.message) }
    setDesfazendoId(null)
  }

  function reiniciar() {
    setEtapa('upload'); setNotas([]); setResultado(null); setErro('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── totais da seleção ──
  const totalItens    = notas.reduce((a, n) => a + n.itens.length, 0)
  const totalSelecionados = notas.reduce((a, n) => a + Object.values(n.selecionados).filter(Boolean).length, 0)

  // ── item atual no step ──
  const stepNota   = stepNotas[stepNotaIdx]
  const stepItem   = stepNota?.itensSelecionados[stepItemIdx]
  const totalSteps = stepNotas.reduce((a, n) => a + n.itensSelecionados.length, 0)
  const stepAtual  = stepNotas.slice(0, stepNotaIdx).reduce((a, n) => a + n.itensSelecionados.length, 0) + stepItemIdx + 1
  const jaTemEst   = false  // será checado no commit

  // ── funções CSV ──────────────────────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return { rows: [], erro: 'Arquivo vazio ou sem dados.' }
    const raw = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_'))

    const mapa = {
      nome: ['nome','produto','descricao','description','name'],
      codigo_barras: ['codigo_barras','codigo','ean','gtin','barcode','cod_barras'],
      categoria: ['categoria','category','cat'],
      cor: ['cor','color','colour'],
      tamanho: ['tamanho','size','tam'],
      quantidade: ['quantidade','qtd','qty','quantity','estoque','quant'],
      custo: ['custo','custo_unitario','preco','price','valor','cost'],
      unidade: ['unidade','un','unit','und'],
    }
    const idx = {}
    Object.entries(mapa).forEach(([campo, aliases]) => {
      const found = raw.findIndex(h => aliases.includes(h))
      if (found >= 0) idx[campo] = found
    })
    if (idx.nome === undefined) return { rows: [], erro: 'Coluna "nome" obrigatória não encontrada.' }

    const rows = lines.slice(1).map((line, li) => {
      const vals = line.split(';').map(v => v.trim().replace(/^"|"$/g,''))
      return {
        _linha: li + 2,
        nome:          vals[idx.nome]          || '',
        codigo_barras: vals[idx.codigo_barras] || '',
        categoria:     vals[idx.categoria]     || 'Material escolar',
        cor:           vals[idx.cor]           || '',
        tamanho:       vals[idx.tamanho]       || '',
        quantidade:    parseFloat((vals[idx.quantidade]||'0').replace(',','.')) || 0,
        custo:         parseFloat((vals[idx.custo]||'0').replace(',','.')) || 0,
        unidade:       vals[idx.unidade]       || 'un',
      }
    }).filter(r => r.nome)

    return { rows, erro: null }
  }

  function handleCSVFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows, erro } = parseCSV(ev.target.result)
      if (erro) { alert(erro); return }
      const erros = rows.map(r => {
        if (!r.nome.trim()) return 'Nome obrigatório'
        if (r.quantidade < 0) return 'Quantidade não pode ser negativa'
        return null
      })
      setCsvLinhas(rows)
      setCsvErros(erros)
      setCsvEtapa('previa')
    }
    reader.readAsText(file, 'UTF-8')
  }

  function baixarTemplate() {
    const header = 'nome;codigo_barras;categoria;cor;tamanho;quantidade;custo;unidade'
    const ex1 = 'Lápis HB Faber-Castell;7891360612659;Material escolar;;;100;1.50;un'
    const ex2 = 'Detergente Neutro 500ml;7891149010013;Limpeza;;;24;2.80;un'
    const ex3 = 'Camiseta Polo;7891234567890;Outro;Azul;M;10;35.00;un'
    const csv = [header, ex1, ex2, ex3].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'template_importacao.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function updateCsvLinha(idx, field, value) {
    setCsvLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  async function confirmarCSV() {
    const linhasValidas = csvLinhas.filter((_, i) => !csvErros[i])
    if (!linhasValidas.length) { alert('Nenhuma linha válida para importar.'); return }
    setCsvSaving(true)

    const { data: produtosDB } = await supabase.from('produtos').select('id,nome,codigo_barras')
    const { data: estoqueDB }  = await supabase.from('estoque').select('id,nome,quantidade,custo_unitario,custo_medio,produto_id,codigo_barras')

    let criados = 0, atualizados = 0, erros = 0
    const csvLog = []

    for (const linha of linhasValidas) {
      try {
        const ean = (linha.codigo_barras || '').replace(/\D/g,'')

        // A: produto
        let produto = ean ? produtosDB?.find(p => p.codigo_barras === ean) : null
        if (!produto) produto = produtosDB?.find(p => p.nome?.toLowerCase().trim() === linha.nome.toLowerCase().trim())

        let produtoId = produto?.id || null
        if (!produtoId) {
          const { data: np, error: ep } = await supabase.from('produtos').insert({
            nome: linha.nome.trim(), codigo_barras: ean || null,
            categoria: linha.categoria, cor: linha.cor || null,
            tamanho: linha.tamanho || null, ativo: true,
          }).select('id').single()
          if (ep) throw new Error(ep.message)
          produtoId = np.id
          produtosDB?.push({ id: np.id, nome: linha.nome, codigo_barras: ean })
        }

        // B: estoque
        let itemEst = null
        if (produtoId) itemEst = estoqueDB?.find(i => i.produto_id === produtoId)
        if (!itemEst && ean) itemEst = estoqueDB?.find(i => i.codigo_barras === ean)

        if (itemEst) {
          const novaQtd = (itemEst.quantidade||0) + linha.quantidade
          const custoAnt = itemEst.custo_medio || itemEst.custo_unitario || 0
          const qtdAnt = itemEst.quantidade || 0
          const custoMedio = qtdAnt > 0 ? ((qtdAnt*custoAnt)+(linha.quantidade*linha.custo))/novaQtd : linha.custo
          await supabase.from('estoque').update({
            quantidade: novaQtd, custo_unitario: linha.custo,
            custo_medio: parseFloat(custoMedio.toFixed(2)),
          }).eq('id', itemEst.id)
          csvLog.push({ id: itemEst.id, nome: linha.nome, qtd: linha.quantidade, tipo: 'entrada' })
          atualizados++
        } else {
          const { data: ne } = await supabase.from('estoque').insert({
            produto_id: produtoId, nome: linha.nome.trim(),
            categoria: linha.categoria, custo_unitario: linha.custo,
            custo_medio: linha.custo, quantidade: linha.quantidade,
            unidade: linha.unidade || 'un', codigo_barras: ean || null,
          }).select('id').single()
          if (ne) csvLog.push({ id: ne.id, nome: linha.nome, qtd: linha.quantidade, tipo: 'cadastro' })
          criados++
        }
      } catch(e) { console.error(e); erros++ }
    }

    // registra no histórico de entradas como CSV (com ids reais para poder desfazer)
    await supabase.from('nfe_importacoes').insert({
      numero: `CSV-${new Date().toISOString().slice(0,10)}`,
      serie: '—',
      emitente: 'Importação CSV',
      cnpj: '—',
      data_emissao: new Date().toISOString().split('T')[0],
      itens_json: JSON.stringify(csvLog),
      itens_cadastrados: criados,
      itens_atualizados: atualizados,
      origem: 'csv',
    }).catch(() => {})

    setCsvSaving(false)
    setCsvResultado({ criados, atualizados, erros, total: linhasValidas.length })
    setCsvEtapa('sucesso')
  }

  return (
    <div>
      <div className="page-header"><div className="page-title">NF-e</div></div>

      <div className="tabs">
        <div className={`tab${tabAtiva==='importar'?' active':''}`} onClick={() => setTabAtiva('importar')}>Importar NF-e</div>
        <div className={`tab${tabAtiva==='csv'?' active':''}`} onClick={() => setTabAtiva('csv')}>Importar CSV</div>
        <div className={`tab${tabAtiva==='historico'?' active':''}`} onClick={() => setTabAtiva('historico')}>Entradas</div>
      </div>

      {tabAtiva === 'importar' && (<>

        {/* ══ UPLOAD ══ */}
        {etapa === 'upload' && (
          <div style={{ maxWidth: 580 }}>
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              Importe um ou mais arquivos XML de NF-e. Você poderá revisar cada item antes de confirmar a entrada no estoque.
            </div>
            {erro && <div className="alert alert-danger">{erro}</div>}
            <div className="card">
              <div style={{ border:'2px dashed #d1d5db', borderRadius:10, padding:'40px 24px', textAlign:'center', cursor:'pointer' }}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8' }}
                onDragLeave={e => { e.currentTarget.style.borderColor='#d1d5db' }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='#d1d5db'; handleFiles({ target: { files: e.dataTransfer.files } }) }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Clique ou arraste os arquivos XML aqui</div>
                <div style={{ fontSize: 12, color: '#888' }}>Suporta múltiplos arquivos .xml de NF-e ao mesmo tempo</div>
                <input ref={fileRef} type="file" accept=".xml,.XML" multiple style={{ display:'none' }} onChange={handleFiles} />
              </div>
            </div>
          </div>
        )}

        {/* ══ SELEÇÃO ══ */}
        {etapa === 'selecao' && (
          <>
            {/* resumo geral */}
            <div className="cards-grid" style={{ marginBottom: 16 }}>
              <div className="metric-card"><div className="metric-label">Notas carregadas</div><div className="metric-value blue">{notas.length}</div></div>
              <div className="metric-card"><div className="metric-label">Total de itens</div><div className="metric-value">{totalItens}</div></div>
              <div className="metric-card"><div className="metric-label">Itens selecionados</div><div className="metric-value green">{totalSelecionados}</div></div>
            </div>

            {/* tabs das notas */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
              {notas.map((n, ni) => (
                <div key={ni} style={{ display:'flex', alignItems:'center', gap:0 }}>
                  <button onClick={() => setNotaAtiva(ni)} style={{
                    padding:'6px 14px', fontSize:13, borderRadius:'8px 0 0 8px', cursor:'pointer',
                    border: notaAtiva===ni ? '1.5px solid #1d4ed8' : '1px solid #d1d5db',
                    background: notaAtiva===ni ? '#eff6ff' : '#fff',
                    color: notaAtiva===ni ? '#1d4ed8' : '#555', fontWeight: notaAtiva===ni ? 600 : 400,
                  }}>
                    NF {n.info.numero || n.fileName}
                    <span style={{ marginLeft:6, fontSize:11, background: notaAtiva===ni?'#bfdbfe':'#f5f5f3', padding:'1px 5px', borderRadius:4 }}>
                      {Object.values(n.selecionados).filter(Boolean).length}/{n.itens.length}
                    </span>
                  </button>
                  <button onClick={() => removerNota(ni)} style={{
                    padding:'6px 8px', fontSize:12, borderRadius:'0 8px 8px 0', cursor:'pointer',
                    border: notaAtiva===ni ? '1.5px solid #1d4ed8' : '1px solid #d1d5db',
                    borderLeft:'none', background:'#fff', color:'#dc2626',
                  }}>×</button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} className="btn btn-sm" style={{ borderStyle:'dashed' }}>
                + Adicionar XML
              </button>
              <input ref={fileRef} type="file" accept=".xml,.XML" multiple style={{ display:'none' }} onChange={handleFiles} />
            </div>

            {/* tabela de itens da nota ativa */}
            {notas[notaAtiva] && (() => {
              const nota = notas[notaAtiva]
              const selCount = Object.values(nota.selecionados).filter(Boolean).length
              return (
                <>
                  {/* cabeçalho da nota */}
                  <div className="card" style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:12, padding:'12px 16px' }}>
                    <div><div style={{ fontSize:11, color:'#888' }}>Emitente</div><div style={{ fontWeight:500 }}>{nota.info.emitente}</div></div>
                    <div><div style={{ fontSize:11, color:'#888' }}>CNPJ</div><div style={{ fontWeight:500 }}>{nota.info.cnpj}</div></div>
                    <div><div style={{ fontSize:11, color:'#888' }}>NF / Série</div><div style={{ fontWeight:500 }}>{nota.info.numero} / {nota.info.serie}</div></div>
                    <div><div style={{ fontSize:11, color:'#888' }}>Emissão</div><div style={{ fontWeight:500 }}>{nota.info.dataEmissao ? new Date(nota.info.dataEmissao+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div></div>
                    <div><div style={{ fontSize:11, color:'#888' }}>Arquivo</div><div style={{ fontSize:12, color:'#888' }}>{nota.fileName}</div></div>
                  </div>

                  {/* ações da nota */}
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, gap:8, flexWrap:'wrap' }}>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-sm" onClick={() => toggleTodosNota(notaAtiva, true)}>Selecionar todos</button>
                      <button className="btn btn-sm" onClick={() => toggleTodosNota(notaAtiva, false)}>Desmarcar todos</button>
                    </div>
                    <span style={{ fontSize:13, color:'#888', alignSelf:'center' }}>{selCount} de {nota.itens.length} selecionados</span>
                  </div>

                  <div className="card" style={{ marginBottom: 16 }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width:36 }}>
                            <input type="checkbox"
                              checked={selCount === nota.itens.length}
                              onChange={e => toggleTodosNota(notaAtiva, e.target.checked)}
                              style={{ accentColor:'#1d4ed8' }} />
                          </th>
                          <th>Produto (NF-e)</th><th>EAN</th><th>Qtd</th><th>Custo unit.</th><th>Unid.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nota.itens.map((item, idx) => (
                          <tr key={idx} style={{ opacity: nota.selecionados[idx] ? 1 : 0.4 }}>
                            <td>
                              <input type="checkbox" checked={!!nota.selecionados[idx]}
                                onChange={() => toggleItem(notaAtiva, idx)}
                                style={{ accentColor:'#1d4ed8' }} />
                            </td>
                            <td><strong style={{ fontWeight:500 }}>{item.nome}</strong></td>
                            <td>
                              {item.ean
                                ? <span style={{ fontFamily:'monospace', fontSize:11, background:'#f5f5f3', padding:'2px 6px', borderRadius:4 }}>{item.ean}</span>
                                : <span style={{ fontSize:11, background:'#fef3c7', color:'#d97706', padding:'2px 6px', borderRadius:4 }}>sem EAN</span>}
                            </td>
                            <td style={{ fontWeight:500 }}>{item.qtd} {item.unidade}</td>
                            <td>{fmtR(item.custo)}</td>
                            <td>{item.unidade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}

            {/* ações gerais */}
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <button className="btn" onClick={reiniciar}>← Recomeçar</button>
              <button className="btn btn-primary" onClick={iniciarConfirmacao} disabled={!totalSelecionados}>
                Revisar e confirmar {totalSelecionados} iten{totalSelecionados !== 1 ? 's' : ''} →
              </button>
            </div>
          </>
        )}

        {/* ══ CONFIRMAÇÃO ITEM A ITEM ══ */}
        {etapa === 'confirmando' && stepItem && (
          <div style={{ maxWidth: 580 }}>
            {/* progresso geral */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#888', marginBottom:4 }}>
                <span>
                  Nota {stepNotaIdx+1}/{stepNotas.length} — <strong>{stepNota.info.numero || stepNota.fileName}</strong>
                  &nbsp;· Item {stepItemIdx+1}/{stepNota.itensSelecionados.length}
                </span>
                <span>{stepAtual}/{totalSteps} total</span>
              </div>
              <div style={{ height:6, background:'#e8e8e5', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'#1d4ed8', borderRadius:4, width:`${((stepAtual-1)/totalSteps)*100}%`, transition:'width 0.3s' }} />
              </div>
              {/* bolinhas por nota */}
              <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
                {stepNotas.map((n, ni) => (
                  <div key={ni} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ fontSize:11, color:'#888' }}>NF {n.info.numero||ni+1}</div>
                    <div style={{ display:'flex', gap:3 }}>
                      {n.itensSelecionados.map((it, ii) => {
                        const isAtual = ni===stepNotaIdx && ii===stepItemIdx
                        const isPast  = ni<stepNotaIdx || (ni===stepNotaIdx && ii<stepItemIdx)
                        return (
                          <div key={ii} style={{
                            width:18, height:18, borderRadius:'50%', fontSize:10,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            background: it.pular?'#fee2e2': isPast?'#dcfce7': isAtual?'#1d4ed8':'#f5f5f3',
                            color: it.pular?'#dc2626': isPast?'#16a34a': isAtual?'#fff':'#888',
                            border: isAtual?'2px solid #1d4ed8':'1px solid #e8e8e5',
                          }}>
                            {it.pular?'✕': isPast?'✓': ii+1}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* card do item */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>NF {stepNota.info.numero} — {stepNota.info.emitente}</div>
                  <div style={{ fontSize:16, fontWeight:600 }}>{stepItem.nome}</div>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-row">
                  <label>Quantidade <span style={{ fontSize:11, color:'#888' }}>(NF-e: {stepItem.qtd} {stepItem.unidade})</span></label>
                  <input type="number" min="0" step="0.1" value={stepQtd}
                    onChange={e => setStepQtd(Math.max(0, parseFloat(e.target.value)||0))}
                    style={{ fontSize:16, fontWeight:600, textAlign:'center' }} autoFocus />
                </div>
                <div className="form-row">
                  <label>Custo unitário</label>
                  <input type="number" step="0.01" value={stepItem.custo}
                    onChange={e => setStepNotas(prev => prev.map((n,ni) => ni!==stepNotaIdx?n:{...n,
                      itensSelecionados:n.itensSelecionados.map((it,ii) => ii!==stepItemIdx?it:{...it,custo:parseFloat(e.target.value)||0})}))}
                    style={{ textAlign:'center' }} />
                </div>
              </div>

              <div className="form-row">
                <label>
                  Código de barras (EAN) <span style={{ color:'#dc2626' }}>*</span>
                </label>
                <div style={{
                  padding:'8px 12px', borderRadius:8, marginBottom:8, fontSize:12,
                  background: stepItem.ean ? '#eff6ff' : '#fef3c7',
                  color: stepItem.ean ? '#1d4ed8' : '#d97706',
                  border: `1px solid ${stepItem.ean ? '#bfdbfe' : '#fde68a'}`,
                }}>
                  {stepItem.ean
                    ? <>Digite o código da nota para confirmar: <strong style={{ fontFamily:'monospace' }}>{stepItem.ean}</strong></>
                    : <>Esta nota não possui EAN. Digite <strong>indisponível</strong> para avançar.</>}
                </div>
                <input
                  value={stepEan}
                  onChange={e => { setStepEan(e.target.value); setStepEanErro('') }}
                  onKeyDown={e => e.key==='Enter' && stepProximo(false)}
                  placeholder={stepItem.ean ? 'Digite o código...' : 'indisponível'}
                  style={{
                    fontFamily:'monospace', fontSize:15,
                    borderColor: stepEanErro ? '#dc2626'
                      : stepEan && (stepEan.replace(/\D/g,'')===(stepItem.ean||'') || stepEan.toLowerCase().trim()==='indisponível' || stepEan.toLowerCase().trim()==='indisponivel')
                        ? '#16a34a' : undefined,
                  }}
                />
                {stepEanErro && <div style={{ fontSize:12, color:'#dc2626', marginTop:4, fontWeight:500 }}>⛔ {stepEanErro}</div>}
                {stepEan && !stepEanErro && (stepEan.replace(/\D/g,'')===(stepItem.ean||'') || ['indisponível','indisponivel'].includes(stepEan.toLowerCase().trim())) && (
                  <div style={{ fontSize:12, color:'#16a34a', marginTop:4 }}>✓ Confirmado</div>
                )}
              </div>

              <div className="form-row">
                <label>Categoria</label>
                <select value={stepCat} onChange={e => setStepCat(e.target.value)}>
                  <option>Material escolar</option><option>Limpeza</option>
                  <option>Escritório</option><option>Esportivo</option><option>Outro</option>
                </select>
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <button className="btn" onClick={stepAnterior}>← Anterior</button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-danger" onClick={() => stepProximo(true)}>Pular</button>
                <button className="btn btn-primary" onClick={() => stepProximo(false)} disabled={saving} style={{ minWidth:160 }}>
                  {saving ? 'Salvando...'
                    : stepAtual === totalSteps ? '✓ Confirmar e finalizar'
                    : 'Confirmar →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SUCESSO ══ */}
        {etapa === 'sucesso' && resultado && (
          <div style={{ maxWidth: 540 }}>
            <div className="card" style={{ textAlign:'center', padding:'32px 24px' }}>
              <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
              <h3 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Importação concluída!</h3>
              <div className="cards-grid" style={{ marginBottom:20 }}>
                <div className="metric-card"><div className="metric-label">Notas importadas</div><div className="metric-value blue">{resultado.notas.length}</div></div>
                <div className="metric-card"><div className="metric-label">Novos</div><div className="metric-value green">{resultado.cadastrados}</div></div>
                <div className="metric-card"><div className="metric-label">Entradas</div><div className="metric-value yellow">{resultado.atualizados}</div></div>
                {resultado.erros > 0 && <div className="metric-card"><div className="metric-label">Erros</div><div className="metric-value red">{resultado.erros}</div></div>}
              </div>
              {resultado.notas.map((n, ni) => (
                <div key={ni} style={{ textAlign:'left', borderTop:'1px solid #e8e8e5', paddingTop:12, marginTop:12 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>NF {n.info.numero} — {n.info.emitente}</div>
                  {n.itensSelecionados.filter(it => !it.pular && it.qtd > 0).map((it, ii) => (
                    <div key={ii} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', borderBottom:'1px solid #f5f5f3' }}>
                      <span>{it.nome}</span>
                      <span style={{ color:'#16a34a', fontWeight:500 }}>+{it.qtd}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:20 }}>
                <button className="btn" onClick={reiniciar}>Importar outras NF-es</button>
                <button className="btn btn-primary" onClick={() => setTabAtiva('historico')}>Ver histórico</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ══ CSV ══ */}
      {tabAtiva === 'csv' && (
        <>
          {csvEtapa === 'upload' && (
            <div style={{ maxWidth: 580 }}>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                Importe produtos e quantidades em lote via planilha CSV. Baixe o template, preencha e importe.
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                <button className="btn" onClick={baixarTemplate} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  ⬇ Baixar template CSV
                </button>
              </div>
              <div className="card">
                <div style={{ border:'2px dashed #d1d5db', borderRadius:10, padding:'40px 24px', textAlign:'center', cursor:'pointer' }}
                  onClick={() => csvRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#1d4ed8' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor='#d1d5db' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='#d1d5db'; handleCSVFile({ target: { files: e.dataTransfer.files } }) }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
                  <div style={{ fontWeight:500, marginBottom:6 }}>Clique ou arraste o arquivo CSV aqui</div>
                  <div style={{ fontSize:12, color:'#888' }}>Arquivo .csv com separador ponto e vírgula ( ; )</div>
                  <input ref={csvRef} type="file" accept=".csv,.CSV" style={{ display:'none' }} onChange={handleCSVFile} />
                </div>
              </div>
              <div className="card" style={{ marginTop:16 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Colunas reconhecidas</div>
                <table style={{ fontSize:12 }}>
                  <thead><tr><th>Coluna</th><th>Obrigatório</th><th>Exemplo</th></tr></thead>
                  <tbody>
                    {[
                      ['nome','Sim','Lápis HB'],
                      ['codigo_barras','Não','7891234567890'],
                      ['categoria','Não','Material escolar'],
                      ['cor','Não','Azul'],
                      ['tamanho','Não','M'],
                      ['quantidade','Não','100'],
                      ['custo','Não','1.50'],
                      ['unidade','Não','un'],
                    ].map(([col, obrig, ex]) => (
                      <tr key={col}>
                        <td style={{ fontFamily:'monospace', color:'#1d4ed8' }}>{col}</td>
                        <td>{obrig === 'Sim' ? <span style={{ color:'#dc2626', fontWeight:600 }}>Sim</span> : <span style={{ color:'#888' }}>Não</span>}</td>
                        <td style={{ color:'#888' }}>{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {csvEtapa === 'previa' && (
            <>
              <div className="cards-grid" style={{ marginBottom:16 }}>
                <div className="metric-card"><div className="metric-label">Linhas lidas</div><div className="metric-value blue">{csvLinhas.length}</div></div>
                <div className="metric-card"><div className="metric-label">Válidas</div><div className="metric-value green">{csvLinhas.filter((_,i)=>!csvErros[i]).length}</div></div>
                <div className="metric-card"><div className="metric-label">Com erro</div><div className="metric-value red">{csvErros.filter(Boolean).length}</div></div>
              </div>
              <div className="card" style={{ marginBottom:16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Nome</th><th>Cód. barras</th><th>Categoria</th>
                      <th>Cor</th><th>Tamanho</th><th>Qtd</th><th>Custo</th><th>Unid.</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvLinhas.map((l, i) => (
                      <tr key={i} style={{ background: csvErros[i] ? '#fef2f2' : undefined }}>
                        <td style={{ fontSize:11, color:'#888' }}>{l._linha}</td>
                        <td><strong style={{ fontWeight:500 }}>{l.nome}</strong></td>
                        <td style={{ fontFamily:'monospace', fontSize:11 }}>{l.codigo_barras || <span style={{ color:'#ccc' }}>—</span>}</td>
                        <td>
                          <select value={l.categoria} onChange={e => updateCsvLinha(i,'categoria',e.target.value)}
                            style={{ padding:'2px 4px', fontSize:12, border:'1px solid #d1d5db', borderRadius:4 }}>
                            <option>Material escolar</option><option>Limpeza</option>
                            <option>Escritório</option><option>Esportivo</option><option>Outro</option>
                          </select>
                        </td>
                        <td>{l.cor || <span style={{ color:'#ccc' }}>—</span>}</td>
                        <td>{l.tamanho || <span style={{ color:'#ccc' }}>—</span>}</td>
                        <td>
                          <input type="number" min="0" step="0.1" value={l.quantidade}
                            onChange={e => updateCsvLinha(i,'quantidade',parseFloat(e.target.value)||0)}
                            style={{ width:70, padding:'2px 4px', fontSize:12, border:'1px solid #d1d5db', borderRadius:4, textAlign:'center' }} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" value={l.custo}
                            onChange={e => updateCsvLinha(i,'custo',parseFloat(e.target.value)||0)}
                            style={{ width:80, padding:'2px 4px', fontSize:12, border:'1px solid #d1d5db', borderRadius:4, textAlign:'center' }} />
                        </td>
                        <td>{l.unidade}</td>
                        <td>
                          {csvErros[i]
                            ? <span style={{ color:'#dc2626', fontSize:11 }}>⚠ {csvErros[i]}</span>
                            : <span style={{ color:'#16a34a', fontSize:11 }}>✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                <button className="btn" onClick={() => { setCsvEtapa('upload'); setCsvLinhas([]); if(csvRef.current) csvRef.current.value='' }}>← Voltar</button>
                <button className="btn btn-primary" onClick={confirmarCSV} disabled={csvSaving || !csvLinhas.filter((_,i)=>!csvErros[i]).length}>
                  {csvSaving ? 'Importando...' : `Importar ${csvLinhas.filter((_,i)=>!csvErros[i]).length} produto(s)`}
                </button>
              </div>
            </>
          )}

          {csvEtapa === 'sucesso' && csvResultado && (
            <div style={{ maxWidth:480 }}>
              <div className="card" style={{ textAlign:'center', padding:'32px 24px' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>✅</div>
                <h3 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>Importação CSV concluída!</h3>
                <div className="cards-grid" style={{ marginBottom:24 }}>
                  <div className="metric-card"><div className="metric-label">Criados</div><div className="metric-value green">{csvResultado.criados}</div></div>
                  <div className="metric-card"><div className="metric-label">Atualizados</div><div className="metric-value yellow">{csvResultado.atualizados}</div></div>
                  {csvResultado.erros > 0 && <div className="metric-card"><div className="metric-label">Erros</div><div className="metric-value red">{csvResultado.erros}</div></div>}
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
                  <button className="btn" onClick={() => { setCsvEtapa('upload'); setCsvLinhas([]); setCsvResultado(null) }}>Importar outro CSV</button>
                  <button className="btn btn-primary" onClick={() => setTabAtiva('historico')}>Ver entradas</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ HISTÓRICO ══ */}}
      {tabAtiva === 'historico' && (
        loadingNotas ? <div className="loading">Carregando...</div> : (
          <div className="card">
            <table>
              <thead><tr><th>Origem</th><th>NF / Série</th><th>Emitente</th><th>Data emissão</th><th>Importado em</th><th>Novos</th><th>Entradas</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                {notasImportadas.map(nota => (
                  <tr key={nota.id} style={{ opacity: nota.desfeita ? 0.5 : 1 }}>
                    <td>
                      {nota.origem === 'csv'
                        ? <span className="badge badge-info">CSV</span>
                        : <span className="badge badge-neutral">NF-e</span>}
                    </td>
                    <td><strong style={{ fontWeight:500 }}>{nota.numero === 'CSV' ? '—' : `${nota.numero} / ${nota.serie}`}</strong></td>
                    <td>{nota.emitente}</td>
                    <td>{fmtData(nota.data_emissao)}</td>
                    <td style={{ fontSize:12, color:'#888' }}>{nota.created_at ? new Date(nota.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td><span className="badge badge-success">{nota.itens_cadastrados}</span></td>
                    <td><span className="badge badge-warning">{nota.itens_atualizados}</span></td>
                    <td>{nota.desfeita ? <span className="badge badge-neutral">Desfeita</span> : <span className="badge badge-success">Ativa</span>}</td>
                    <td>{!nota.desfeita && <button className="btn btn-sm btn-danger" disabled={desfazendoId===nota.id} onClick={() => desfazerNota(nota)}>{desfazendoId===nota.id?'Desfazendo...':'Desfazer'}</button>}</td>
                  </tr>
                ))}
                {!notasImportadas.length && <tr><td colSpan={9} className="empty">Nenhuma NF-e importada ainda</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
