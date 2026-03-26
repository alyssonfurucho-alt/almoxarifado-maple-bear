import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje } from '../lib/utils'

export default function Dashboard() {
  const [stats, setStats] = useState({ estoque: 0, saidasHoje: 0, vencidos: 0, avencer: 0, avarias: 0 })
  const [movimentos, setMovimentos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const hj = hoje()
    const proxSemana = new Date()
    proxSemana.setDate(proxSemana.getDate() + 7)
    const proxSemanaStr = proxSemana.toISOString().split('T')[0]

    const [{ count: estoque }, { count: saidasHoje }, { count: vencidos }, { count: avencer }, { count: avarias }, { data: movs }] = await Promise.all([
      supabase.from('estoque').select('*', { count: 'exact', head: true }),
      supabase.from('saidas').select('*', { count: 'exact', head: true }).eq('data_saida', hj),
      supabase.from('saidas').select('*', { count: 'exact', head: true })
        .eq('devolvivel', true).lt('data_devolucao_prevista', hj).lt('devolvido', supabase.rpc),
      supabase.from('saidas').select('*', { count: 'exact', head: true })
        .eq('devolvivel', true).gte('data_devolucao_prevista', hj).lte('data_devolucao_prevista', proxSemanaStr),
      supabase.from('devolucoes').select('*', { count: 'exact', head: true }).eq('avaria', true),
      supabase.from('saidas').select('*, estoque(nome)').order('created_at', { ascending: false }).limit(10),
    ])

    // vencidos com devolvido < quantidade
    const { data: saidas } = await supabase.from('saidas')
      .select('id, quantidade, devolvido, data_devolucao_prevista')
      .eq('devolvivel', true)
    const venc = saidas?.filter(s => s.devolvido < s.quantidade && s.data_devolucao_prevista && s.data_devolucao_prevista < hj).length || 0
    const avc = saidas?.filter(s => {
      if (!s.devolvivel || s.devolvido >= s.quantidade) return false
      const d = s.data_devolucao_prevista
      return d && d >= hj && d <= proxSemanaStr
    }).length || 0

    setStats({ estoque: estoque || 0, saidasHoje: saidasHoje || 0, vencidos: venc, avencer: avc, avarias: avarias || 0 })
    setMovimentos(movs || [])
    setLoading(false)
  }

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <span style={{ fontSize: 12, color: '#888' }}>Hoje: {new Date().toLocaleDateString('pt-BR')}</span>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Itens em estoque</div><div className="metric-value blue">{stats.estoque}</div></div>
        <div className="metric-card"><div className="metric-label">Saídas hoje</div><div className="metric-value">{stats.saidasHoje}</div></div>
        <div className="metric-card"><div className="metric-label">Devoluções vencidas</div><div className="metric-value red">{stats.vencidos}</div></div>
        <div className="metric-card"><div className="metric-label">A vencer (7 dias)</div><div className="metric-value yellow">{stats.avencer}</div></div>
        <div className="metric-card"><div className="metric-label">Avarias registradas</div><div className="metric-value red">{stats.avarias}</div></div>
      </div>

      {stats.vencidos > 0 && (
        <div className="alert alert-danger">Atenção: {stats.vencidos} devolução(ões) vencida(s). Acesse "Cobrança" para detalhes.</div>
      )}

      <div className="card">
        <div className="card-title">Últimas movimentações</div>
        <table>
          <thead>
            <tr><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Sala</th><th>Data</th><th>Dev. prevista</th></tr>
          </thead>
          <tbody>
            {movimentos.map(s => (
              <tr key={s.id}>
                <td>{s.estoque?.nome || '-'}</td>
                <td>{s.quantidade}</td>
                <td>{s.professor}</td>
                <td>{s.sala}</td>
                <td>{fmtData(s.data_saida)}</td>
                <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '-'}</td>
              </tr>
            ))}
            {!movimentos.length && <tr><td colSpan={7} className="empty">Nenhuma movimentação</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
