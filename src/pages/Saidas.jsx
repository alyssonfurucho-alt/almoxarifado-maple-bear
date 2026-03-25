import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

const emptyLinha = () => ({
  item_id: '', quantidade: 1, devolvivel: false, data_devolucao_prevista: ''
})

export default function Saidas() {
  const [saidas, setSaidas] = useState([])
  const [itens, setItens] = useState([])
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

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: i }, { data: p }, { data: t }] = await Promise.all([
      supabase.from('saidas')
        .select('*, itens(nome,custo_unitario), professores(nome,registro), turmas(codigo,turno)')
        .order('created_at', { ascending: false }),
      supabase.from('itens').select('id,nome,quantidade,unidade').order('nome'),
      supabase.from('professores').select('id,nome,registro').eq('ativo', true).order('nome'),
      supabase.from('turmas').select('id,codigo,turno').eq('ativo', true).order('turno').order('codigo'),
    ])
    setSaidas(s || []); setItens(i || [])
    setProfessores(p || []); setTurmas(t || [])
    setLoading(false)
  }

  function openModal() {
    setProfessorId(''); setTurmaId('')
    setDataSaida(hoje()); setObservacoes('')
    setLinhas([emptyLinha()])
    setModal(true)
  }

  function addLinha() {
    if (linhas.length >= 10) return
    setLinhas([...linhas, emptyLinha()])
  }

  function removeLinha(idx) {
    if (linhas.length === 1) return
    setLinhas(linhas.filter((_, i) => i !== idx))
  }

  function updateLinha(idx, field, value) {
    setLinhas(linhas.map((l, i) => {
      if (i !== idx) return l
      const updated = { ...l, [field]: value }
      // ao marcar devolvivel, sugere data +7 dias
      if (field === 'devolvivel' && value && !l.data_devolucao_prevista) {
        const d = new Date(); d.setDate(d.getDate() + 7)
        updated.data_devolucao_prevista = d.toISOString().split('T')[0]
      }
      if (field === 'devolvivel' && !value) {
        updated.data_devolucao_prevista = ''
      }
      return updated
    }))
  }

  // itens já selecionados nas outras linhas (para desabilitar duplicatas)
  function itensSelecionados(idxAtual) {
    return linhas.map((l, i) => i !== idxAtual ? l.item_id : null).filter(Boolean)
  }

  async function salvar() {
    if (!professor_id) return alert('Selecione o(a) professor(a)')
    if (!turma_id)     return alert('Selecione a turma')

    const linhasValidas = linhas.filter(l => l.item_id)
    if (!linhasValidas.length) return alert('Adicione pelo menos um item')

    for (const l of linhasValidas) {
      if (!l.quantidade || l.quantidade < 1) return alert('Quantidade deve ser maior que zero')
      const item = itens.find(i => i.id === l.item_id)
      if (parseInt(l.quantidade) > item.quantidade)
        return alert(`Estoque insuficiente para "${item.nome}". Disponível: ${item.quantidade} ${item.unidade}`)
      if (l.devolvivel && !l.data_devolucao_prevista)
        return alert(`Informe a data de devolução para "${item.nome}"`)
    }

    const prof  = professores.find(p => p.id === professor_id)
    const turma = turmas.find(t => t.id === turma_id)

    setSaving(true)
    for (const l of linhasValidas) {
      const item = itens.find(i => i.id === l.item_id)
      const { data: saida } = await supabase.from('saidas').insert({
        item_id: l.item_id,
        quantidade: parseInt(l.quantidade),
        professor_id,
        professor_nome_snapshot: prof?.nome,
        turma_id,
        turma_codigo_snapshot: turma?.codigo,
        data_saida,
        devolvivel: l.devolvivel,
        data_devolucao_prevista: l.devolvivel ? l.data_devolucao_prevista : null,
        devolvido: 0,
        observacoes,
      }).select().single()

      await supabase.from('itens')
        .update({ quantidade: item.quantidade - parseInt(l.quantidade) })
        .eq('id', l.item_id)

      await supabase.from('movimentacoes').insert({
        item_id: l.item_id, item_nome: item.nome,
        tipo: 'saida', quantidade: parseInt(l.quantidade),
        professor_id, professor_nome: prof?.nome,
        turma_id, turma_codigo: turma?.codigo,
        referencia_id: saida?.id, observacoes,
      })
    }

    setSaving(false)
    setModal(false)
    load()
  }

  const porTurno = turmas.reduce((acc, t) => {
    ;(acc[t.turno] ??= []).push(t); return acc
  }, {})

  const estoquePorItem = Object.fromEntries(itens.map(i => [i.id, i]))

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Saídas</div>
        <button className="btn btn-primary" onClick={openModal}>+ Nova saída</button>
      </div>

      {(!professores.length || !turmas.length) && (
        <div className="alert alert-warning">
          {!professores.length && 'Cadastre professores antes de registrar saídas. '}
          {!turmas.length && 'Cadastre turmas antes de registrar saídas.'}
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th>
              <th>Registro</th><th>Turma</th><th>Turno</th><th>Custo</th>
              <th>Devolvível</th><th>Dev. prevista</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {saidas.map(s => {
              const st = statusDevolucao(s)
              return (
                <tr key={s.id}>
                  <td>{fmtData(s.data_saida)}</td>
                  <td>{s.itens?.nome}</td>
                  <td>{s.quantidade}</td>
                  <td>{s.professores?.nome || s.professor_nome_snapshot || '—'}</td>
                  <td><span className="badge badge-neutral" style={{ fontSize: 11 }}>{s.professores?.registro || '—'}</span></td>
                  <td><strong style={{ fontWeight: 500 }}>{s.turmas?.codigo || s.turma_codigo_snapshot || '—'}</strong></td>
                  <td>{s.turmas?.turno || '—'}</td>
                  <td>{fmtR((s.itens?.custo_unitario || 0) * s.quantidade)}</td>
                  <td>{s.devolvivel ? <span className="badge badge-info">Sim</span> : <span className="badge badge-neutral">Não</span>}</td>
                  <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '-'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                </tr>
              )
            })}
            {!saidas.length && <tr><td colSpan={11} className="empty">Nenhuma saída registrada</td></tr>}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal" style={{ width: 640 }}>
          <h3>Registrar saída</h3>

          {/* Cabeçalho: professor, turma, data */}
          <div className="form-grid">
            <div className="form-row">
              <label>Professor(a)</label>
              <select value={professor_id} onChange={e => setProfessorId(e.target.value)}>
                <option value="">Selecione...</option>
                {professores.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}{p.registro ? ` — ${p.registro}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Turma</label>
              <select value={turma_id} onChange={e => setTurmaId(e.target.value)}>
                <option value="">Selecione...</option>
                {Object.entries(porTurno).map(([turno, ts]) => (
                  <optgroup key={turno} label={`— ${turno} —`}>
                    {ts.map(t => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Data de saída</label>
              <input type="date" value={data_saida} onChange={e => setDataSaida(e.target.value)} />
            </div>
          </div>

          {/* Linhas de itens */}
          <div style={{ borderTop: '1px solid #e8e8e5', margin: '12px 0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 6px' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#555' }}>
                Itens ({linhas.filter(l => l.item_id).length}/{linhas.length})
              </span>
              {linhas.length < 10 && (
                <button className="btn btn-sm" onClick={addLinha}>+ Adicionar item</button>
              )}
            </div>

            {linhas.map((linha, idx) => {
              const itemSel = estoquePorItem[linha.item_id]
              const selecionados = itensSelecionados(idx)
              return (
                <div key={idx} style={{
                  border: '1px solid #e8e8e5', borderRadius: 8,
                  padding: '10px 12px', marginBottom: 8,
                  background: linha.item_id ? '#fafaf8' : '#fff'
                }}>
                  {/* linha superior: item + qtd + remover */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 32px', gap: 8, alignItems: 'flex-end' }}>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Item {idx + 1}</label>
                      <select
                        value={linha.item_id}
                        onChange={e => updateLinha(idx, 'item_id', e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {itens.map(i => (
                          <option
                            key={i.id} value={i.id}
                            disabled={selecionados.includes(i.id) || i.quantidade === 0}
                          >
                            {i.nome} ({i.quantidade} {i.unidade}){i.quantidade === 0 ? ' — sem estoque' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-row" style={{ marginBottom: 0 }}>
                      <label>Qtd</label>
                      <input
                        type="number" min="1"
                        max={itemSel?.quantidade || 999}
                        value={linha.quantidade}
                        onChange={e => updateLinha(idx, 'quantidade', e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => removeLinha(idx)}
                      disabled={linhas.length === 1}
                      style={{
                        width: 28, height: 28, marginTop: 18,
                        border: '1px solid #fecaca', borderRadius: 6,
                        background: linhas.length === 1 ? '#f5f5f3' : '#fee2e2',
                        color: linhas.length === 1 ? '#ccc' : '#dc2626',
                        cursor: linhas.length === 1 ? 'not-allowed' : 'pointer',
                        fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* linha inferior: devolvível + data */}
                  {linha.item_id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#555' }}>
                        <input
                          type="checkbox"
                          checked={linha.devolvivel}
                          onChange={e => updateLinha(idx, 'devolvivel', e.target.checked)}
                          style={{ accentColor: '#1d4ed8' }}
                        />
                        Passível de devolução
                      </label>
                      {linha.devolvivel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <label style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>Dev. prevista:</label>
                          <input
                            type="date"
                            value={linha.data_devolucao_prevista}
                            onChange={e => updateLinha(idx, 'data_devolucao_prevista', e.target.value)}
                            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                          />
                        </div>
                      )}
                      {itemSel && (
                        <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>
                          Estoque: {itemSel.quantidade} {itemSel.unidade} · {fmtR(itemSel.custo_unitario)} un
                          {linha.quantidade > 0 && (
                            <strong style={{ color: '#1d4ed8' }}> · Total: {fmtR(itemSel.custo_unitario * parseInt(linha.quantidade || 0))}</strong>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Totalizador */}
            {linhas.some(l => l.item_id) && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: '6px 4px', fontSize: 13, color: '#555',
                borderTop: '1px solid #e8e8e5', marginTop: 4,
              }}>
                Total da saída:&nbsp;
                <strong style={{ color: '#1d4ed8' }}>
                  {fmtR(linhas.reduce((acc, l) => {
                    const item = estoquePorItem[l.item_id]
                    return acc + (item ? item.custo_unitario * parseInt(l.quantidade || 0) : 0)
                  }, 0))}
                </strong>
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
              {saving ? 'Salvando...' : `Registrar saída (${linhas.filter(l => l.item_id).length} item${linhas.filter(l => l.item_id).length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
