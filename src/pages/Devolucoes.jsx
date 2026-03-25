import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, hoje } from '../lib/utils'

export default function Devolucoes() {
  const [pendentes, setPendentes] = useState([])
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pend')
  const [modalSaida, setModalSaida] = useState(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { qtd:1, data:hoje(), avaria:false, avariaDesc:'', avariaQtd:'', obs:'' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:saidas },{ data:devs }] = await Promise.all([
      supabase.from('saidas').select('*, itens(id,nome,custo_unitario), professores(nome,registro), turmas(codigo,turno)').eq('devolvivel',true),
      supabase.from('devolucoes').select('*, saidas(professor_nome_snapshot, turma_codigo_snapshot, professores(nome), turmas(codigo), itens(nome))').order('created_at',{ascending:false}),
    ])
    setPendentes((saidas||[]).filter(s=>s.devolvido<s.quantidade))
    setHistorico(devs||[])
    setLoading(false)
  }

  function abrirModal(saida) {
    setModalSaida(saida)
    setForm({...emptyForm, qtd: saida.quantidade - saida.devolvido})
  }

  async function salvar() {
    const qtd = parseInt(form.qtd)
    const pendente = modalSaida.quantidade - modalSaida.devolvido
    if (!qtd||qtd<1||qtd>pendente) return alert(`Quantidade inválida. Pendente: ${pendente}`)
    if (form.avaria && !form.avariaDesc.trim()) return alert('Descreva a avaria')
    if (form.avaria && (!form.avariaQtd||parseInt(form.avariaQtd)<1||parseInt(form.avariaQtd)>qtd)) return alert(`Quantidade avariada inválida (1–${qtd})`)
    setSaving(true)
    const { data:dev, error } = await supabase.from('devolucoes').insert({
      saida_id: modalSaida.id, quantidade: qtd,
      data_devolucao: form.data,
      avaria: form.avaria,
      avaria_descricao: form.avaria ? form.avariaDesc.trim() : null,
      avaria_quantidade: form.avaria ? parseInt(form.avariaQtd) : 0,
      observacoes: form.obs,
    }).select().single()
    if (!error) {
      await supabase.from('saidas').update({ devolvido: modalSaida.devolvido + qtd }).eq('id', modalSaida.id)
      const { data:item } = await supabase.from('itens').select('quantidade').eq('id', modalSaida.item_id).single()
      await supabase.from('itens').update({ quantidade: item.quantidade + qtd }).eq('id', modalSaida.item_id)
      // log
      await supabase.from('movimentacoes').insert({
        item_id: modalSaida.item_id,
        item_nome: modalSaida.itens?.nome,
        tipo: 'devolucao', quantidade: qtd,
        professor_id: modalSaida.professor_id,
        professor_nome: modalSaida.professores?.nome || modalSaida.professor_nome_snapshot,
        turma_id: modalSaida.turma_id,
        turma_codigo: modalSaida.turmas?.codigo || modalSaida.turma_codigo_snapshot,
        referencia_id: dev?.id,
        observacoes: form.avaria ? `Avaria: ${form.avariaDesc}` : form.obs,
      })
      setModalSaida(null); load()
    } else { alert('Erro: '+error.message) }
    setSaving(false)
  }

  const hj = hoje()
  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header"><div className="page-title">Devoluções</div></div>
      <div className="tabs">
        <div className={`tab${tab==='pend'?' active':''}`} onClick={()=>setTab('pend')}>Pendentes</div>
        <div className={`tab${tab==='hist'?' active':''}`} onClick={()=>setTab('hist')}>Histórico</div>
      </div>

      {tab==='pend' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Retirado</th><th>Devolvido</th><th>Pendente</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Turno</th><th>Data saída</th><th>Dev. prevista</th><th>Situação</th><th>Ação</th></tr></thead>
            <tbody>
              {pendentes.map(s=>{
                const venc = s.data_devolucao_prevista && s.data_devolucao_prevista < hj
                const nomeProfessor = s.professores?.nome || s.professor_nome_snapshot || '—'
                const registro = s.professores?.registro || '—'
                const codigoTurma = s.turmas?.codigo || s.turma_codigo_snapshot || '—'
                return (
                  <tr key={s.id}>
                    <td>{s.itens?.nome}</td>
                    <td>{s.quantidade}</td>
                    <td>{s.devolvido}</td>
                    <td><strong style={{color:'#dc2626'}}>{s.quantidade-s.devolvido}</strong></td>
                    <td>{nomeProfessor}</td>
                    <td><span className="badge badge-neutral" style={{fontSize:11}}>{registro}</span></td>
                    <td><strong style={{fontWeight:500}}>{codigoTurma}</strong></td>
                    <td>{s.turmas?.turno||'—'}</td>
                    <td>{fmtData(s.data_saida)}</td>
                    <td style={{color:venc?'#dc2626':'#d97706'}}>{fmtData(s.data_devolucao_prevista)}</td>
                    <td>{venc?<span className="badge badge-danger">Vencido</span>:<span className="badge badge-warning">Pendente</span>}</td>
                    <td><button className="btn btn-success btn-sm" onClick={()=>abrirModal(s)}>Devolver</button></td>
                  </tr>
                )
              })}
              {!pendentes.length && <tr><td colSpan={12} className="empty">Nenhuma devolução pendente</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab==='hist' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Turma</th><th>Data devolução</th><th>Avaria?</th><th>Observações / Avaria</th></tr></thead>
            <tbody>
              {historico.map(d=>{
                const nomeProfessor = d.saidas?.professores?.nome || d.saidas?.professor_nome_snapshot || '—'
                const codigoTurma = d.saidas?.turmas?.codigo || d.saidas?.turma_codigo_snapshot || '—'
                return (
                  <tr key={d.id}>
                    <td>{d.saidas?.itens?.nome}</td>
                    <td>{d.quantidade}</td>
                    <td>{nomeProfessor}</td>
                    <td><strong style={{fontWeight:500}}>{codigoTurma}</strong></td>
                    <td>{fmtData(d.data_devolucao)}</td>
                    <td>{d.avaria?<span className="avaria-tag">Sim — {d.avaria_quantidade} item(ns)</span>:<span className="badge badge-success">Não</span>}</td>
                    <td style={{fontSize:12,color:d.avaria?'#dc2626':'#888'}}>{d.avaria?d.avaria_descricao:(d.observacoes||'—')}</td>
                  </tr>
                )
              })}
              {!historico.length && <tr><td colSpan={7} className="empty">Nenhuma devolução registrada</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className={`modal-overlay${modalSaida?' open':''}`}>
        <div className="modal">
          <h3>Registrar devolução</h3>
          <div className="form-row"><label>Item</label>
            <input readOnly value={`${modalSaida?.itens?.nome||''} (pendente: ${modalSaida?modalSaida.quantidade-modalSaida.devolvido:''})`} />
          </div>
          <div style={{display:'flex',gap:8,fontSize:13,marginBottom:12,color:'#666'}}>
            <span>Professor(a): <strong>{modalSaida?.professores?.nome||modalSaida?.professor_nome_snapshot||'—'}</strong></span>
            <span>·</span>
            <span>Turma: <strong>{modalSaida?.turmas?.codigo||modalSaida?.turma_codigo_snapshot||'—'}</strong></span>
          </div>
          <div className="form-grid">
            <div className="form-row"><label>Quantidade devolvida</label>
              <input type="number" min="1" value={form.qtd} onChange={e=>setForm({...form,qtd:e.target.value})} />
            </div>
            <div className="form-row"><label>Data da devolução</label>
              <input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label" style={{color:'#dc2626'}}>
              <input type="checkbox" checked={form.avaria} onChange={e=>setForm({...form,avaria:e.target.checked,avariaDesc:'',avariaQtd:''})} style={{accentColor:'#dc2626'}} />
              <strong>Item devolvido com avaria</strong>
            </label>
          </div>
          {form.avaria && (
            <div style={{background:'#fff5f5',border:'1px solid #fecaca',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
              <div className="form-row"><label style={{color:'#dc2626'}}>Descrição da avaria</label>
                <textarea rows={2} value={form.avariaDesc} onChange={e=>setForm({...form,avariaDesc:e.target.value})} placeholder="Descreva o dano..." />
              </div>
              <div className="form-row" style={{marginBottom:0}}><label style={{color:'#dc2626'}}>Qtd com avaria</label>
                <input type="number" min="1" value={form.avariaQtd} onChange={e=>setForm({...form,avariaQtd:e.target.value})} />
              </div>
            </div>
          )}
          <div className="form-row"><label>Observações gerais</label>
            <textarea rows={2} value={form.obs} onChange={e=>setForm({...form,obs:e.target.value})} placeholder="Opcional..." />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModalSaida(null)}>Cancelar</button>
            <button className="btn btn-success" onClick={salvar} disabled={saving}>{saving?'Salvando...':'Confirmar devolução'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
