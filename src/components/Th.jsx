// Cabeçalho de tabela clicável para ordenação
export default function Th({ label, colKey, sortKey, sortDir, onSort, style }) {
  const ativo = sortKey === colKey
  const icone = !ativo ? ' ⇅' : sortDir === 'asc' ? ' ↑' : ' ↓'
  return (
    <th
      onClick={() => onSort(colKey)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: ativo ? '#1d4ed8' : undefined,
        ...style,
      }}
      title={`Ordenar por ${label}`}
    >
      {label}
      <span style={{ fontSize: 11, opacity: ativo ? 1 : 0.4, marginLeft: 2 }}>{icone}</span>
    </th>
  )
}
