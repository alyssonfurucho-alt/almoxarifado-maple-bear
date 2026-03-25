import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Relatorios() {
  const [tab, setTab] = useState('turma')
  const [saidas, setSaidas] = useState([])
  const [devolucoes, setDevolucoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filDe, setFilDe] = useState('')
  const [filAte, setFilAte] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:s },{ data:d }] = await Promise.all([
      supabase.from('saidas').select('*, itens(nome,custo_unitario), professores(nome,registro), turmas(codigo,turno)').order('data_saida'),
      supabase.from('devolucoes').select('*, saidas(professor_nome_snapshot, turma_codigo_snapshot, professores(nome), turmas(codigo), itens(nome))'),
    ])
    setSaidas(s||[]); setDevolucoes(d||[])
    setLoading(false)
  }

  const nomeProfSaida = s => s.professores?.nome || s.professor_nome_snapshot || '—'
  const regProfSaida  = s => s.professores?.registro || '—'
  const turmaSaida    = s => s.turmas?.codigo || s.turma_codigo_snapshot || '—'
  const turnoSaida    = s => s.turmas?.turno || '—'

  // Por turma
  const porTurma = {}
  saidas.forEach(s=>{
    const k = turmaSaida(s)
    if (!porTurma[k]) porTurma[k]={ turma:k, turno:turnoSaida(s), itens:0, custo:0, pend:0 }
    porTurma[k].itens += s.quantidade
    porTurma[k].custo += (s.itens?.custo_unitario||0)*s.quantidade
    if (s.devolvivel) porTurma[k].pend += s.quantidade-s.devolvido
  })

  // Por professor
  const porProf = {}
  saidas.forEach(s=>{
    const nome = nomeProfSaida(s)
    const reg = regProfSaida(s)
    if (!porProf[nome]) porProf[nome]={ nome, registro:reg, saidas:0, itens:0, custo:0, dev:0, pend:0, venc:0, avarias:0 }
    porProf[nome].saidas++
    porProf[nome].itens += s.quantidade
    porProf[nome].custo += (s.itens?.custo_unitario||0)*s.quantidade
    if (s.devolvivel) {
      porProf[nome].dev += s.devolvido
      porProf[nome].pend += s.quantidade-s.devolvido
      if (s.data_devolucao_prevista && s.data_devolucao_prevista < hoje() && s.devolvido < s.quantidade)
        porProf[nome].venc += s.quantidade-s.devolvido
    }
  })
  devolucoes.filter(d=>d.avaria).forEach(d=>{
    const nome = d.saidas?.professores?.nome || d.saidas?.professor_nome_snapshot || '—'
    if (porProf[nome]) porProf[nome].avarias += d.avaria_quantidade||0
  })

  // Consumo por item
  const consumo = {}
  saidas.forEach(s=>{
    const nome = s.itens?.nome||'Desconhecido'
    if (!consumo[nome]) consumo[nome]={ retirado:0, devolvido:0, custo:0, avarias:0 }
    consumo[nome].retirado += s.quantidade
    consumo[nome].devolvido += s.devolvido
    consumo[nome].custo += (s.itens?.custo_unitario||0)*s.quantidade
  })
  devolucoes.filter(d=>d.avaria).forEach(d=>{
    const nome = d.saidas?.itens?.nome
    if (nome && consumo[nome]) consumo[nome].avarias += d.avaria_quantidade||0
  })

  // Por período
  const porPeriodo = saidas.filter(s=>(!filDe||s.data_saida>=filDe)&&(!filAte||s.data_saida<=filAte))

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header"><div className="page-title">Relatórios</div></div>
      <div className="tabs">
        {[['turma','Por turma'],['prof','Por professor(a)'],['consumo','Consumo'],['periodo','Por período']].map(([k,l])=>(
          <div key={k} className={`tab${tab===k?' active':''}`} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>

      {tab==='turma' && (
        <div className="card">
          <table>
            <thead><tr><th>Turma</th><th>Turno</th><th>Itens retirados</th><th>Custo total</th><th>Devoluções pendentes</th></tr></thead>
            <tbody>
              {Object.values(porTurma).map((r,i)=>(
                <tr key={i}>
                  <td><strong style={{fontWeight:500}}>{r.turma}</strong></td>
                  <td>{r.turno}</td><td>{r.itens}</td><td>{fmtR(r.custo)}</td>
                  <td>{r.pend>0?<span className="badge badge-warning">{r.pend} itens</span>:<span className="badge badge-success">OK</span>}</td>
                </tr>
              ))}
              {!Object.keys(porTurma).length && <tr><td colSpan={5} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab==='prof' && (
        <div className="card">
          <table>
            <thead><tr><th>Professor(a)</th><th>Registro</th><th>Saídas</th><th>Itens</th><th>Custo total</th><th>Devolvidos</th><th>Pendentes</th><th>Vencidos</th><th>Avarias</th></tr></thead>
            <tbody>
              {Object.entries(porProf).map(([nome,r])=>(
                <tr key={nome}>
                  <td>{nome}</td>
                  <td><span className="badge badge-neutral" style={{fontSize:11}}>{r.registro}</span></td>
                  <td>{r.saidas}</td><td>{r.itens}</td><td>{fmtR(r.custo)}</td>
                  <td>{r.dev}</td><td>{r.pend}</td>
                  <td>{r.venc>0?<span className="badge badge-danger">{r.venc}</span>:<span className="badge badge-success">0</span>}</td>
                  <td>{r.avarias>0?<span className="badge badge-danger">{r.avarias}</span>:<span className="badge badge-success">0</span>}</td>
                </tr>
              ))}
              {!Object.keys(porProf).length && <tr><td colSpan={9} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab==='consumo' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Total retirado</th><th>Total devolvido</th><th>Consumido</th><th>Avarias</th><th>Custo total</th></tr></thead>
            <tbody>
              {Object.entries(consumo).map(([nome,r])=>(
                <tr key={nome}>
                  <td>{nome}</td><td>{r.retirado}</td><td>{r.devolvido}</td>
                  <td>{r.retirado-r.devolvido}</td>
                  <td>{r.avarias>0?<span className="badge badge-danger">{r.avarias}</span>:<span className="badge badge-success">0</span>}</td>
                  <td>{fmtR(r.custo)}</td>
                </tr>
              ))}
              {!Object.keys(consumo).length && <tr><td colSpan={6} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab==='periodo' && (
        <>
          <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div><label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>De</label>
              <input type="date" value={filDe} onChange={e=>setFilDe(e.target.value)} style={{padding:'7px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
            </div>
            <div><label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Até</label>
              <input type="date" value={filAte} onChange={e=>setFilAte(e.target.value)} style={{padding:'7px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
            </div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Turno</th><th>Devolvível</th><th>Dev. prevista</th><th>Status</th><th>Custo</th></tr></thead>
              <tbody>
                {porPeriodo.map(s=>{
                  const st = statusDevolucao(s)
                  return (
                    <tr key={s.id}>
                      <td>{fmtData(s.data_saida)}</td>
                      <td>{s.itens?.nome}</td>
                      <td>{s.quantidade}</td>
                      <td>{nomeProfSaida(s)}</td>
                      <td><span className="badge badge-neutral" style={{fontSize:11}}>{regProfSaida(s)}</span></td>
                      <td><strong style={{fontWeight:500}}>{turmaSaida(s)}</strong></td>
                      <td>{turnoSaida(s)}</td>
                      <td>{s.devolvivel?'Sim':'Não'}</td>
                      <td>{s.devolvivel?fmtData(s.data_devolucao_prevista):'-'}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>{fmtR((s.itens?.custo_unitario||0)*s.quantidade)}</td>
                    </tr>
                  )
                })}
                {!porPeriodo.length && <tr><td colSpan={11} className="empty">Nenhuma saída no período</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
