import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtR } from '../lib/utils'

export default function Estoque() {
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [modalEntrada, setModalEntrada] = useState(null)
  const emptyForm = { nome:'', categoria:'Material escolar', custo_unitario:'', quantidade:'', unidade:'un' }
  const [form, setForm] = useState(emptyForm)
  const [entQtd, setEntQtd] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('itens').select('*').order('nome')
    setItens(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return alert('Informe o nome do item')
    setSaving(true)
    const qtd = parseInt(form.quantidade)||0
    const { data:item } = await supabase.from('itens').insert({
      nome: form.nome.trim(), categoria: form.categoria,
      custo_unitario: parseFloat(form.custo_unitario)||0,
      quantidade: qtd, unidade: form.unidade||'un',
    }).select().single()
    if (item && qtd > 0) {
      await supabase.from('movimentacoes').insert({
        item_id: item.id, item_nome: item.nome,
        tipo: 'entrada', quantidade: qtd,
        observacoes: 'Cadastro inicial',
      })
    }
    setModal(false); setForm(emptyForm); setSaving(false); load()
  }

  async function entrada() {
    const n = parseInt(entQtd)
    if (!n||n<1) return alert('Informe a quantidade')
    setSaving(true)
    await supabase.from('itens').update({ quantidade: modalEntrada.quantidade + n }).eq('id', modalEntrada.id)
    await supabase.from('movimentacoes').insert({
      item_id: modalEntrada.id, item_nome: modalEntrada.nome,
      tipo: 'entrada', quantidade: n,
      observacoes: 'Entrada manual',
    })
    setModalEntrada(null); setEntQtd(''); setSaving(false); load()
  }

  const f = v => e => setForm({...form,[v]:e.target.value})
  const lista = itens.filter(i=>i.nome.toLowerCase().includes(busca.toLowerCase()))

  if (loading) return <div className="loading">Carregando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Estoque</div>
        <button className="btn btn-primary" onClick={()=>{ setForm(emptyForm); setModal(true) }}>+ Novo item</button>
      </div>
      <div className="search-bar">
        <input placeholder="Buscar item..." value={busca} onChange={e=>setBusca(e.target.value)} />
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>Categoria</th><th>Estoque</th><th>Custo unit.</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>
            {lista.map(i=>(
              <tr key={i.id}>
                <td><strong style={{fontWeight:500}}>{i.nome}</strong></td>
                <td>{i.categoria}</td>
                <td>{i.quantidade} {i.unidade}</td>
                <td>{fmtR(i.custo_unitario)}</td>
                <td>
                  {i.quantidade===0?<span className="badge badge-danger">Sem estoque</span>
                  :i.quantidade<5?<span className="badge badge-warning">Baixo</span>
                  :<span className="badge badge-success">OK</span>}
                </td>
                <td><button className="btn btn-sm" onClick={()=>{ setModalEntrada(i); setEntQtd('') }}>+ Entrada</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="empty">Nenhum item encontrado</td></tr>}
          </tbody>
        </table>
      </div>

      <div className={`modal-overlay${modal?' open':''}`}>
        <div className="modal">
          <h3>Cadastrar item</h3>
          <div className="form-grid">
            <div className="form-row"><label>Nome do item</label><input value={form.nome} onChange={f('nome')} placeholder="Ex: Pincel atômico" /></div>
            <div className="form-row"><label>Categoria</label>
              <select value={form.categoria} onChange={f('categoria')}>
                <option>Material escolar</option><option>Limpeza</option><option>Escritório</option><option>Esportivo</option><option>Outro</option>
              </select>
            </div>
            <div className="form-row"><label>Custo unitário (R$)</label><input type="number" step="0.01" value={form.custo_unitario} onChange={f('custo_unitario')} placeholder="0,00" /></div>
            <div className="form-row"><label>Quantidade inicial</label><input type="number" value={form.quantidade} onChange={f('quantidade')} placeholder="0" /></div>
            <div className="form-row"><label>Unidade</label><input value={form.unidade} onChange={f('unidade')} placeholder="un, cx, pct..." /></div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':'Salvar'}</button>
          </div>
        </div>
      </div>

      <div className={`modal-overlay${modalEntrada?' open':''}`}>
        <div className="modal" style={{width:340}}>
          <h3>Entrada de estoque</h3>
          <p style={{fontSize:13,color:'#888',marginBottom:12}}>Item: <strong>{modalEntrada?.nome}</strong></p>
          <div className="form-row"><label>Quantidade a adicionar</label>
            <input type="number" min="1" value={entQtd} onChange={e=>setEntQtd(e.target.value)} placeholder="0" />
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={()=>setModalEntrada(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={entrada} disabled={saving}>{saving?'Salvando...':'Confirmar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
