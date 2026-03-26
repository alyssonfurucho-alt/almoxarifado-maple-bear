import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR } from '../lib/utils'

const TIPO_LABEL = { entrada:'Entrada', saida:'Saída', devolucao:'Devolução', ajuste:'Ajuste' }
const TIPO_CLS   = { entrada:'badge-success', saida:'badge-warning', devolucao:'badge-info', ajuste:'badge-neutral' }

export default function Historico() {
  const [movs, setMovs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filTipo, setFilTipo] = useState('')
  const [filDe, setFilDe] = useState('')
  const [filAte, setFilAte] = useState('')
  const [filBusca, setFilBusca] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('movimentacoes')
      .select('*, estoque(nome,unidade,custo_unitario), professores(nome,registro), turmas(codigo)')
      .order('created_at', { ascending: false })
      .limit(500)
    setMovs(data || [])
    setLoading(false)
  }

  const lista = movs.filter(m => {
    const data = m.created_at?.split('T')[0] || ''
    if (filTipo && m.tipo !== filTipo) return false
    if (filDe && data < filDe) return false
    if (filAte && data > filAte) return false
    if (filBusca) {
      const q = filBusca.toLowerCase()
      const nome = (m.estoque?.nome || m.item_nome || '').toLowerCase()
      const prof = (m.professores?.nome || m.professor_nome || '').toLowerCase()
      const turma = (m.turmas?.codigo || m.turma_codigo || '').toLowerCase()
      if (!nome.includes(q) && !prof.includes(q) && !turma.includes(q)) return false
    }
    return true
  })

  const totalEntradas = lista.filter(m=>m.tipo==='entrada'||m.tipo==='devolucao').reduce((a,m)=>a+m.quantidade,0)
  const totalSaidas   = lista.filter(m=>m.tipo==='saida').reduce((a,m)=>a+m.quantidade,0)

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Histórico de estoque</div>
      </div>

      <div className="cards-grid">
        <div className="metric-card"><div className="metric-label">Registros (filtro)</div><div className="metric-value blue">{lista.length}</div></div>
        <div className="metric-card"><div className="metric-label">Total entradas</div><div className="metric-value green">{totalEntradas}</div></div>
        <div className="metric-card"><div className="metric-label">Total saídas</div><div className="metric-value yellow">{totalSaidas}</div></div>
      </div>

      {/* Filtros */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div className="search-bar" style={{flex:'1 1 200px',marginBottom:0}}>
          <input placeholder="Buscar item, professor, turma..." value={filBusca} onChange={e=>setFilBusca(e.target.value)} />
        </div>
        <div>
          <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Tipo</label>
          <select value={filTipo} onChange={e=>setFilTipo(e.target.value)}
            style={{padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13,background:'#fff',color:'#1a1a1a'}}>
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
            <option value="devolucao">Devolução</option>
            <option value="ajuste">Ajuste</option>
          </select>
        </div>
        <div>
          <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>De</label>
          <input type="date" value={filDe} onChange={e=>setFilDe(e.target.value)}
            style={{padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
        </div>
        <div>
          <label style={{fontSize:12,color:'#666',display:'block',marginBottom:4}}>Até</label>
          <input type="date" value={filAte} onChange={e=>setFilAte(e.target.value)}
            style={{padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:8,fontSize:13}} />
        </div>
        <button className="btn btn-sm" style={{alignSelf:'flex-end'}}
          onClick={()=>{setFilTipo('');setFilDe('');setFilAte('');setFilBusca('')}}>
          Limpar filtros
        </button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Tipo</th>
              <th>Item</th>
              <th>Qtd</th>
              <th>Professor(a)</th>
              <th>Registro</th>
              <th>Turma</th>
              
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(m => {
              const nomeProfessor = m.professores?.nome || m.professor_nome || '—'
              const registro      = m.professores?.registro || '—'
              const codigoTurma   = m.turmas?.codigo || m.turma_codigo || '—'
              
              const prod = m.estoque?.produtos
              const nomeItem = prod ? `${prod.nome}${prod.cor ? ` — ${prod.cor}` : ''}${prod.tamanho ? ` ${prod.tamanho}` : ''}` : (m.estoque?.nome || m.item_nome || '—')
              const dt = new Date(m.created_at)
              const dataHora = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
              const isEntrada = m.tipo==='entrada'||m.tipo==='devolucao'
              return (
                <tr key={m.id}>
                  <td style={{fontSize:12,color:'#888',whiteSpace:'nowrap'}}>{dataHora}</td>
                  <td><span className={`badge ${TIPO_CLS[m.tipo]||'badge-neutral'}`}>{TIPO_LABEL[m.tipo]||m.tipo}</span></td>
                  <td><strong style={{fontWeight:500}}>{nomeItem}</strong></td>
                  <td>
                    <span style={{fontWeight:500, color: isEntrada ? '#16a34a' : '#d97706'}}>
                      {isEntrada ? '+' : '-'}{m.quantidade}
                    </span>
                  </td>
                  <td>{nomeProfessor}</td>
                  <td><span className="badge badge-neutral" style={{fontSize:11}}>{registro}</span></td>
                  <td><strong style={{fontWeight:500}}>{codigoTurma==='—'?'—':codigoTurma}</strong></td>
                  <td>{turno==='—'?'—':turno}</td>
                  <td style={{fontSize:12,color:'#888',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.observacoes||'—'}</td>
                </tr>
              )
            })}
            {!lista.length && <tr><td colSpan={9} className="empty">Nenhuma movimentação encontrada</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
