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
  const [form, setForm] = useState({ qtd: 1, data: hoje(), avaria: false, avariaDesc: '', avariaQtd: '', obs: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: saidas }, { data: devs }] = await Promise.all([
      supabase.from('saidas').select('*, itens(nome, custo_unitario)').eq('devolvivel', true),
      supabase.from('devolucoes').select('*, saidas(professor, sala, turno, itens(nome))').order('created_at', { ascending: false }),
    ])
    setPendentes((saidas || []).filter(s => s.devolvido < s.quantidade))
    setHistorico(devs || [])
    setLoading(false)
  }

  function abrirModal(saida) {
    setModalSaida(saida)
    setForm({ qtd: saida.quantidade - saida.devolvido, data: hoje(), avaria: false, avariaDesc: '', avariaQtd: '', obs: '' })
  }

  async function salvar() {
    const qtd = parseInt(form.qtd)
    const pendente = modalSaida.quantidade - modalSaida.devolvido
    if (!qtd || qtd < 1 || qtd > pendente) return alert(`Quantidade inválida. Pendente: ${pendente}`)
    if (form.avaria && !form.avariaDesc.trim()) return alert('Descreva a avaria')
    if (form.avaria && (!form.avariaQtd || parseInt(form.avariaQtd) < 1 || parseInt(form.avariaQtd) > qtd))
      return alert(`Quantidade avariada inválida (entre 1 e ${qtd})`)

    setSaving(true)
    const { error } = await supabase.from('devolucoes').insert({
      saida_id: modalSaida.id,
      quantidade: qtd,
      data_devolucao: form.data,
      avaria: form.avaria,
      avaria_descricao: form.avaria ? form.avariaDesc.trim() : null,
      avaria_quantidade: form.avaria ? parseInt(form.avariaQtd) : 0,
      observacoes: form.obs,
    })
    if (!error) {
      // atualiza devolvido na saída
      await supabase.from('saidas').update({ devolvido: modalSaida.devolvido + qtd }).eq('id', modalSaida.id)
      // devolve ao estoque
      await supabase.from('itens').update({
        quantidade: supabase.raw ? undefined : undefined
      })
      // busca qtd atual do item e soma
      const { data: item } = await supabase.from('itens').select('quantidade').eq('id', modalSaida.item_id).single()
      await supabase.from('itens').update({ quantidade: item.quantidade + qtd }).eq('id', modalSaida.item_id)
      setModalSaida(null)
      load()
    } else {
      alert('Erro: ' + error.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="loading">Carregando...</div>

  const hj = hoje()

  return (
    <div>
      <div className="page-header"><div className="page-title">Devoluções</div></div>
      <div className="tabs">
        <div className={`tab${tab === 'pend' ? ' active' : ''}`} onClick={() => setTab('pend')}>Pendentes</div>
        <div className={`tab${tab === 'hist' ? ' active' : ''}`} onClick={() => setTab('hist')}>Histórico</div>
      </div>

      {tab === 'pend' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Retirado</th><th>Devolvido</th><th>Pendente</th><th>Professor(a)</th><th>Sala</th><th>Data saída</th><th>Dev. prevista</th><th>Situação</th><th>Ação</th></tr></thead>
            <tbody>
              {pendentes.map(s => {
                const pend = s.quantidade - s.devolvido
                const venc = s.data_devolucao_prevista && s.data_devolucao_prevista < hj
                return (
                  <tr key={s.id}>
                    <td>{s.itens?.nome}</td>
                    <td>{s.quantidade}</td>
                    <td>{s.devolvido}</td>
                    <td><strong style={{ color: '#dc2626' }}>{pend}</strong></td>
                    <td>{s.professor}</td>
                    <td>{s.sala}</td>
                    <td>{fmtData(s.data_saida)}</td>
                    <td style={{ color: venc ? '#dc2626' : '#d97706' }}>{fmtData(s.data_devolucao_prevista)}</td>
                    <td>{venc ? <span className="badge badge-danger">Vencido</span> : <span className="badge badge-warning">Pendente</span>}</td>
                    <td><button className="btn btn-success btn-sm" onClick={() => abrirModal(s)}>Devolver</button></td>
                  </tr>
                )
              })}
              {!pendentes.length && <tr><td colSpan={10} className="empty">Nenhuma devolução pendente</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'hist' && (
        <div className="card">
          <table>
            <thead><tr><th>Item</th><th>Qtd devolvida</th><th>Professor(a)</th><th>Data devolução</th><th>Com avaria?</th><th>Observações / Avaria</th></tr></thead>
            <tbody>
              {historico.map(d => (
                <tr key={d.id}>
                  <td>{d.saidas?.itens?.nome}</td>
                  <td>{d.quantidade}</td>
                  <td>{d.saidas?.professor}</td>
                  <td>{fmtData(d.data_devolucao)}</td>
                  <td>
                    {d.avaria
                      ? <span className="avaria-tag">Sim — {d.avaria_quantidade} item(ns)</span>
                      : <span className="badge badge-success">Não</span>}
                  </td>
                  <td style={{ fontSize: 12, color: d.avaria ? '#dc2626' : '#888' }}>
                    {d.avaria ? d.avaria_descricao : (d.observacoes || '-')}
                  </td>
                </tr>
              ))}
              {!historico.length && <tr><td colSpan={6} className="empty">Nenhuma devolução registrada</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal devolução */}
      <div className={`modal-overlay${modalSaida ? ' open' : ''}`}>
        <div className="modal">
          <h3>Registrar devolução</h3>
          <div className="form-row">
            <label>Item</label>
            <input readOnly value={`${modalSaida?.itens?.nome || ''} (pendente: ${modalSaida ? modalSaida.quantidade - modalSaida.devolvido : ''})`} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>Quantidade devolvida</label>
              <input type="number" min="1" value={form.qtd} onChange={e => setForm({ ...form, qtd: e.target.value })} />
            </div>
            <div className="form-row">
              <label>Data da devolução</label>
              <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label" style={{ color: '#dc2626' }}>
              <input type="checkbox" checked={form.avaria} onChange={e => setForm({ ...form, avaria: e.target.checked, avariaDesc: '', avariaQtd: '' })} style={{ accentColor: '#dc2626' }} />
              <strong>Item devolvido com avaria</strong>
            </label>
          </div>
          {form.avaria && (
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div className="form-row">
                <label style={{ color: '#dc2626' }}>Descrição da avaria</label>
                <textarea rows={3} value={form.avariaDesc} onChange={e => setForm({ ...form, avariaDesc: e.target.value })} placeholder="Descreva o dano ou avaria identificada..." />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label style={{ color: '#dc2626' }}>Quantidade com avaria</label>
                <input type="number" min="1" value={form.avariaQtd} onChange={e => setForm({ ...form, avariaQtd: e.target.value })} placeholder="Quantos itens estão avariados?" />
              </div>
            </div>
          )}
          <div className="form-row">
            <label>Observações gerais</label>
            <textarea rows={2} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} placeholder="Observações sobre a devolução (opcional)..." />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={() => setModalSaida(null)}>Cancelar</button>
            <button className="btn btn-success" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar devolução'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
