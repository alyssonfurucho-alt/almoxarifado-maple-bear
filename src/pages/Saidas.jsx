import { useEffect, useState } from 'react'
import { useSort } from '../lib/useSort'
import Th from '../components/Th'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

const emptyLinha = () => ({ item_id: '', quantidade: 1, devolvivel: false, data_devolucao_prevista: '' })

export default function Saidas() {
  const [saidas, setSaidas] = useState([])
  const [estoque, setEstoque] = useState([])
  const [professores, setProfessores] = useState([])
  const [turmas, setTurmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [professor_id, setProfessorId] = useState('')
  const [turma_id, setTurmaId] = useState('')
  const [data_saida, setDataSaida] = useState(hoje())
  const [observacoes, setObservacoes] = useState('')
  const [linhas, setLinhas] = useState([emptyLinha()])

  const [desfazendoId, setDesfazendoId]   = useState(null)
  const [filDe, setFilDe]                 = useState('')
  const [filAte, setFilAte]               = useState('')
  const [filProf, setFilProf]             = useState('')
  const [filTurma, setFilTurma]           = useState('')
  const [modalDev, setModalDev]           = useState(null)  // saida para devolver
  const [devQtd, setDevQtd]               = useState('')
  const [devAvaria, setDevAvaria]         = useState(false)
  const [devAvDesc, setDevAvDesc]         = useState('')
  const [devAvQtd, setDevAvQtd]           = useState('')
  const [savingDev, setSavingDev]         = useState(false)
  const { sorted: saidasSorted, sortKey, sortDir, toggleSort } = useSort(saidas, 'created_at', 'asc')
  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: i }, { data: p }, { data: t }] = await Promise.all([
      supabase.from('saidas').select('*, estoque(nome,custo_unitario,ultimo_custo,produtos(nome,cor,tamanho,codigo_barras)), professores(nome,registro), turmas(codigo)').order('created_at', { ascending: false }),
      supabase.from('estoque').select('id,nome,quantidade,unidade,custo_unitario,ultimo_custo,custo_medio,produtos(nome,cor,tamanho,codigo_barras)').order('nome'),
      supabase.from('professores').select('id,nome,registro').eq('ativo', true).order('nome'),
      supabase.from('turmas').select('id,codigo').eq('ativo', true).order('codigo'),
    ])
    setSaidas(s || []); setEstoque(i || [])
    setProfessores(p || []); setTurmas(t || [])
    setLoading(false)
  }

  function nomeProduto(item) {
    if (!item) return '—'
    const p = item.produtos
    if (!p) return item.nome || '—'
    return `${p.nome}${p.cor ? ` — ${p.cor}` : ''}${p.tamanho ? ` ${p.tamanho}` : ''}`
  }

  function openModal() {
    setProfessorId(''); setTurmaId('')
    setDataSaida(hoje()); setObservacoes('')
    setLinhas([emptyLinha()]); setModal(true)
  }

  function addLinha() { if (linhas.length < 10) setLinhas([...linhas, emptyLinha()]) }
  function removeLinha(idx) { if (linhas.length > 1) setLinhas(linhas.filter((_, i) => i !== idx)) }

  function updateLinha(idx, field, value) {
    setLinhas(linhas.map((l, i) => {
      if (i !== idx) return l
      const u = { ...l, [field]: value }
      if (field === 'devolvivel' && value && !l.data_devolucao_prevista) {
        const d = new Date(); d.setDate(d.getDate() + 7)
        u.data_devolucao_prevista = d.toISOString().split('T')[0]
      }
      if (field === 'devolvivel' && !value) u.data_devolucao_prevista = ''
      return u
    }))
  }

  async function salvar() {
    if (!professor_id) return alert('Selecione o(a) professor(a)')
    if (!turma_id)     return alert('Selecione a turma')
    const validas = linhas.filter(l => l.item_id)
    if (!validas.length) return alert('Adicione pelo menos um item')
    for (const l of validas) {
      if (l.quantidade < 1) return alert('Quantidade deve ser maior que zero')
      const item = estoque.find(i => i.id === l.item_id)
      if (parseInt(l.quantidade) > item.quantidade)
        return alert(`Estoque insuficiente para "${nomeProduto(item)}". Disponível: ${item.quantidade} ${item.unidade}`)
      if (l.devolvivel && !l.data_devolucao_prevista)
        return alert(`Informe a data de devolução para "${nomeProduto(item)}"`)
    }
    const prof  = professores.find(p => p.id === professor_id)
    const turma = turmas.find(t => t.id === turma_id)
    setSaving(true)
    for (const l of validas) {
      const item = estoque.find(i => i.id === l.item_id)
      const custoSaida = item.ultimo_custo || item.custo_unitario || 0
      const { data: saida } = await supabase.from('saidas').insert({
        item_id: l.item_id,
        quantidade: parseInt(l.quantidade),
        professor_id, professor_nome_snapshot: prof?.nome,
        turma_id, turma_codigo_snapshot: turma?.codigo,
        data_saida,
        devolvivel: l.devolvivel,
        data_devolucao_prevista: l.devolvivel ? l.data_devolucao_prevista : null,
        devolvido: 0, observacoes,
        custo_unitario_saida: custoSaida,
      }).select().single()
      await supabase.from('estoque').update({ quantidade: item.quantidade - parseInt(l.quantidade) }).eq('id', l.item_id)
      // se professor for "Inventário", marca o item de estoque como inventario
      if (prof?.nome?.toLowerCase().replace(/[áàãâä]/g,'a').includes('inventario')) {
        await supabase.from('estoque').update({ inventario: true }).eq('id', l.item_id)
      }
      await supabase.from('movimentacoes').insert({
        item_id: l.item_id, item_nome: nomeProduto(item),
        tipo: 'saida', quantidade: parseInt(l.quantidade),
        professor_id, professor_nome: prof?.nome,
        turma_id, turma_codigo: turma?.codigo,
        referencia_id: saida?.id, observacoes,
      })
    }
    setSaving(false); setModal(false); load()
  }

  const estoquePorItem = Object.fromEntries(estoque.map(i => [i.id, i]))
  const itensSelecionados = idxAtual => linhas.map((l, i) => i !== idxAtual ? l.item_id : null).filter(Boolean)

  async function desfazerSaida(saida) {
    if (!window.confirm(`Desfazer a saída de "${nomeProduto(saida.estoque)}"?\n\nA quantidade será devolvida ao estoque.`)) return
    setDesfazendoId(saida.id)
    try {
      const qtd = saida.quantidade || 0
      // devolve quantidade ao estoque
      const { data: item } = await supabase.from('estoque').select('quantidade').eq('id', saida.item_id).single()
      if (item) {
        await supabase.from('estoque').update({ quantidade: (item.quantidade || 0) + qtd }).eq('id', saida.item_id)
      }
      // registra no histórico
      await supabase.from('movimentacoes').insert({
        item_id: saida.item_id,
        item_nome: nomeProduto(saida.estoque),
        tipo: 'ajuste',
        quantidade: qtd,
        observacoes: `Estorno de saída — ${saida.professor_nome_snapshot || ''} / ${saida.turma_codigo_snapshot || ''}`,
      })
      // remove devoluções vinculadas
      await supabase.from('devolucoes').delete().eq('saida_id', saida.id)
      // remove a saída
      await supabase.from('saidas').delete().eq('id', saida.id)
      load()
    } catch (e) { alert('Erro ao desfazer: ' + e.message) }
    setDesfazendoId(null)
  }

  async function registrarDevolucao() {
    const qtd = parseFloat(devQtd)
    if (!qtd || qtd <= 0) return alert('Informe a quantidade devolvida')
    const pend = modalDev.quantidade - (modalDev.devolvido || 0)
    if (qtd > pend) return alert(`Quantidade máxima a devolver: ${pend}`)
    setSavingDev(true)
    try {
      const avQtd = devAvaria ? (parseFloat(devAvQtd) || 0) : 0
      // registra devolução
      const { error: errDev } = await supabase.from('devolucoes').insert({
        saida_id:          modalDev.id,
        quantidade:        qtd,
        data_devolucao:    new Date().toISOString().split('T')[0],
        avaria:            devAvaria,
        avaria_descricao:  devAvaria ? devAvDesc : null,
        avaria_quantidade: avQtd,
        observacoes:       `Devolução — ${modalDev.professor_nome_snapshot || ''}`,
      })
      if (errDev) throw new Error('Erro ao registrar devolução: ' + errDev.message)
      // atualiza devolvido na saída
      const devAtual = parseFloat(modalDev.devolvido) || 0
      const novoDevolvido = parseFloat((devAtual + qtd).toFixed(3))
      const { error: errUpd } = await supabase.from('saidas').update({ devolvido: novoDevolvido }).eq('id', modalDev.id)
      if (errUpd) throw new Error('Erro ao atualizar saída: ' + errUpd.message)
      // devolve ao estoque (descontando avaria)
      const qtdEstoque = qtd - avQtd
      if (qtdEstoque > 0) {
        const { data: item } = await supabase.from('estoque').select('quantidade').eq('id', modalDev.item_id).single()
        if (item) await supabase.from('estoque').update({ quantidade: (item.quantidade || 0) + qtdEstoque }).eq('id', modalDev.item_id)
      }
      // histórico
      await supabase.from('movimentacoes').insert({
        item_id:       modalDev.item_id,
        item_nome:     nomeProduto(modalDev.estoque),
        tipo:          'devolucao',
        quantidade:    qtd,
        professor_id:  modalDev.professor_id,
        professor_nome: modalDev.professor_nome_snapshot,
        turma_id:      modalDev.turma_id,
        turma_codigo:  modalDev.turma_codigo_snapshot,
        observacoes:   `Devolução — ${modalDev.professor_nome_snapshot || ''}${devAvaria ? ` | Avaria: ${devAvDesc}` : ''}`,
      })
      setModalDev(null); setDevQtd(''); setDevAvaria(false); setDevAvDesc(''); setDevAvQtd('')
      load()
    } catch (e) { alert('Erro: ' + e.message) }
    setSavingDev(false)
  }

  function exportarExcel() {
    const lista = saidasSorted.filter(s => {
      if (filDe    && s.data_saida < filDe)   return false
      if (filAte   && s.data_saida > filAte)  return false
      if (filProf  && (s.professores?.nome || s.professor_nome_snapshot) !== filProf) return false
      if (filTurma && (s.turmas?.codigo || s.turma_codigo_snapshot) !== filTurma) return false
      return true
    })
    const headers = ['Data','Produto','Cor','Tamanho','Qtd','Professor(a)','Registro','Turma','Devolvível','Dev. prevista','Devolvido','Pendente','Custo unit.','Custo total']
    const rows = lista.map(s => {
      const prod = s.estoque?.produtos
      const nome = prod ? `${prod.nome}${prod.cor?` - ${prod.cor}`:''}${prod.tamanho?` ${prod.tamanho}`:''}` : (s.estoque?.nome||'')
      const custo = s.custo_unitario_saida || s.estoque?.custo_medio || s.estoque?.custo_unitario || 0
      return [
        s.data_saida || '',
        nome,
        prod?.cor || '',
        prod?.tamanho || '',
        s.quantidade,
        s.professores?.nome || s.professor_nome_snapshot || '',
        s.professores?.registro || '',
        s.turmas?.codigo || s.turma_codigo_snapshot || '',
        s.devolvivel ? 'Sim' : 'Não',
        s.data_devolucao_prevista || '',
        s.devolvido || 0,
        Math.max(0, s.quantidade - (s.devolvido||0)),
        custo.toFixed(2),
        (custo * s.quantidade).toFixed(2),
      ]
    })
    const csvContent = [headers, ...rows]
      .map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n')
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saidas_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimir() {
    window.print()
  }

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Saídas</div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={imprimir} title="Imprimir">🖨 Imprimir</button>
          <button className="btn" onClick={exportarExcel} title="Exportar CSV/Excel">📥 Exportar</button>
          <button className="btn btn-primary" onClick={openModal}>+ Nova saída</button>
        </div>
      </div>

      {(!professores.length || !turmas.length) && (
        <div className="alert alert-warning">
          {!professores.length && 'Cadastre professores antes de registrar saídas. '}
          {!turmas.length && 'Cadastre turmas antes de registrar saídas.'}
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom:16, padding:'14px 16px' }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>De</label>
            <input type="date" value={filDe} onChange={e => setFilDe(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Até</label>
            <input type="date" value={filAte} onChange={e => setFilAte(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Professor(a)</label>
            <select value={filProf} onChange={e => setFilProf(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, minWidth:180 }}>
              <option value="">Todos</option>
              {professores.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, color:'#666', display:'block', marginBottom:4 }}>Turma</label>
            <select value={filTurma} onChange={e => setFilTurma(e.target.value)}
              style={{ padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:8, fontSize:13, minWidth:120 }}>
              <option value="">Todas</option>
              {turmas.map(t => <option key={t.id} value={t.codigo}>{t.codigo}</option>)}
            </select>
          </div>
          {(filDe||filAte||filProf||filTurma) && (
            <button className="btn btn-sm" style={{ alignSelf:'flex-end' }}
              onClick={() => { setFilDe(''); setFilAte(''); setFilProf(''); setFilTurma('') }}>
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="print-area">
        <div className="print-header">Maple Bear Dourados — Saídas</div>
        <div className="print-sub">
          {filDe || filAte ? `Período: ${filDe||'início'} a ${filAte||'hoje'}` : 'Todos os períodos'}
          {filProf ? ` · Professor(a): ${filProf}` : ''}
          {filTurma ? ` · Turma: ${filTurma}` : ''}
        </div>
        <div className="card" style={{marginBottom:0}}>
        <table>
          <thead><tr><Th label="Data" colKey="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Produto" colKey="professor_nome_snapshot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Cor" colKey="cor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Tamanho" colKey="tamanho" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Qtd" colKey="quantidade" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Professor(a)" colKey="professor_nome_snapshot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Turma" colKey="turma_codigo_snapshot" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><Th label="Custo" colKey="custo" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><th>Devolvível</th><Th label="Dev. prevista" colKey="data_devolucao_prevista" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}/><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            {saidasSorted.filter(s => {
                if (filDe    && s.data_saida < filDe)   return false
                if (filAte   && s.data_saida > filAte)  return false
                if (filProf  && (s.professores?.nome || s.professor_nome_snapshot) !== filProf) return false
                if (filTurma && (s.turmas?.codigo || s.turma_codigo_snapshot) !== filTurma) return false
                return true
              }).map(s => {
              const st = statusDevolucao(s)
              const prod = s.estoque?.produtos
              return (
                <tr key={s.id}>
                  <td>{fmtData(s.data_saida)}</td>
                  <td><strong style={{ fontWeight: 500 }}>{prod?.nome || s.estoque?.nome || '—'}</strong></td>
                  <td>{prod?.cor || '—'}</td>
                  <td>{prod?.tamanho || '—'}</td>
                  <td>{s.quantidade}</td>
                  <td>{s.professores?.nome || s.professor_nome_snapshot || '—'}</td>
                  <td><strong style={{ fontWeight: 500 }}>{s.turmas?.codigo || s.turma_codigo_snapshot || '—'}</strong></td>
                  <td>{fmtR((s.custo_unitario_saida || s.estoque?.custo_unitario || 0) * s.quantidade)}</td>
                  <td>{s.devolvivel ? <span className="badge badge-info">Sim</span> : <span className="badge badge-neutral">Não</span>}</td>
                  <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '-'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ display:'flex', gap:6 }}>
                    {(s.devolvido || 0) < s.quantidade && (
                      <button className="btn btn-sm btn-primary"
                        onClick={() => { setModalDev(s); setDevQtd(''); setDevAvaria(false); setDevAvDesc(''); setDevAvQtd('') }}>
                        Devolução
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={desfazendoId === s.id}
                      onClick={() => desfazerSaida(s)}>
                      {desfazendoId === s.id ? 'Desfazendo...' : 'Desfazer'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {!saidas.length && <tr><td colSpan={11} className="empty">Nenhuma saída registrada</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal" style={{ width: 660 }}>
          <h3>Registrar saída</h3>
          <div className="form-grid">
            <div className="form-row"><label>Professor(a)</label>
              <select value={professor_id} onChange={e => setProfessorId(e.target.value)}>
                <option value="">Selecione...</option>
                {professores.map(p => <option key={p.id} value={p.id}>{p.nome}{p.registro ? ` — ${p.registro}` : ''}</option>)}
              </select>
            </div>
            <div className="form-row"><label>Turma</label>
              <select value={turma_id} onChange={e => setTurmaId(e.target.value)}>
                <option value="">Selecione...</option>
                {turmas.map(t => <option key={t.id} value={t.id}>{t.codigo}</option>)}
              </select>
            </div>
            <div className="form-row"><label>Data de saída</label>
              <input type="date" value={data_saida} onChange={e => setDataSaida(e.target.value)} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e8e8e5', margin: '12px 0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 6px' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#555' }}>Produtos ({linhas.filter(l => l.item_id).length}/{linhas.length})</span>
              {linhas.length < 10 && <button className="btn btn-sm" onClick={addLinha}>+ Adicionar produto</button>}
            </div>

            {linhas.map((linha, idx) => {
              const itemSel = estoquePorItem[linha.item_id]
              const selecionados = itensSelecionados(idx)
              return (
                <div key={idx} style={{ border: '1px solid #e8e8e5', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: linha.item_id ? '#fafaf8' : '#fff' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 32px', gap: 8, alignItems: 'flex-end' }}>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Produto {idx + 1}</label>
                      <select value={linha.item_id} onChange={e => updateLinha(idx, 'item_id', e.target.value)}>
                        <option value="">Selecione...</option>
                        {estoque.map(i => (
                          <option key={i.id} value={i.id} disabled={selecionados.includes(i.id) || i.quantidade === 0}>
                            {nomeProduto(i)} ({i.quantidade} {i.unidade}){i.quantidade === 0 ? ' — sem estoque' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Qtd</label>
                      <input type="number" min="1" max={itemSel?.quantidade || 999} value={linha.quantidade} onChange={e => updateLinha(idx, 'quantidade', e.target.value)} />
                    </div>
                    <button onClick={() => removeLinha(idx)} disabled={linhas.length === 1} style={{ width: 28, height: 28, marginTop: 18, border: '1px solid #fecaca', borderRadius: 6, background: linhas.length === 1 ? '#f5f5f3' : '#fee2e2', color: linhas.length === 1 ? '#ccc' : '#dc2626', cursor: linhas.length === 1 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                  {linha.item_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#555' }}>
                        <input type="checkbox" checked={linha.devolvivel} onChange={e => updateLinha(idx, 'devolvivel', e.target.checked)} style={{ accentColor: '#1d4ed8' }} />
                        Passível de devolução
                      </label>
                      {linha.devolvivel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Dev. prevista:</label>
                          <input type="date" value={linha.data_devolucao_prevista} onChange={e => updateLinha(idx, 'data_devolucao_prevista', e.target.value)} style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
                        </div>
                      )}
                      {itemSel && (
                        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>
                          Estoque: {itemSel.quantidade} {itemSel.unidade} · Último custo: {fmtR(itemSel.ultimo_custo || itemSel.custo_unitario || 0)} un
                          {linha.quantidade > 0 && <strong style={{ color: '#1d4ed8' }}> · Total: {fmtR(itemSel.custo_unitario * parseInt(linha.quantidade || 0))}</strong>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {linhas.some(l => l.item_id) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 4px', fontSize: 13, color: '#555', borderTop: '1px solid #e8e8e5', marginTop: 4 }}>
                Total:&nbsp;<strong style={{ color: '#1d4ed8' }}>{fmtR(linhas.reduce((acc, l) => { const i = estoquePorItem[l.item_id]; return acc + (i ? (i.ultimo_custo || i.custo_unitario || 0) * parseInt(l.quantidade || 0) : 0) }, 0))}</strong>
              </div>
            )}
          </div>

          <div className="form-row">
            <label>Observações gerais</label>
            <textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional..." />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : `Registrar saída (${linhas.filter(l => l.item_id).length} produto${linhas.filter(l => l.item_id).length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      </div>
      {/* Modal Devolução */}
      <div className={`modal-overlay${modalDev ? ' open' : ''}`}>
        <div className="modal" style={{ width:440 }}>
          <h3>Registrar devolução</h3>
          {modalDev && (
            <>
              <div style={{ background:'#f5f5f3', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
                <div><strong>{nomeProduto(modalDev.estoque)}</strong></div>
                <div style={{ color:'#888', marginTop:4 }}>
                  {modalDev.professor_nome_snapshot} · {modalDev.turma_codigo_snapshot}
                  &nbsp;· Pendente: <strong>{modalDev.quantidade - (modalDev.devolvido||0)}</strong>
                </div>
              </div>
              <div className="form-row">
                <label>Quantidade devolvida</label>
                <input type="number" min="0.001" step="0.001"
                  max={modalDev.quantidade - (modalDev.devolvido||0)}
                  value={devQtd} onChange={e => setDevQtd(e.target.value)}
                  placeholder="0" autoFocus />
              </div>
              <div className="form-row" style={{ marginTop:8 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={devAvaria} onChange={e => setDevAvaria(e.target.checked)}
                    style={{ accentColor:'#dc2626' }} />
                  <span>Possui <strong style={{ color:'#dc2626' }}>avaria</strong></span>
                </label>
              </div>
              {devAvaria && (
                <div className="form-grid">
                  <div className="form-row">
                    <label>Descrição da avaria</label>
                    <input value={devAvDesc} onChange={e => setDevAvDesc(e.target.value)} placeholder="Descreva..." />
                  </div>
                  <div className="form-row">
                    <label>Qtd avariada</label>
                    <input type="number" min="0" step="0.001" value={devAvQtd} onChange={e => setDevAvQtd(e.target.value)} placeholder="0" />
                  </div>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn" onClick={() => setModalDev(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={registrarDevolucao} disabled={savingDev}>
                  {savingDev ? 'Salvando...' : 'Confirmar devolução'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
