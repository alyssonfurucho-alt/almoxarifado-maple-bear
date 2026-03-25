import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Relatorios() {
  const [tab, setTab] = useState('sala')
  const [saidas, setSaidas] = useState([])
  const [devolucoes, setDevolucoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filDe, setFilDe] = useState('')
  const [filAte, setFilAte] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from('saidas').select('*, itens(nome, custo_unitario)').order('data_saida'),
      supabase.from('devolucoes').select('*, saidas(professor, sala, turno, itens(nome))'),
    ])
    setSaidas(s || [])
    setDevolucoes(d || [])
    setLoading(false)
  }

  if (loading) return <div className="loading">Carregando...</div>

  // Por sala/turno
  const porSala = {}
  saidas.forEach(s => {
    const k = `${s.sala}|${s.turno}`
    if (!porSala[k]) porSala[k] = { sala: s.sala, turno: s.turno, itens: 0, custo: 0, pend: 0 }
    porSala[k].itens += s.quantidade
    porSala[k].custo += (s.itens?.custo_unitario || 0) * s.quantidade
    if (s.devolvivel) porSala[k].pend += s.quantidade - s.devolvido
  })

  // Por professor
  const porProf = {}
  saidas.forEach(s => {
    if (!porProf[s.professor]) porProf[s.professor] = { saidas: 0, itens: 0, custo: 0, dev: 0, pend: 0, venc: 0, avarias: 0 }
    porProf[s.professor].saidas++
    porProf[s.professor].itens += s.quantidade
    porProf[s.professor].custo += (s.itens?.custo_unitario || 0) * s.quantidade
    if (s.devolvivel) {
      porProf[s.professor].dev += s.devolvido
      porProf[s.professor].pend += s.quantidade - s.devolvido
      if (s.data_devolucao_prevista && s.data_devolucao_prevista < hoje() && s.devolvido < s.quantidade)
        porProf[s.professor].venc += s.quantidade - s.devolvido
    }
  })
  devolucoes.filter(d => d.avaria).forEach(d => {
    const p = d.saidas?.professor
    if (p && porProf[p]) porProf[p].avarias += d.avaria_quantidade || 0
  })

  // Consumo
  const consumo = {}
  saidas.forEach(s => {
    const nome = s.itens?.nome || 'Desconhecido'
    if (!consumo[nome]) consumo[nome] = { retirado: 0, devolvido: 0, custo: 0, avarias: 0 }
    consumo[nome].retirado += s.quantidade
    consumo[nome].devolvido += s.devolvido
    consumo[nome].custo += (s.itens?.custo_unitario || 0) * s.quantidade
  })
  devolucoes.filter(d => d.avaria).forEach(d => {
    const nome = d.saidas?.itens?.nome
    if (nome && consumo[nome]) consumo[nome].avarias += d.avaria_quantidade || 0
  })

  // Por período
  const hj = hoje()
  const porPeriodo = saidas.filter(s => (!filDe || s.data_saida >= filDe) && (!filAte || s.data_saida <= filAte))

  return (
    <div>
      <div className="page-header"><div className="page-title">Relatórios</div></div>
      <div className="tabs">
        {[['sala','Por sala/turno'],['prof','Por professor(a)'],['consumo','Consumo'],['periodo','Por período']].map(([k,l]) => (
          <div key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</div>
        ))}
      </div>

      {tab === 'sala' && (
        <div className="card">
          <table>
            <thead><tr><th>Sala</th><th>Turno</th><th>Itens retirados</th><th>Custo total</th><th>Devoluções pendentes</th></tr></thead>
            <tbody>
              {Object.values(porSala).map((r, i) => (
                <tr key={i}>
                  <td>{r.sala}</td><td>{r.turno}</td><td>{r.itens}</td><td>{fmtR(r.custo)}</td>
                  <td>{r.pend > 0 ? <span className="badge badge-warning">{r.pend} itens</span> : <span className="badge badge-success">OK</span>}</td>
                </tr>
              ))}
              {!Object.keys(porSala).length && <tr><td colSpan={5} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'prof' && (
        <div className="card">
          <table>
            <thead><tr><th>Professor(a)</th><th>Saídas</th><th>Itens</th><th>Custo total</th><th>Devolvidos</th><th>Pendentes</th><th>Vencidos</th><th>Avarias</th></tr></thead>
            <tbody>
              {Object.entries(porProf).map(([nome, r]) => (
                <tr key={nome}>
                  <td>{nome}</td><td>{r.saidas}</td><td>{r.itens}</td><td>{fmtR(r.custo)}</td>
                  <td>{r.dev}</td><td>{r.pend}</td>
                  <td>{r.venc > 0 ? <span className="badge badge-danger">{r.venc}</span> : <span className="badge badge-success">0</span>}</td>
                  <td>{r.avarias > 0 ? <span className="badge badge-danger">{r.avarias}</span> : <span className="badge badge-success">0</span>}</td>
                </tr>
              ))}
              {!Object.keys(porProf).length && <tr><td colSpan={8} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'consumo' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Total retirado</th><th>Total devolvido</th><th>Consumido</th><th>Avarias</th><th>Custo total</th></tr></thead>
            <tbody>
              {Object.entries(consumo).map(([nome, r]) => (
                <tr key={nome}>
                  <td>{nome}</td><td>{r.retirado}</td><td>{r.devolvido}</td>
                  <td>{r.retirado - r.devolvido}</td>
                  <td>{r.avarias > 0 ? <span className="badge badge-danger">{r.avarias}</span> : <span className="badge badge-success">0</span>}</td>
                  <td>{fmtR(r.custo)}</td>
                </tr>
              ))}
              {!Object.keys(consumo).length && <tr><td colSpan={6} className="empty">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'periodo' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>De</label>
              <input type="date" value={filDe} onChange={e => setFilDe(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
            </div>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Até</label>
              <input type="date" value={filAte} onChange={e => setFilAte(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
            </div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Sala</th><th>Turno</th><th>Devolvível</th><th>Dev. prevista</th><th>Status</th><th>Custo</th></tr></thead>
              <tbody>
                {porPeriodo.map(s => {
                  const st = statusDevolucao(s)
                  return (
                    <tr key={s.id}>
                      <td>{fmtData(s.data_saida)}</td>
                      <td>{s.itens?.nome}</td>
                      <td>{s.quantidade}</td>
                      <td>{s.professor}</td>
                      <td>{s.sala}</td>
                      <td>{s.turno}</td>
                      <td>{s.devolvivel ? 'Sim' : 'Não'}</td>
                      <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '-'}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td>{fmtR((s.itens?.custo_unitario || 0) * s.quantidade)}</td>
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
