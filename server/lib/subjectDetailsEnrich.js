import { formatSemesterLabel, quarterLabelFromSemester } from './quarterDisplay.js'
import { normalizeGradeLevel } from './assignmentsDb.js'

export function enrichSubjectDetailsFields(row, extras = {}) {
  if (!row) return null
  const semester = row.semester != null ? String(row.semester).trim() : ''
  const facultyCode =
    String(row.faculty_code ?? row.employee_id ?? '').trim() ||
    String(extras.faculty_code ?? '').trim()
  return {
    ...row,
    faculty_code: facultyCode,
    section_name: String(extras.section_name ?? row.section_name ?? '').trim() || '—',
    semester_label: formatSemesterLabel(semester),
    quarter_label: quarterLabelFromSemester(semester),
  }
}

export async function resolveTeacherSubjectSectionName(pool, facultyRow, gradeLevel) {
  if (!pool || !facultyRow) return '—'
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  try {
    const { rows } = await pool.query(
      `
      SELECT sec.section_name
      FROM faculty_sections fs
      INNER JOIN sections sec ON sec.id = fs.section_id
      WHERE fs.faculty_id::text = $1
        AND lower(trim(replace(coalesce(sec.grade_level, ''), '  ', ' '))) = $2
      ORDER BY sec.section_name ASC
      LIMIT 1
      `,
      [String(facultyRow.id).trim(), gradeNorm],
    )
    return String(rows?.[0]?.section_name ?? '').trim() || '—'
  } catch {
    return '—'
  }
}

export async function resolveStudentSectionName(pool, sectionId) {
  if (!pool || sectionId == null) return '—'
  try {
    const { rows } = await pool.query(
      `SELECT section_name FROM sections WHERE id = $1 LIMIT 1`,
      [Number(sectionId)],
    )
    return String(rows?.[0]?.section_name ?? '').trim() || '—'
  } catch {
    return '—'
  }
}
