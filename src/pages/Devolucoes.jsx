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
  const emptyForm = { qtd: '', data: hoje(), avaria: false, avariaDesc: '', avariaQtd: '', obs: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: saidas }, { data: devs }] = await Promise.all([
      supabase.from('saidas')
        .select('*, itens(id,nome,custo_unitario,unidade), professores(nome,registro), turmas(codigo,turno)')
        .eq('devolvivel', true),
      supabase.from('devolucoes')
        .select('*, saidas(professor_nome_snapshot, turma_codigo_snapshot, professores(nome), turmas(codigo), itens(nome))')
        .order('created_at', { ascending: false }),
    ])
    setPendentes((saidas || []).filter(s => s.devolvido < s.quantidade))
    setHistorico(devs || [])
    setLoading(false)
  }

  function abrirModal(saida) {
    setModalSaida(saida)
    const pendente = saida.quantidade - saida.devolvido
    setForm({ ...emptyForm, qtd: pendente })
  }

  async function salvar() {
    const qtd = parseInt(form.qtd)
    const pendente = modalSaida.quantidade - modalSaida.devolvido

    // Ponto 5: validação rigorosa — só permite <= pendente
    if (!qtd || qtd < 1) return alert('Informe a quantidade a devolver')
    if (qtd > pendente) return alert(`Não é possível devolver mais do que o pendente.\nPendente: ${pendente} ${modalSaida.itens?.unidade || ''}`)
    if (form.avaria && !form.avariaDesc.trim()) return alert('Descreva a avaria')
    if (form.avaria && (!form.avariaQtd || parseInt(form.avariaQtd) < 1 || parseInt(form.avariaQtd) > qtd))
      return alert(`Quantidade avariada inválida (entre 1 e ${qtd})`)

    setSaving(true)
    const { data: dev, error } = await supabase.from('devolucoes').insert({
      saida_id: modalSaida.id,
      quantidade: qtd,
      data_devolucao: form.data,
      avaria: form.avaria,
      avaria_descricao: form.avaria ? form.avariaDesc.trim() : null,
      avaria_quantidade: form.avaria ? parseInt(form.avariaQtd) : 0,
      observacoes: form.obs,
    }).select().single()

    if (!error) {
      await supabase.from('saidas')
        .update({ devolvido: modalSaida.devolvido + qtd })
        .eq('id', modalSaida.id)

      const { data: item } = await supabase.from('itens').select('quantidade').eq('id', modalSaida.item_id).single()
      await supabase.from('itens').update({ quantidade: item.quantidade + qtd }).eq('id', modalSaida.item_id)

      await supabase.from('movimentacoes').insert({
        item_id: modalSaida.item_id,
        item_nome: modalSaida.itens?.nome,
        tipo: 'devolucao',
        quantidade: qtd,
        professor_id: modalSaida.professor_id,
        professor_nome: modalSaida.professores?.nome || modalSaida.professor_nome_snapshot,
        turma_id: modalSaida.turma_id,
        turma_codigo: modalSaida.turmas?.codigo || modalSaida.turma_codigo_snapshot,
        referencia_id: dev?.id,
        observacoes: form.avaria ? `Avaria: ${form.avariaDesc}` : form.obs,
      })
      setModalSaida(null)
      load()
    } else {
      alert('Erro: ' + error.message)
    }
    setSaving(false)
  }

  const hj = hoje()
  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header"><div className="page-title">Devoluções</div></div>
      <div className="tabs">
        <div className={`tab${tab === 'pend' ? ' active' : ''}`} onClick={() => setTab('pend')}>
          Pendentes {pendentes.length > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 10, padding: '0 6px', fontSize: 11, marginLeft: 4 }}>{pendentes.length}</span>}
        </div>
        <div className={`tab${tab === 'hist' ? ' active' : ''}`} onClick={() => setTab('hist')}>Histórico</div>
      </div>

      {tab === 'pend' && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Item</th><th>Retirado</th><th>Devolvido</th><th>Pendente</th><th>Professor(a)</th><th>Registro</th><th>Turma</th><th>Turno</th><th>Data saída</th><th>Dev. prevista</th><th>Situação</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {pendentes.map(s => {
                const pend = s.quantidade - s.devolvido
                const venc = s.data_devolucao_prevista && s.data_devolucao_prevista < hj
                const nomeProfessor = s.professores?.nome || s.professor_nome_snapshot || '—'
                const registro = s.professores?.registro || '—'
                const codigoTurma = s.turmas?.codigo || s.turma_codigo_snapshot || '—'
                return (
                  <tr key={s.id} style={{ background: venc ? '#fff5f5' : undefined }}>
                    <td>{s.itens?.nome}</td>
                    <td>{s.quantidade}</td>
                    <td>{s.devolvido}</td>
                    <td><strong style={{ color: '#dc2626', fontWeight: 600 }}>{pend} {s.itens?.unidade}</strong></td>
                    <td>{nomeProfessor}</td>
                    <td><span className="badge badge-neutral" style={{ fontSize: 11 }}>{registro}</span></td>
                    <td><strong style={{ fontWeight: 500 }}>{codigoTurma}</strong></td>
                    <td>{s.turmas?.turno || '—'}</td>
                    <td>{fmtData(s.data_saida)}</td>
                    <td style={{ color: venc ? '#dc2626' : '#d97706' }}>{fmtData(s.data_devolucao_prevista)}</td>
                    <td>{venc ? <span className="badge badge-danger">Vencido</span> : <span className="badge badge-warning">Pendente</span>}</td>
                    <td><button className="btn btn-success btn-sm" onClick={() => abrirModal(s)}>Devolver</button></td>
                  </tr>
                )
              })}
              {!pendentes.length && <tr><td colSpan={12} className="empty">Nenhuma devolução pendente</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'hist' && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Item</th><th>Qtd devolvida</th><th>Professor(a)</th><th>Turma</th><th>Data devolução</th><th>Avaria?</th><th>Observações / Avaria</th></tr>
            </thead>
            <tbody>
              {historico.map(d => {
                const nomeProfessor = d.saidas?.professores?.nome || d.saidas?.professor_nome_snapshot || '—'
                const codigoTurma = d.saidas?.turmas?.codigo || d.saidas?.turma_codigo_snapshot || '—'
                return (
                  <tr key={d.id}>
                    <td>{d.saidas?.itens?.nome}</td>
                    <td>{d.quantidade}</td>
                    <td>{nomeProfessor}</td>
                    <td><strong style={{ fontWeight: 500 }}>{codigoTurma}</strong></td>
                    <td>{fmtData(d.data_devolucao)}</td>
                    <td>
                      {d.avaria
                        ? <span className="avaria-tag">Sim — {d.avaria_quantidade} item(ns)</span>
                        : <span className="badge badge-success">Não</span>}
                    </td>
                    <td style={{ fontSize: 12, color: d.avaria ? '#dc2626' : '#888' }}>
                      {d.avaria ? d.avaria_descricao : (d.observacoes || '—')}
                    </td>
                  </tr>
                )
              })}
              {!historico.length && <tr><td colSpan={7} className="empty">Nenhuma devolução registrada</td></tr>}
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
            <input readOnly value={`${modalSaida?.itens?.nome || ''}`} />
          </div>

          {/* Info de contexto */}
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#555', marginBottom: 12, flexWrap: 'wrap' }}>
            <span>Professor(a): <strong>{modalSaida?.professores?.nome || modalSaida?.professor_nome_snapshot || '—'}</strong></span>
            <span>·</span>
            <span>Turma: <strong>{modalSaida?.turmas?.codigo || modalSaida?.turma_codigo_snapshot || '—'}</strong></span>
          </div>

          {/* Indicador de quantidade */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, fontSize: 13 }}>
            <div style={{ background: '#f5f5f3', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Retirado</div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{modalSaida?.quantidade}</div>
            </div>
            <div style={{ background: '#f5f5f3', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Devolvido</div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{modalSaida?.devolvido}</div>
            </div>
            <div style={{ background: '#fee2e2', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888' }}>Pendente</div>
              <div style={{ fontWeight: 600, fontSize: 18, color: '#dc2626' }}>
                {modalSaida ? modalSaida.quantidade - modalSaida.devolvido : 0}
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label>
                Quantidade a devolver
                <span style={{ color: '#888', fontSize: 11, marginLeft: 6 }}>
                  (máx: {modalSaida ? modalSaida.quantidade - modalSaida.devolvido : 0})
                </span>
              </label>
              <input
                type="number" min="1"
                max={modalSaida ? modalSaida.quantidade - modalSaida.devolvido : 1}
                value={form.qtd}
                onChange={e => {
                  const max = modalSaida ? modalSaida.quantidade - modalSaida.devolvido : 1
                  const val = Math.min(parseInt(e.target.value) || 0, max)
                  setForm({ ...form, qtd: val })
                }}
              />
            </div>
            <div className="form-row">
              <label>Data da devolução</label>
              <input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>
              <input type="checkbox" checked={form.avaria}
                onChange={e => setForm({ ...form, avaria: e.target.checked, avariaDesc: '', avariaQtd: '' })}
                style={{ accentColor: '#dc2626' }} />
              <strong>Item devolvido com avaria</strong>
            </label>
          </div>

          {form.avaria && (
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div className="form-row">
                <label style={{ color: '#dc2626' }}>Descrição da avaria</label>
                <textarea rows={2} value={form.avariaDesc}
                  onChange={e => setForm({ ...form, avariaDesc: e.target.value })}
                  placeholder="Descreva o dano..." />
              </div>
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label style={{ color: '#dc2626' }}>Quantidade com avaria</label>
                <input type="number" min="1" value={form.avariaQtd}
                  onChange={e => setForm({ ...form, avariaQtd: e.target.value })} />
              </div>
            </div>
          )}

          <div className="form-row">
            <label>Observações gerais</label>
            <textarea rows={2} value={form.obs}
              onChange={e => setForm({ ...form, obs: e.target.value })}
              placeholder="Opcional..." />
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={() => setModalSaida(null)}>Cancelar</button>
            <button className="btn btn-success" onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar devolução'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
