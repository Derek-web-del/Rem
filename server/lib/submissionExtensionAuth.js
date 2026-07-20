import { facultyCanAccessStudent, facultyOwnsSubject } from './gradesDb.js'

const ENTITY_TABLES = {
  assignment: 'assignments',
  activity: 'activities',
  quiz: 'quizzes',
}

function parsePositiveId(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export async function fetchWorkItemSubjectId(pool, entityType, entityId) {
  const type = String(entityType || '').trim().toLowerCase()
  const table = ENTITY_TABLES[type]
  const entId = parsePositiveId(entityId)
  if (!table || !entId) return null

  const { rows } = await pool.query(`SELECT subject_id FROM public.${table} WHERE id = $1 LIMIT 1`, [entId])
  const subjectId = rows?.[0]?.subject_id
  return subjectId != null && Number.isFinite(Number(subjectId)) ? Number(subjectId) : null
}

/**
 * Verify a faculty member may grant late submission for a student on a work item.
 * @returns {Promise<{ ok: true, subjectId: number } | { ok: false, status: number, error: string, message: string }>}
 */
export async function assertFacultyCanGrantSubmissionExtension(
  pool,
  facultyRow,
  { entityType, entityId, studentId },
) {
  const sid = parsePositiveId(studentId)
  const entId = parsePositiveId(entityId)
  const type = String(entityType || '').trim().toLowerCase()

  if (!ENTITY_TABLES[type] || !entId || !sid) {
    return { ok: false, status: 400, error: 'BAD_REQUEST', message: 'Invalid entity or student id.' }
  }

  if (!facultyRow?.id) {
    return { ok: false, status: 404, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' }
  }

  const allowedStudent = await facultyCanAccessStudent(pool, facultyRow, sid)
  if (!allowedStudent) {
    return {
      ok: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'Student is not in your assigned sections.',
    }
  }

  const subjectId = await fetchWorkItemSubjectId(pool, type, entId)
  if (!subjectId) {
    return { ok: false, status: 404, error: 'NOT_FOUND', message: 'Work item not found.' }
  }

  const ownsSubject = await facultyOwnsSubject(pool, facultyRow.id, subjectId)
  if (!ownsSubject) {
    return {
      ok: false,
      status: 403,
      error: 'FORBIDDEN',
      message: 'You do not teach this subject.',
    }
  }

  return { ok: true, subjectId }
}
