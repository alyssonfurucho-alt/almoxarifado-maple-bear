export function fmtData(d) {
  if (!d) return '-'
  const p = d.split('T')[0].split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

export function fmtR(v) {
  return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',')
}

export function diasDiff(d) {
  const hoje = new Date()
  hoje.setHours(0,0,0,0)
  const data = new Date(d + 'T00:00:00')
  return Math.round((hoje - data) / (1000 * 60 * 60 * 24))
}

export function hoje() {
  return new Date().toISOString().split('T')[0]
}

export function statusDevolucao(saida) {
  if (!saida.devolvivel) return { label: 'N/A', cls: 'badge-neutral' }
  const pend = saida.quantidade - saida.devolvido
  if (pend <= 0) return { label: 'Devolvido', cls: 'badge-success' }
  if (saida.data_devolucao_prevista && saida.data_devolucao_prevista < hoje())
    return { label: 'Vencido', cls: 'badge-danger' }
  return { label: `Pendente (${pend})`, cls: 'badge-warning' }
}
