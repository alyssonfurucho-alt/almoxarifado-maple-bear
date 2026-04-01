import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Relatorios() {
  const [saidas, setSaidas]           = useState([])
  const [professores, setProfessores] = useState([])
  const [turmas, setTurmas]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [filDe, setFilDe]             = useState('')
  const [filAte, setFilAte]           = useState('')
  const [filProf, setFilProf]         = useState('')
  const [filTurma, setFilTurma]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:s }, { data:p }, { data:t }] = await Promise.all([
      supabase.from('saidas')
        .select('*, estoque(nome,custo_unitario,custo_medio,ultimo_custo,produtos(nome,cor,tamanho)), professores(nome,registro), turmas(codigo)')
        .order('data_saida', { ascending: false }),
      supabase.from('professores').select('id,nome').eq('ativo',true).order('nome'),
      supabase.from('turmas').select('id,codigo').eq('ativo',true).order('codigo'),
    ])
    setSaidas(s||[]); setProfessores(p||[]); setTurmas(t||[])
    setLoading(false)
  }

  const custoSaida = s => s.custo_unitario_saida || s.estoque?.custo_medio || s.estoque?.custo_unitario || 0
  const nomeProd   = s => { const p = s.estoque?.produtos; return p ? `${p.nome}${p.cor?` — ${p.cor}`:''}${p.tamanho?` ${p.tamanho}`:''}` : (s.estoque?.nome || '—') }
  const nomeProf   = s => s.professores?.nome || s.professor_nome_snapshot || '—'
  const regProf    = s => s.professores?.registro || '—'
  const codTurma   = s => s.turmas?.codigo || s.turma_codigo_snapshot || '—'

  const saidasFiltradas = saidas.filter(s => {
    if (filDe    && s.data_saida < filDe)   return false
    if (filAte   && s.data_saida > filAte)  return false
    if (filProf  && nomeProf(s) !== filProf) return false
    if (filTurma && codTurma(s) !== filTurma) return false
    return true
  })

  const temFiltro    = filDe || filAte || filProf || filTurma
  const totalItens   = saidasFiltradas.reduce((a,s) => a + s.quantidade, 0)
  const totalCusto   = saidasFiltradas.reduce((a,s) => a + custoSaida(s) * s.quantidade, 0)
  const totalDev     = saidasFiltradas.reduce((a,s) => a + (s.devolvido||0), 0)
  const totalPend    = saidasFiltradas.filter(s => s.devolvivel).reduce((a,s) => a + (s.quantidade - (s.devolvido||0)), 0)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header"><div className="page-title">Relatórios</div></div>

      {/* ── FILTROS ── */}
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
          {temFiltro && (
            <button className="btn btn-sm" style={{ alignSelf:'flex-end' }}
              onClick={() => { setFilDe(''); setFilAte(''); setFilProf(''); setFilTurma('') }}>
              Limpar filtros
            </button>
          )}
        </div>
        {temFiltro && (
          <div style={{ marginTop:10, fontSize:12, color:'#1d4ed8' }}>
            🔍 {saidasFiltradas.length} de {saidas.length} saídas
          </div>
        )}
      </div>

      {/* ── CARDS RESUMO ── */}
      <div className="cards-grid" style={{ marginBottom:16 }}>
        <div className="metric-card"><div className="metric-label">Saídas</div><div className="metric-value blue">{saidasFiltradas.length}</div></div>
        <div className="metric-card"><div className="metric-label">Itens retirados</div><div className="metric-value">{totalItens}</div></div>
        <div className="metric-card"><div className="metric-label">Custo total</div><div className="metric-value">{fmtR(totalCusto)}</div></div>
        <div className="metric-card"><div className="metric-label">Devolvidos</div><div className="metric-value green">{totalDev}</div></div>
        <div className="metric-card"><div className="metric-label">Pendentes</div><div className="metric-value yellow">{totalPend}</div></div>
      </div>

      {/* ── TABELA DE SAÍDAS ── */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Produto</th><th>Qtd</th>
              <th>Professor(a)</th><th>Registro</th><th>Turma</th>
              <th>Devolvível</th><th>Dev. prevista</th><th>Status</th><th>Custo total</th>
            </tr>
          </thead>
          <tbody>
            {saidasFiltradas.map(s => {
              const st = statusDevolucao(s)
              return (
                <tr key={s.id}>
                  <td style={{ fontSize:12, color:'#888', whiteSpace:'nowrap' }}>{fmtData(s.data_saida)}</td>
                  <td><strong style={{ fontWeight:500 }}>{nomeProd(s)}</strong></td>
                  <td>{s.quantidade}</td>
                  <td>{nomeProf(s)}</td>
                  <td><span className="badge badge-neutral" style={{ fontSize:11 }}>{regProf(s)}</span></td>
                  <td><strong style={{ fontWeight:500 }}>{codTurma(s)}</strong></td>
                  <td>{s.devolvivel ? 'Sim' : 'Não'}</td>
                  <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '—'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td>{fmtR(custoSaida(s) * s.quantidade)}</td>
                </tr>
              )
            })}
            {!saidasFiltradas.length && (
              <tr><td colSpan={10} className="empty">Nenhuma saída encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
