export function fileNameFromLessonPath(path) {
  if (!path) return ''
  const parts = String(path).split('/')
  const name = parts[parts.length - 1] || ''
  return name.replace(/-[a-f0-9]{8}\./i, '.')
}

export function formatLessonPostDate(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
