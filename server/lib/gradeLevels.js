/** High School grade levels available in Assignments and Activities dropdowns. */
export const HIGH_SCHOOL_GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

const ALLOWED_NORMALIZED = new Set(HIGH_SCHOOL_GRADE_LEVELS.map((g) => g.toLowerCase()))

export function isAllowedHighSchoolGradeLevel(value) {
  return ALLOWED_NORMALIZED.has(String(value ?? '').trim().toLowerCase())
}

export function filterGradeLevelsForDropdown(grades) {
  const out = new Set(HIGH_SCHOOL_GRADE_LEVELS)
  for (const g of grades || []) {
    const s = String(g ?? '').trim()
    if (s && isAllowedHighSchoolGradeLevel(s)) out.add(s)
  }
  const sortGrades = (a, b) => {
    const na = Number.parseInt(String(a).replace(/\D/g, ''), 10)
    const nb = Number.parseInt(String(b).replace(/\D/g, ''), 10)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return String(a).localeCompare(String(b))
  }
  return [...out].sort(sortGrades)
}
