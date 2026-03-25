import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtData, fmtR, hoje, statusDevolucao } from '../lib/utils'

export default function Saidas() {
  const [saidas, setSaidas] = useState([])
  const [itens, setItens] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    item_id: '', quantidade: 1, professor: '', sala: '', turno: 'Manhã',
    data_saida: hoje(), devolvivel: false, data_devolucao_prevista: '', obs: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: i }, { data: u }] = await Promise.all([
      supabase.from('saidas').select('*, itens(nome, custo_unitario)').order('created_at', { ascending: false }),
      supabase.from('itens').select('id, nome, quantidade, unidade').order('nome'),
      supabase.from('usuarios').select('id, nome').order('nome'),
    ])
    setSaidas(s || [])
    setItens(i || [])
    setUsuarios(u || [])
    setLoading(false)
  }

  function openModal() {
    setForm({
      item_id: '', quantidade: 1, professor: '', sala: '', turno: 'Manhã',
      data_saida: hoje(), devolvivel: false, data_devolucao_prevista: '', obs: ''
    })
    setModal(true)
  }

  function toggleDevolvivel(v) {
    let datadev = ''
    if (v) {
      const d = new Date(); d.setDate(d.getDate() + 7)
      datadev = d.toISOString().split('T')[0]
    }
    setForm({ ...form, devolvivel: v, data_devolucao_prevista: datadev })
  }

  async function salvar() {
    if (!form.item_id) return alert('Selecione um item')
    if (!form.quantidade || form.quantidade < 1) return alert('Informe a quantidade')
    if (!form.professor) return alert('Informe o professor(a)')
    if (!form.sala) return alert('Informe a sala')
    if (form.devolvivel && !form.data_devolucao_prevista) return alert('Informe a data prevista de devolução')

    const item = itens.find(i => i.id === form.item_id)
    if (parseInt(form.quantidade) > item.quantidade) return alert(`Quantidade indisponível. Estoque atual: ${item.quantidade} ${item.unidade}`)

    setSaving(true)
    const { error } = await supabase.from('saidas').insert({
      item_id: form.item_id,
      quantidade: parseInt(form.quantidade),
      professor: form.professor,
      sala: form.sala,
      turno: form.turno,
      data_saida: form.data_saida,
      devolvivel: form.devolvivel,
      data_devolucao_prevista: form.devolvivel ? form.data_devolucao_prevista : null,
      devolvido: 0,
      observacoes: form.obs,
    })
    if (!error) {
      await supabase.from('itens').update({ quantidade: item.quantidade - parseInt(form.quantidade) }).eq('id', form.item_id)
      setModal(false)
      load()
    } else {
      alert('Erro ao salvar: ' + error.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Saídas</div>
        <button className="btn btn-primary" onClick={openModal}>+ Nova saída</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Data</th><th>Item</th><th>Qtd</th><th>Professor(a)</th><th>Sala</th><th>Turno</th><th>Custo</th><th>Devolvível</th><th>Dev. prevista</th><th>Status</th></tr>
          </thead>
          <tbody>
            {saidas.map(s => {
              const st = statusDevolucao(s)
              return (
                <tr key={s.id}>
                  <td>{fmtData(s.data_saida)}</td>
                  <td>{s.itens?.nome}</td>
                  <td>{s.quantidade}</td>
                  <td>{s.professor}</td>
                  <td>{s.sala}</td>
                  <td>{s.turno}</td>
                  <td>{fmtR((s.itens?.custo_unitario || 0) * s.quantidade)}</td>
                  <td>{s.devolvivel ? <span className="badge badge-info">Sim</span> : <span className="badge badge-neutral">Não</span>}</td>
                  <td>{s.devolvivel ? fmtData(s.data_devolucao_prevista) : '-'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                </tr>
              )
            })}
            {!saidas.length && <tr><td colSpan={10} className="empty">Nenhuma saída registrada</td></tr>}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay${modal ? ' open' : ''}`}>
        <div className="modal">
          <h3>Registrar saída</h3>
          <div className="form-grid">
            <div className="form-row">
              <label>Item</label>
              <select value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
                <option value="">Selecione...</option>
                {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.quantidade} {i.unidade})</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Quantidade</label>
              <input type="number" min="1" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Professor(a)</label>
              <select value={form.professor} onChange={e => setForm({ ...form, professor: e.target.value })}>
                <option value="">Selecione...</option>
                {usuarios.map(u => <option key={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Sala</label>
              <input value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })} placeholder="Ex: Sala 5" />
            </div>
            <div className="form-row">
              <label>Turno</label>
              <select value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })}>
                <option>Manhã</option><option>Tarde</option><option>Noite</option>
              </select>
            </div>
            <div className="form-row">
              <label>Data de saída</label>
              <input type="date" value={form.data_saida} onChange={e => setForm({ ...form, data_saida: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.devolvivel} onChange={e => toggleDevolvivel(e.target.checked)} />
              Passível de devolução
            </label>
          </div>
          {form.devolvivel && (
            <div className="form-row">
              <label>Data prevista de devolução</label>
              <input type="date" value={form.data_devolucao_prevista} onChange={e => setForm({ ...form, data_devolucao_prevista: e.target.value })} />
            </div>
          )}
          <div className="form-row">
            <label>Observações</label>
            <textarea rows={2} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Opcional..." />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Registrar saída'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
