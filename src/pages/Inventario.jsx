import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData } from '../lib/utils'

export default function Inventario() {
  const [estoque, setEstoque] = useState([])
  const [saidas, setSaidas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTurma, setFiltroTurma] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [turmas, setTurmas] = useState([])

  function nomeProduto(item) {
    if (!item) return '—'
    const p = item.produtos
    if (!p) return item.nome || '—'
    return `${p.nome}${p.cor ? ` — ${p.cor}` : ''}${p.tamanho ? ` ${p.tamanho}` : ''}`
  }

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: itensDados }, { data: saidasDados }, { data: turmasDados }] = await Promise.all([
      supabase.from('estoque').select('*, produtos(nome,cor,tamanho,codigo_barras)').eq('inventario', true).order('nome'),
      supabase.from('saidas')
        .select('*, estoque(nome,unidade), professores(nome,registro), turmas(id,codigo)')
        .eq('devolvivel', true),
      supabase.from('turmas').select('id,codigo').eq('ativo', true).order('codigo'),
    ])
    setEstoque(itensDados || [])
    setSaidas(saidasDados || [])
    setTurmas(turmasDados || [])
    setLoading(false)
  }

  // Para cada item de inventário, monta sua situação atual
  function situacaoItem(item) {
    // saídas desse item com pendente de devolução
    const saidasPendentes = saidas.filter(s =>
      s.item_id === item.id && s.devolvido < s.quantidade
    )
    if (!saidasPendentes.length) return [{ status: 'estoque', quantidade: item.quantidade, turma: null, saida: null }]
    return saidasPendentes.map(s => ({
      status: 'saida',
      quantidade: s.quantidade - s.devolvido,
      turma: s.turmas,
      professor: s.professores,
      saida: s,
    }))
  }

  // Achata tudo em linhas para a tabela
  const linhas = estoque.flatMap(item => {
    const sits = situacaoItem(item)
    return sits.map(sit => ({ item, ...sit }))
  }).filter(l => {
    if (filtroTurma && (l.turma?.id !== filtroTurma)) return false
    if (filtroStatus === 'estoque' && l.status !== 'estoque') return false
    if (filtroStatus === 'saida' && l.status !== 'saida') return false
    return true
  })

  const totalEmEstoque = linhas.filter(l => l.status === 'estoque').length
  const totalEmUso     = linhas.filter(l => l.status === 'saida').length
  const totalVencidos  = linhas.filter(l => l.status === 'saida' && l.saida?.data_devolucao_prevista && l.saida.data_devolucao_prevista < new Date().toISOString().split('T')[0]).length

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Inventário</div>
      </div>

      {!estoque.length && (
        <div className="alert alert-info">
          Nenhum item marcado como inventário. Acesse Estoque e marque os estoque desejados como "inventário".
        </div>
      )}

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Itens de inventário</div><div className="metric-value blue">{estoque.length}</div></div>
        <div className="metric-card"><div className="metric-label">Em estoque</div><div className="metric-value green">{totalEmEstoque}</div></div>
        <div className="metric-card"><div className="metric-label">Em uso (turmas)</div><div className="metric-value yellow">{totalEmUso}</div></div>
        <div className="metric-card"><div className="metric-label">Devolução vencida</div><div className="metric-value red">{totalVencidos}</div></div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Turma</label>
          <select value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 140 }}>
            <option value="">Todas as turmas</option>
            {turmas.map(t => <option key={t.id} value={t.id}>{t.codigo}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 140 }}>
            <option value="">Todos</option>
            <option value="estoque">Em estoque</option>
            <option value="saida">Em uso</option>
          </select>
        </div>
        <button className="btn btn-sm" style={{ alignSelf: 'flex-end' }}
          onClick={() => { setFiltroTurma(''); setFiltroStatus('') }}>
          Limpar filtros
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Unidade</th>
              <th>Status</th>
              <th>Turma</th>
              
              <th>Professor(a)</th>
              <th>Data saída</th>
              <th>Dev. prevista</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, idx) => {
              const hoje = new Date().toISOString().split('T')[0]
              const vencido = l.status === 'saida' && l.saida?.data_devolucao_prevista && l.saida.data_devolucao_prevista < hoje
              return (
                <tr key={idx} style={{ background: vencido ? '#fff5f5' : undefined }}>
                  <td>
                    <strong style={{ fontWeight: 500 }}>{nomeProduto(l.item)}</strong>
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#ede9fe', color: '#7c3aed', padding: '1px 7px', borderRadius: 4, fontWeight: 500 }}>inventário</span>
                  </td>
                  <td>{l.item.categoria}</td>
                  <td><strong style={{ fontWeight: 500 }}>{l.quantidade}</strong></td>
                  <td>{l.item.unidade}</td>
                  <td>
                    {l.status === 'estoque'
                      ? <span className="badge badge-success">Em estoque</span>
                      : vencido
                      ? <span className="badge badge-danger">Em uso — vencido</span>
                      : <span className="badge badge-warning">Em uso</span>}
                  </td>
                  <td>{l.turma ? <strong style={{ fontWeight: 500 }}>{l.turma.codigo}</strong> : <span style={{ color: '#aaa' }}>—</span>}</td>
                  <td>{l.professor?.nome || '—'}</td>
                  <td>{l.saida ? fmtData(l.saida.data_saida) : '—'}</td>
                  <td style={{ color: vencido ? '#dc2626' : '#d97706' }}>
                    {l.saida?.data_devolucao_prevista ? fmtData(l.saida.data_devolucao_prevista) : '—'}
                  </td>
                </tr>
              )
            })}
            {!linhas.length && <tr><td colSpan={10} className="empty">Nenhum item de inventário encontrado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
