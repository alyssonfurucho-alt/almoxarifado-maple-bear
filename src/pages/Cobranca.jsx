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
    const prox = new Date(); prox.setDate(prox.getDate()+7)
    const proxStr = prox.toISOString().split('T')[0]
    const { data:saidas } = await supabase.from('saidas')
      .select('*, estoque(nome,custo_unitario,produtos(nome,cor,tamanho)), professores(nome,registro), turmas(codigo)')
      .eq('devolvivel',true)
    const pend = (saidas||[]).filter(s=>s.devolvido<s.quantidade)
    setVencidos(pend.filter(s=>s.data_devolucao_prevista&&s.data_devolucao_prevista<hj))
    setAvencer(pend.filter(s=>s.data_devolucao_prevista&&s.data_devolucao_prevista>=hj&&s.data_devolucao_prevista<=proxStr))
    const { data:devAvarias } = await supabase.from('devolucoes')
      .select('*, saidas(professor_nome_snapshot, turma_codigo_snapshot, professores(nome,registro), turmas(codigo), estoque(nome))')
      .eq('avaria',true).order('created_at',{ascending:false})
    setAvarias(devAvarias||[])
    setLoading(false)
  }

  const nomeProfRow = s => s.professores?.nome || s.professor_nome_snapshot || '—'
  const regProfRow  = s => s.professores?.registro || '—'
  const turmaCodRow = s => s.turmas?.codigo || s.turma_codigo_snapshot || '—'

  const valorVenc = vencidos.reduce((a,s)=>a+((s.estoque?.custo_unitario||0)*(s.quantidade-s.devolvido)),0)
  const totalPend = [...vencidos,...avencer].reduce((a,s)=>a+((s.estoque?.custo_unitario||0)*(s.quantidade-s.devolvido)),0)

  if (loading) return <div className="loading">Carregando...</div>

  function nomeProd(s) {
    const p = s.estoque?.produtos
    if (!p) return s.estoque?.nome || '—'
    return `${p.nome}${p.cor ? ` — ${p.cor}` : ''}${p.tamanho ? ` ${p.tamanho}` : ''}`
  }

  const TabelaCobranca = ({ rows, tipo }) => (
    <div className="card">
      <table>
        <thead><tr><th>Item</th><th>Qtd pendente</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Data saída</th><th>Prazo</th><th>{tipo==='venc'?'Atraso':'Restam'}</th><th>Valor</th></tr></thead>
        <tbody>
          {rows.map(s=>{
            const pend = s.quantidade-s.devolvido
            const hj = hoje()
            const d = new Date(s.data_devolucao_prevista+'T00:00:00')
            const h = new Date(hj+'T00:00:00')
            const diff = Math.round((d-h)/(1000*60*60*24))
            return (
              <tr key={s.id}>
                <td>{nomeProd(s)}</td>
                <td>{pend}</td>
                <td>{nomeProfRow(s)}</td>
                <td><span className="badge badge-neutral" style={{fontSize:11}}>{regProfRow(s)}</span></td>
                <td><strong style={{fontWeight:500}}>{turmaCodRow(s)}</strong></td>
                
                <td>{fmtData(s.data_saida)}</td>
                <td style={{color:tipo==='venc'?'#dc2626':'#d97706'}}>{fmtData(s.data_devolucao_prevista)}</td>
                <td>
                  {tipo==='venc'
                    ? <span className="badge badge-danger">{diasDiff(s.data_devolucao_prevista)} dia(s)</span>
                    : <span className="badge badge-warning">{diff} dia(s)</span>}
                </td>
                <td>{fmtR((s.estoque?.custo_unitario||0)*pend)}</td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={10} className="empty">{tipo==='venc'?'Nenhuma devolução vencida':'Nenhuma devolução a vencer nos próximos 7 dias'}</td></tr>}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      <div className="page-header"><div className="page-title">Controle de cobrança</div></div>
      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Vencidos</div><div className="metric-value red">{vencidos.length}</div></div>
        <div className="metric-card"><div className="metric-label">A vencer (7 dias)</div><div className="metric-value yellow">{avencer.length}</div></div>
        <div className="metric-card"><div className="metric-label">Valor em risco</div><div className="metric-value red">{fmtR(valorVenc)}</div></div>
        <div className="metric-card"><div className="metric-label">Total pendente</div><div className="metric-value">{fmtR(totalPend)}</div></div>
      </div>
      <div className="section-title" style={{color:'#dc2626'}}>Devoluções vencidas</div>
      <TabelaCobranca rows={vencidos} tipo="venc" />
      <div className="section-title" style={{color:'#d97706'}}>A vencer nos próximos 7 dias</div>
      <TabelaCobranca rows={avencer} tipo="avenc" />
      <div className="section-title" style={{color:'#dc2626'}}>Devoluções com avaria</div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Qtd avariada</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Data devolução</th><th>Descrição da avaria</th></tr></thead>
          <tbody>
            {avarias.map(d=>{
              const s = d.saidas
              const nomeProfessor = s?.professores?.nome || s?.professor_nome_snapshot || '—'
              const registro = s?.professores?.registro || '—'
              const codigoTurma = s?.turmas?.codigo || s?.turma_codigo_snapshot || '—'
              return (
                <tr key={d.id}>
                  <td>{nomeProd(s||{estoque:d?.saidas?.estoque})}</td>
                  <td>{d.avaria_quantidade} de {d.quantidade}</td>
                  <td>{nomeProfessor}</td>
                  <td><span className="badge badge-neutral" style={{fontSize:11}}>{registro}</span></td>
                  <td><strong style={{fontWeight:500}}>{codigoTurma}</strong></td>
                  
                  <td>{fmtData(d.data_devolucao)}</td>
                  <td style={{fontSize:12,color:'#dc2626'}}>{d.avaria_descricao}</td>
                </tr>
              )
            })}
            {!avarias.length && <tr><td colSpan={8} className="empty">Nenhuma avaria registrada</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
