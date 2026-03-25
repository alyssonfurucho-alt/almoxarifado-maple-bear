import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, diasDiff } from '../lib/utils'

export default function Cobranca() {
  const [vencidos, setVencidos] = useState([])
  const [avencer, setAvencer] = useState([])
  const [avarias, setAvarias] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const hj = hoje()
    const proxSemana = new Date(); proxSemana.setDate(proxSemana.getDate() + 7)
    const proxStr = proxSemana.toISOString().split('T')[0]

    const { data: saidas } = await supabase.from('saidas')
      .select('*, itens(nome, custo_unitario)')
      .eq('devolvivel', true)

    const pendentes = (saidas || []).filter(s => s.devolvido < s.quantidade)
    setVencidos(pendentes.filter(s => s.data_devolucao_prevista && s.data_devolucao_prevista < hj))
    setAvencer(pendentes.filter(s => s.data_devolucao_prevista && s.data_devolucao_prevista >= hj && s.data_devolucao_prevista <= proxStr))

    const { data: devAvarias } = await supabase.from('devolucoes')
      .select('*, saidas(professor, sala, turno, itens(nome))')
      .eq('avaria', true)
      .order('created_at', { ascending: false })
    setAvarias(devAvarias || [])
    setLoading(false)
  }

  const valorVenc = vencidos.reduce((a, s) => a + ((s.itens?.custo_unitario || 0) * (s.quantidade - s.devolvido)), 0)
  const totalPend = [...vencidos, ...avencer].reduce((a, s) => a + ((s.itens?.custo_unitario || 0) * (s.quantidade - s.devolvido)), 0)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Controle de cobrança</div>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Vencidos</div><div className="metric-value red">{vencidos.length}</div></div>
        <div className="metric-card"><div className="metric-label">A vencer (7 dias)</div><div className="metric-value yellow">{avencer.length}</div></div>
        <div className="metric-card"><div className="metric-label">Valor em risco (vencidos)</div><div className="metric-value red">{fmtR(valorVenc)}</div></div>
        <div className="metric-card"><div className="metric-label">Total pendente</div><div className="metric-value">{fmtR(totalPend)}</div></div>
      </div>

      <div className="section-title" style={{ color: '#dc2626' }}>Devoluções vencidas</div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Qtd pendente</th><th>Professor(a)</th><th>Sala</th><th>Turno</th><th>Data saída</th><th>Prazo</th><th>Atraso</th><th>Valor</th></tr></thead>
          <tbody>
            {vencidos.map(s => {
              const pend = s.quantidade - s.devolvido
              return (
                <tr key={s.id}>
                  <td>{s.itens?.nome}</td>
                  <td>{pend}</td>
                  <td>{s.professor}</td>
                  <td>{s.sala}</td>
                  <td>{s.turno}</td>
                  <td>{fmtData(s.data_saida)}</td>
                  <td style={{ color: '#dc2626' }}>{fmtData(s.data_devolucao_prevista)}</td>
                  <td><span className="badge badge-danger">{diasDiff(s.data_devolucao_prevista)} dia(s)</span></td>
                  <td>{fmtR((s.itens?.custo_unitario || 0) * pend)}</td>
                </tr>
              )
            })}
            {!vencidos.length && <tr><td colSpan={9} className="empty">Nenhuma devolução vencida</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ color: '#d97706' }}>A vencer nos próximos 7 dias</div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Qtd pendente</th><th>Professor(a)</th><th>Sala</th><th>Turno</th><th>Data saída</th><th>Prazo</th><th>Restam</th><th>Valor</th></tr></thead>
          <tbody>
            {avencer.map(s => {
              const pend = s.quantidade - s.devolvido
              const hj = hoje()
              const d = new Date(s.data_devolucao_prevista + 'T00:00:00')
              const h = new Date(hj + 'T00:00:00')
              const restam = Math.round((d - h) / (1000 * 60 * 60 * 24))
              return (
                <tr key={s.id}>
                  <td>{s.itens?.nome}</td>
                  <td>{pend}</td>
                  <td>{s.professor}</td>
                  <td>{s.sala}</td>
                  <td>{s.turno}</td>
                  <td>{fmtData(s.data_saida)}</td>
                  <td style={{ color: '#d97706' }}>{fmtData(s.data_devolucao_prevista)}</td>
                  <td><span className="badge badge-warning">{restam} dia(s)</span></td>
                  <td>{fmtR((s.itens?.custo_unitario || 0) * pend)}</td>
                </tr>
              )
            })}
            {!avencer.length && <tr><td colSpan={9} className="empty">Nenhuma devolução a vencer nos próximos 7 dias</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ color: '#dc2626' }}>Devoluções com avaria registrada</div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Qtd avariada</th><th>Professor(a)</th><th>Sala</th><th>Turno</th><th>Data devolução</th><th>Descrição da avaria</th></tr></thead>
          <tbody>
            {avarias.map(d => (
              <tr key={d.id}>
                <td>{d.saidas?.itens?.nome}</td>
                <td>{d.avaria_quantidade} de {d.quantidade}</td>
                <td>{d.saidas?.professor}</td>
                <td>{d.saidas?.sala}</td>
                <td>{d.saidas?.turno}</td>
                <td>{fmtData(d.data_devolucao)}</td>
                <td style={{ fontSize: 12, color: '#dc2626' }}>{d.avaria_descricao}</td>
              </tr>
            ))}
            {!avarias.length && <tr><td colSpan={7} className="empty">Nenhuma avaria registrada</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
