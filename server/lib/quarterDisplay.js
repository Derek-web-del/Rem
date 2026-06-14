const SEMESTER_LABELS = {
  1: '1st Semester',
  2: '2nd Semester',
  3: '3rd Semester',
}

export function formatSemesterLabel(value) {
  const v = String(value ?? '').trim()
  if (!v) return ''
  const n = Number(v)
  if (Number.isFinite(n) && SEMESTER_LABELS[n]) return SEMESTER_LABELS[n]
  return `${v} Semester`
}

/** Derive quarter display from subjects.semester (DB no longer has quarter column). */
export function quarterLabelFromSemester(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(n)) return '—'
  if (n === 1) return 'Quarters 1–2'
  if (n === 2) return 'Quarters 3–4'
  if (n === 3) return '3rd Trimester'
  return '—'
}
