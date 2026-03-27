import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Relatorios() {
  const [tab, setTab]             = useState('analises')
  const [saidas, setSaidas]       = useState([])
  const [devolucoes, setDevolucoes] = useState([])
  const [estoque, setEstoque]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filDe, setFilDe]         = useState('')
  const [filAte, setFilAte]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:s },{ data:d },{ data:e }] = await Promise.all([
      supabase.from('saidas')
        .select('*, estoque(nome,custo_unitario,custo_medio,ultimo_custo,produtos(nome,cor,tamanho)), professores(nome,registro), turmas(codigo)')
        .order('data_saida'),
      supabase.from('devolucoes')
        .select('*, saidas(professor_nome_snapshot, turma_codigo_snapshot, professores(nome), turmas(codigo), estoque(nome))'),
      supabase.from('estoque')
        .select('*, produtos(nome,cor,tamanho)')
        .order('nome'),
    ])
    setSaidas(s||[]); setDevolucoes(d||[]); setEstoque(e||[])
    setLoading(false)
  }

  // ── helpers ──
  // custo real no momento da saída
  const custoSaida = s => s.custo_unitario_saida || s.estoque?.custo_unitario || 0

  function nomeProdSaida(s) {
    const p = s.estoque?.produtos
    if (!p) return s.estoque?.nome || '—'
    return `${p.nome}${p.cor?` — ${p.cor}`:''}${p.tamanho?` ${p.tamanho}`:''}`
  }
  function nomeProdEstoque(e) {
    const p = e.produtos
    if (!p) return e.nome || '—'
    return `${p.nome}${p.cor?` — ${p.cor}`:''}${p.tamanho?` ${p.tamanho}`:''}`
  }
  const nomeProfSaida = s => s.professores?.nome || s.professor_nome_snapshot || '—'
  const regProfSaida  = s => s.professores?.registro || '—'
  const turmaSaida    = s => s.turmas?.codigo || s.turma_codigo_snapshot || '—'

  // ── cálculo de média mensal por item ──
  function calcMediaMensal(saidasFiltradas) {
    // agrupa por item e por mês
    const porItem = {}
    saidasFiltradas.forEach(s => {
      const itemNome = nomeProdSaida(s)
      const mes = (s.data_saida||'').substring(0,7) // YYYY-MM
      if (!mes) return
      if (!porItem[itemNome]) porItem[itemNome] = { nome: itemNome, meses: {}, totalQtd: 0, totalCusto: 0, custo_medio: s.estoque?.custo_medio||0, ultimo_custo: s.estoque?.ultimo_custo||0 }
      if (!porItem[itemNome].meses[mes]) porItem[itemNome].meses[mes] = 0
      const consumido = s.quantidade - (s.devolvido||0)
      porItem[itemNome].meses[mes] += consumido
      porItem[itemNome].totalQtd   += consumido
      porItem[itemNome].totalCusto += custoSaida(s) * consumido
    })
    return Object.values(porItem).map(item => {
      const meses = Object.values(item.meses)
      const qtdMeses = meses.length || 1
      return {
        nome:        item.nome,
        mediaMensal: (item.totalQtd / qtdMeses).toFixed(1),
        totalQtd:    item.totalQtd,
        totalCusto:  item.totalCusto,
        custoPorMes: (item.totalCusto / qtdMeses).toFixed(2),
        mesesAtivos: qtdMeses,
        custo_medio: item.custo_medio,
        ultimo_custo: item.ultimo_custo,
      }
    }).sort((a,b) => b.totalQtd - a.totalQtd)
  }

  // ── média mensal por professor ──
  function calcMediaProf(saidasFiltradas) {
    const porProf = {}
    saidasFiltradas.forEach(s => {
      const nome = nomeProfSaida(s)
      const reg  = regProfSaida(s)
      const mes  = (s.data_saida||'').substring(0,7)
      if (!mes) return
      if (!porProf[nome]) porProf[nome] = { nome, registro:reg, meses:{}, totalQtd:0, totalCusto:0 }
      if (!porProf[nome].meses[mes]) porProf[nome].meses[mes] = 0
      const consumido = s.quantidade - (s.devolvido||0)
      porProf[nome].meses[mes] += consumido
      porProf[nome].totalQtd   += consumido
      porProf[nome].totalCusto += custoSaida(s) * consumido
    })
    return Object.values(porProf).map(p => {
      const meses = Object.values(p.meses)
      const qtdMeses = meses.length || 1
      return {
        nome:        p.nome,
        registro:    p.registro,
        mediaMensal: (p.totalQtd / qtdMeses).toFixed(1),
        totalQtd:    p.totalQtd,
        totalCusto:  p.totalCusto,
        custoPorMes: (p.totalCusto / qtdMeses).toFixed(2),
        mesesAtivos: qtdMeses,
      }
    }).sort((a,b) => b.totalQtd - a.totalQtd)
  }

  // ── média mensal por turma ──
  function calcMediaTurma(saidasFiltradas) {
    const porTurma = {}
    saidasFiltradas.forEach(s => {
      const cod = turmaSaida(s)
      const mes = (s.data_saida||'').substring(0,7)
      if (!mes) return
      if (!porTurma[cod]) porTurma[cod] = { codigo:cod, meses:{}, totalQtd:0, totalCusto:0 }
      if (!porTurma[cod].meses[mes]) porTurma[cod].meses[mes] = 0
      const consumido = s.quantidade - (s.devolvido||0)
      porTurma[cod].meses[mes] += consumido
      porTurma[cod].totalQtd   += consumido
      porTurma[cod].totalCusto += custoSaida(s) * consumido
    })
    return Object.values(porTurma).map(t => {
      const meses = Object.values(t.meses)
      const qtdMeses = meses.length || 1
      return {
        codigo:      t.codigo,
        mediaMensal: (t.totalQtd / qtdMeses).toFixed(1),
        totalQtd:    t.totalQtd,
        totalCusto:  t.totalCusto,
        custoPorMes: (t.totalCusto / qtdMeses).toFixed(2),
        mesesAtivos: qtdMeses,
      }
    }).sort((a,b) => b.totalQtd - a.totalQtd)
  }

  // ── filtro de período ──
  const saidasFiltradas = saidas.filter(s =>
    (!filDe || s.data_saida >= filDe) && (!filAte || s.data_saida <= filAte)
  )

  // ── dados calculados ──
  const mediaItem   = calcMediaMensal(saidasFiltradas)
  const mediaProf   = calcMediaProf(saidasFiltradas)
  const mediaTurma  = calcMediaTurma(saidasFiltradas)

  // ── relatório por turma (aba existente) ──
  const porTurma = {}
  saidas.forEach(s=>{
    const k = turmaSaida(s)
    if (!porTurma[k]) porTurma[k]={ turma:k, itens:0, custo:0, pend:0 }
    porTurma[k].itens += s.quantidade
    porTurma[k].custo += custoSaida(s)*s.quantidade
    if (s.devolvivel) porTurma[k].pend += s.quantidade-s.devolvido
  })

  // ── por professor ──
  const porProf = {}
  saidas.forEach(s=>{
    const nome = nomeProfSaida(s)
    const reg  = regProfSaida(s)
    if (!porProf[nome]) porProf[nome]={ nome, registro:reg, saidas:0, itens:0, custo:0, dev:0, pend:0, venc:0, avarias:0 }
    porProf[nome].saidas++
    porProf[nome].itens += s.quantidade
    porProf[nome].custo += custoSaida(s)*s.quantidade
    if (s.devolvivel){
      porProf[nome].dev  += s.devolvido
      porProf[nome].pend += s.quantidade-s.devolvido
      if (s.data_devolucao_prevista&&s.data_devolucao_prevista<hoje()&&s.devolvido<s.quantidade)
        porProf[nome].venc += s.quantidade-s.devolvido
    }
  })
  devolucoes.filter(d=>d.avaria).forEach(d=>{
    const nome = d.saidas?.professores?.nome||d.saidas?.professor_nome_snapshot||'—'
    if (porProf[nome]) porProf[nome].avarias += d.avaria_quantidade||0
  })

  // ── consumo por item ──
  const consumo = {}
  saidas.forEach(s=>{
    const p = s.estoque?.produtos
    const nome = p ? `${p.nome}${p.cor?` — ${p.cor}`:''}${p.tamanho?` ${p.tamanho}`:''}` : (s.estoque?.nome||'Desconhecido')
    if (!consumo[nome]) consumo[nome]={ retirado:0, devolvido:0, custo:0, avarias:0 }
    consumo[nome].retirado  += s.quantidade
    consumo[nome].devolvido += s.devolvido
    consumo[nome].custo     += custoSaida(s)*s.quantidade
  })
  devolucoes.filter(d=>d.avaria).forEach(d=>{
    const nome = d.saidas?.estoque?.nome
    if (nome&&consumo[nome]) consumo[nome].avarias += d.avaria_quantidade||0
  })

  const porPeriodo = saidas.filter(s=>(!filDe||s.data_saida>=filDe)&&(!filAte||s.data_saida<=filAte))

  if (loading) return <div className="loading">Carregando...</div>

  const FiltrosPeriodo = () => (
    <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
      <div>
        <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>De</label>
        <input type="date" value={filDe} onChange={e=>setFilDe(e.target.value)}
          style={{padding:'7px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
      </div>
      <div>
        <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Até</label>
        <input type="date" value={filAte} onChange={e=>setFilAte(e.target.value)}
          style={{padding:'7px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
      </div>
      {(filDe||filAte) && (
        <button className="btn btn-sm" style={{alignSelf:'flex-end'}} onClick={()=>{setFilDe('');setFilAte('')}}>
          Limpar
        </button>
      )}
    </div>
  )

  return (
    <div>
      <div className="page-header"><div className="page-title">Relatórios</div></div>
      <div className="tabs">
        {[
          ['analises',  'Análises de consumo'],
          ['turma',     'Por turma'],
          ['prof',      'Por professor(a)'],
          ['consumo',   'Consumo'],
          ['periodo',   'Por período'],
        ].map(([k,l]) => (
          <div key={k} className={`tab${tab===k?' active':''}`} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>

      {/* ══ ANÁLISES DE CONSUMO ══ */}
      {tab === 'analises' && (
        <>
          <FiltrosPeriodo />

          {/* cards resumo */}
          <div className="cards-grid" style={{marginBottom:24}}>
            <div className="metric-card">
              <div className="metric-label">Itens consumidos</div>
              <div className="metric-value blue">{mediaItem.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Custo total período</div>
              <div className="metric-value">{fmtR(saidasFiltradas.reduce((a,s)=>a+custoSaida(s)*s.quantidade,0))}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Meses analisados</div>
              <div className="metric-value">{new Set(saidasFiltradas.map(s=>(s.data_saida||'').substring(0,7)).filter(Boolean)).size}</div>
            </div>
          </div>

          {/* média por item */}
          <div className="section-title">Média mensal por item</div>
          <div className="card" style={{marginBottom:24}}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Média/mês</th>
                  <th>Total consumido</th>
                  <th>Custo médio</th>
                  <th>Último custo</th>
                  <th>Custo/mês</th>
                  <th>Meses ativos</th>
                </tr>
              </thead>
              <tbody>
                {mediaItem.map((r,i) => (
                  <tr key={i}>
                    <td><strong style={{fontWeight:500}}>{r.nome}</strong></td>
                    <td>
                      <span style={{fontWeight:600,color:'#1d4ed8'}}>{r.mediaMensal}</span>
                      <span style={{fontSize:11,color:'#888',marginLeft:4}}>un/mês</span>
                    </td>
                    <td>{r.totalQtd}</td>
                    <td>
                      {r.custo_medio > 0
                        ? <span style={{color:'#16a34a',fontWeight:500}}>{fmtR(r.custo_medio)}</span>
                        : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                    <td>
                      {r.ultimo_custo > 0
                        ? <span style={{color:'#d97706',fontWeight:500}}>{fmtR(r.ultimo_custo)}</span>
                        : <span style={{color:'#aaa'}}>—</span>}
                    </td>
                    <td>{fmtR(parseFloat(r.custoPorMes))}</td>
                    <td><span className="badge badge-neutral">{r.mesesAtivos} {r.mesesAtivos===1?'mês':'meses'}</span></td>
                  </tr>
                ))}
                {!mediaItem.length && <tr><td colSpan={7} className="empty">Nenhum consumo no período</td></tr>}
              </tbody>
            </table>
          </div>

          {/* média por professor */}
          <div className="section-title">Média mensal por professor(a)</div>
          <div className="card" style={{marginBottom:24}}>
            <table>
              <thead>
                <tr>
                  <th>Professor(a)</th>
                  <th>Registro</th>
                  <th>Média/mês</th>
                  <th>Total consumido</th>
                  <th>Custo total</th>
                  <th>Custo/mês</th>
                  <th>Meses ativos</th>
                </tr>
              </thead>
              <tbody>
                {mediaProf.map((r,i) => (
                  <tr key={i}>
                    <td><strong style={{fontWeight:500}}>{r.nome}</strong></td>
                    <td><span className="badge badge-neutral" style={{fontSize:11}}>{r.registro}</span></td>
                    <td><span style={{fontWeight:600,color:'#1d4ed8'}}>{r.mediaMensal}</span> <span style={{fontSize:11,color:'#888'}}>un/mês</span></td>
                    <td>{r.totalQtd}</td>
                    <td>{fmtR(r.totalCusto)}</td>
                    <td>{fmtR(parseFloat(r.custoPorMes))}</td>
                    <td><span className="badge badge-neutral">{r.mesesAtivos} {r.mesesAtivos===1?'mês':'meses'}</span></td>
                  </tr>
                ))}
                {!mediaProf.length && <tr><td colSpan={7} className="empty">Nenhum consumo no período</td></tr>}
              </tbody>
            </table>
          </div>

          {/* média por turma */}
          <div className="section-title">Média mensal por turma</div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Turma</th>
                  <th>Média/mês</th>
                  <th>Total consumido</th>
                  <th>Custo total</th>
                  <th>Custo/mês</th>
                  <th>Meses ativos</th>
                </tr>
              </thead>
              <tbody>
                {mediaTurma.map((r,i) => (
                  <tr key={i}>
                    <td><strong style={{fontWeight:500}}>{r.codigo}</strong></td>
                    <td><span style={{fontWeight:600,color:'#1d4ed8'}}>{r.mediaMensal}</span> <span style={{fontSize:11,color:'#888'}}>un/mês</span></td>
                    <td>{r.totalQtd}</td>
                    <td>{fmtR(r.totalCusto)}</td>
                    <td>{fmtR(parseFloat(r.custoPorMes))}</td>
                    <td><span className="badge badge-neutral">{r.mesesAtivos} {r.mesesAtivos===1?'mês':'meses'}</span></td>
                  </tr>
                ))}
                {!mediaTurma.length && <tr><td colSpan={6} className="empty">Nenhum consumo no período</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ POR TURMA ══ */}
      {tab==='turma' && (
        <div className="card">
          <table>
            <thead><tr><th>Turma</th><th>Itens retirados</th><th>Custo total</th><th>Devoluções pendentes</th></tr></thead>
            <tbody>
              {Object.values(porTurma).map((r,i)=>(
                <tr key={i}>
                  <td><strong style={{fontWeight:500}}>{r.turma}</strong></td>
                  <td>{r.itens}</td><td>{fmtR(r.custo)}</td>
                  <td>{r.pend>0?<span className="badge badge-warning">{r.pend} itens</span>:<span className="badge badge-success">OK</span>}</td>
                </tr>
              ))}
              {!Object.keys(porTurma).length && <tr><td colSpan={4} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ POR PROFESSOR ══ */}
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

      {/* ══ CONSUMO ══ */}
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

      {/* ══ POR PERÍODO ══ */}
      {tab==='periodo' && (
        <>
          <FiltrosPeriodo />
          <div className="card">
            <table>
              <thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Devolvível</th><th>Dev. prevista</th><th>Status</th><th>Custo</th></tr></thead>
              <tbody>
                {porPeriodo.map(s=>{
                  const st = statusDevolucao(s)
                  return (
                    <tr key={s.id}>
                      <td>{fmtData(s.data_saida)}</td>
                      <td>{nomeProdSaida(s)}</td>
                      <td>{s.quantidade}</td>
                      <td>{nomeProfSaida(s)}</td>
                      <td><span className="badge badge-neutral" style={{fontSize:11}}>{regProfSaida(s)}</span></td>
                      <td><strong style={{fontWeight:500}}>{turmaSaida(s)}</strong></td>
                      <td>{s.devolvivel?'Sim':'Não'}</td>
                      <td>{s.devolvivel?fmtData(s.data_devolucao_prevista):'-'}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>{fmtR(custoSaida(s)*s.quantidade)}</td>
                    </tr>
                  )
                })}
                {!porPeriodo.length && <tr><td colSpan={10} className="empty">Nenhuma saída no período</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
