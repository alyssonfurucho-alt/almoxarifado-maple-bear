import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Saidas() {
  const [saidas, setSaidas] = useState([])
  const [itens, setItens] = useState([])
  const [professores, setProfessores] = useState([])
  const [turmas, setTurmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const emptyForm = { item_id:'', quantidade:1, professor_id:'', turma_id:'', data_saida:hoje(), devolvivel:false, data_devolucao_prevista:'', observacoes:'' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:s },{ data:i },{ data:p },{ data:t }] = await Promise.all([
      supabase.from('saidas').select('*, itens(nome,custo_unitario), professores(nome,registro), turmas(codigo,turno)').order('created_at',{ascending:false}),
      supabase.from('itens').select('id,nome,quantidade,unidade').order('nome'),
      supabase.from('professores').select('id,nome,registro').eq('ativo',true).order('nome'),
      supabase.from('turmas').select('id,codigo,turno').eq('ativo',true).order('turno').order('codigo'),
    ])
    setSaidas(s||[]); setItens(i||[]); setProfessores(p||[]); setTurmas(t||[])
    setLoading(false)
  }

  function openModal() { setForm(emptyForm); setModal(true) }

  function toggleDev(v) {
    const d = new Date(); d.setDate(d.getDate()+7)
    setForm({...form, devolvivel:v, data_devolucao_prevista: v ? d.toISOString().split('T')[0] : ''})
  }

  async function salvar() {
    if (!form.item_id)       return alert('Selecione um item')
    if (form.quantidade < 1) return alert('Informe a quantidade')
    if (!form.professor_id)  return alert('Selecione o(a) professor(a)')
    if (!form.turma_id)      return alert('Selecione a turma')
    if (form.devolvivel && !form.data_devolucao_prevista) return alert('Informe a data prevista de devolução')
    const item = itens.find(i=>i.id===form.item_id)
    if (parseInt(form.quantidade) > item.quantidade) return alert(`Estoque insuficiente. Disponível: ${item.quantidade} ${item.unidade}`)
    const prof = professores.find(p=>p.id===form.professor_id)
    const turma = turmas.find(t=>t.id===form.turma_id)
    setSaving(true)
    const { data:saida, error } = await supabase.from('saidas').insert({
      item_id: form.item_id,
      quantidade: parseInt(form.quantidade),
      professor_id: form.professor_id,
      professor_nome_snapshot: prof?.nome,
      turma_id: form.turma_id,
      turma_codigo_snapshot: turma?.codigo,
      data_saida: form.data_saida,
      devolvivel: form.devolvivel,
      data_devolucao_prevista: form.devolvivel ? form.data_devolucao_prevista : null,
      devolvido: 0,
      observacoes: form.observacoes,
    }).select().single()
    if (!error) {
      await supabase.from('itens').update({ quantidade: item.quantidade - parseInt(form.quantidade) }).eq('id', form.item_id)
      // registra no log
      await supabase.from('movimentacoes').insert({
        item_id: form.item_id, item_nome: item.nome, tipo: 'saida',
        quantidade: parseInt(form.quantidade),
        professor_id: form.professor_id, professor_nome: prof?.nome,
        turma_id: form.turma_id, turma_codigo: turma?.codigo,
        referencia_id: saida?.id, observacoes: form.observacoes,
      })
      setModal(false); load()
    } else { alert('Erro: '+error.message) }
    setSaving(false)
  }

  const porTurno = turmas.reduce((acc,t)=>{ (acc[t.turno]??=[]).push(t); return acc },{})

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Saídas</div>
        <button className="btn btn-primary" onClick={openModal}>+ Nova saída</button>
      </div>

      {(!professores.length||!turmas.length) && (
        <div className="alert alert-warning">
          {!professores.length && 'Cadastre professores antes de registrar saídas. '}
          {!turmas.length && 'Cadastre turmas antes de registrar saídas.'}
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Turno</th><th>Custo</th><th>Devolvível</th><th>Dev. prevista</th><th>Status</th></tr></thead>
          <tbody>
            {saidas.map(s=>{
              const st = statusDevolucao(s)
              const nomeProfessor = s.professores?.nome || s.professor_nome_snapshot || '—'
              const registroProfessor = s.professores?.registro || '—'
              const codigoTurma = s.turmas?.codigo || s.turma_codigo_snapshot || '—'
              const turno = s.turmas?.turno || '—'
              return (
                <tr key={s.id}>
                  <td>{fmtData(s.data_saida)}</td>
                  <td>{s.itens?.nome}</td>
                  <td>{s.quantidade}</td>
                  <td>{nomeProfessor}</td>
                  <td><span className="badge badge-neutral" style={{fontSize:11}}>{registroProfessor}</span></td>
                  <td><strong style={{fontWeight:500}}>{codigoTurma}</strong></td>
                  <td>{turno}</td>
                  <td>{fmtR((s.itens?.custo_unitario||0)*s.quantidade)}</td>
                  <td>{s.devolvivel?<span className="badge badge-info">Sim</span>:<span className="badge badge-neutral">Não</span>}</td>
                  <td>{s.devolvivel?fmtData(s.data_devolucao_prevista):'-'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                </tr>
              )
            })}
            {!saidas.length && <tr><td colSpan={11} className="empty">Nenhuma saída registrada</td></tr>}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay${modal?' open':''}`}>
        <div className="modal">
          <h3>Registrar saída</h3>
          <div className="form-grid">
            <div className="form-row"><label>Item</label>
              <select value={form.item_id} onChange={e=>setForm({...form,item_id:e.target.value})}>
                <option value="">Selecione...</option>
                {itens.map(i=><option key={i.id} value={i.id}>{i.nome} ({i.quantidade} {i.unidade})</option>)}
              </select>
            </div>
            <div className="form-row"><label>Quantidade</label>
              <input type="number" min="1" value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} />
            </div>
            <div className="form-row"><label>Professor(a)</label>
              <select value={form.professor_id} onChange={e=>setForm({...form,professor_id:e.target.value})}>
                <option value="">Selecione...</option>
                {professores.map(p=><option key={p.id} value={p.id}>{p.nome}{p.registro?` — ${p.registro}`:''}</option>)}
              </select>
            </div>
            <div className="form-row"><label>Turma</label>
              <select value={form.turma_id} onChange={e=>setForm({...form,turma_id:e.target.value})}>
                <option value="">Selecione...</option>
                {Object.entries(porTurno).map(([turno,ts])=>(
                  <optgroup key={turno} label={`— ${turno} —`}>
                    {ts.map(t=><option key={t.id} value={t.id}>{t.codigo}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="form-row"><label>Data de saída</label>
              <input type="date" value={form.data_saida} onChange={e=>setForm({...form,data_saida:e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.devolvivel} onChange={e=>toggleDev(e.target.checked)} />
              Passível de devolução
            </label>
          </div>
          {form.devolvivel && (
            <div className="form-row"><label>Data prevista de devolução</label>
              <input type="date" value={form.data_devolucao_prevista} onChange={e=>setForm({...form,data_devolucao_prevista:e.target.value})} />
            </div>
          )}
          <div className="form-row"><label>Observações</label>
            <textarea rows={2} value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} placeholder="Opcional..." />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':'Registrar saída'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
