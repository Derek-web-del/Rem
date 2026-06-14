export const TABLE_CELL_DISPLAY_MAX = 15
const TRUNCATED_SUFFIX = '.......'

export function truncateTableCellDisplay(value, max = TABLE_CELL_DISPLAY_MAX) {
  const text = value == null || String(value).trim() === '' ? '—' : String(value).trim()
  if (text === '—' || text.length <= max) return text
  return `${text.slice(0, max)}${TRUNCATED_SUFFIX}`
}

export function tableCellTitle(value) {
  const text = value == null || String(value).trim() === '' ? '' : String(value).trim()
  const display = truncateTableCellDisplay(text)
  return display !== text ? text : undefined
}

export function TruncatedTableCell({ value }) {
  const display = truncateTableCellDisplay(value)
  const title = tableCellTitle(value)
  return (
    <span className="inline-block max-w-full" title={title}>
      {display}
    </span>
  )
}
