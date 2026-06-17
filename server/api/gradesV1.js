import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { fetchStudentRowForSession } from '../lib/studentSession.js'
import {
  fetchFacultyRowForSession,
  requireFacultyOrTeacherSession,
} from '../lib/teacherGradesAuth.js'
import {
  facultyCanAccessSection,
  facultyCanAccessStudent,
  fetchSectionSubjectGradesMatrix,
  fetchStudentGradesBySubject,
  fetchStudentSubjectGradeDetail,
  safeGrade,
} from '../lib/gradesDb.js'
import { fetchStudentSubjects } from '../lib/studentPortalDb.js'

function sanitizeSectionMatrixSubject(row) {
  return {
    id: row.id,
    subject_code: String(row.subject_code ?? '').trim(),
    subject_name: String(row.subject_name ?? '').trim(),
  }
}

function sanitizeSectionMatrixStudent(row) {
  const subjectGrades = {}
  if (row?.subject_grades && typeof row.subject_grades === 'object') {
    for (const [key, cell] of Object.entries(row.subject_grades)) {
      const hasScored = Boolean(cell?.has_scored_items)
      subjectGrades[key] = {
        overall_avg: hasScored ? safeGrade(cell?.overall_avg) : null,
        has_scored_items: hasScored,
      }
    }
  }
  return {
    student_id: row.student_id,
    student_name: row.student_name,
    subject_grades: subjectGrades,
  }
}

async function getSessionUser(req, auth) {
  if (!auth?.api?.getSession) return null
  const session = await auth.api.getSession({ headers: req.headers })
  return (
    session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user ?? null
  )
}

async function requireStudentSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const u = await getSessionUser(req, auth)
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'student') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Grades API requires student role',
        requiredRole: 'student',
      })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Students only.' })
      return null
    }
    return { user: u }
  } catch (e) {
    sendSafeServerError(res, e, 'grades student session gate')
    return null
  }
}

async function tryGetAdminSession(req, auth) {
  if (!auth?.api?.getSession) return null
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const role = String(session?.user?.role || session?.data?.user?.role || '')
      .trim()
      .toLowerCase()
    if (!session?.user?.id || role !== 'admin') return null
    return session
  } catch {
    return null
  }
}

async function requireAdminOrFacultySession(req, res, auth) {
  const adminSession = await tryGetAdminSession(req, auth)
  if (adminSession) return { kind: 'admin', session: adminSession }

  const facultySession = await requireFacultyOrTeacherSession(req, res, auth)
  if (facultySession) {
    const user =
      facultySession.user ??
      facultySession?.data?.user ??
      facultySession?.session?.user ??
      facultySession?.data?.session?.user
    return { kind: 'faculty', session: facultySession, user }
  }
  return null
}

function parseStudentIdParam(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function parseSubjectIdParam(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function fetchStudentRowById(pool, studentId) {
  const { rows } = await pool.query(
    `
      SELECT id, first_name, middle_name, last_name, grade_level, section_id
      FROM students
      WHERE id = $1
      LIMIT 1
    `,
    [studentId],
  )
  return rows?.[0] ?? null
}

export function createGradesV1Router(express, auth) {
  const router = express.Router()

  router.get('/student/:studentId', async (req, res) => {
    try {
      const gate = await requireAdminOrFacultySession(req, res, auth)
      if (!gate) return

      const studentId = parseStudentIdParam(req.params.studentId)
      if (!studentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid student id.' })
        return
      }

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      let gradeOptions = {}
      if (gate.kind === 'faculty') {
        const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
        if (!facultyRow) {
          res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
          return
        }
        const allowed = await facultyCanAccessStudent(pool, facultyRow, studentId)
        if (!allowed) {
          res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Student is not in your assigned sections.' })
          return
        }
        gradeOptions = { facultyId: facultyRow.id }
      }

      const studentRow = await fetchStudentRowById(pool, studentId)
      if (!studentRow) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }

      const result = await fetchStudentGradesBySubject(pool, studentId, studentRow, gradeOptions)
      res.json({
        success: true,
        subjects: result.subjects || [],
        has_any_scores: Boolean(result.has_any_scores),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/grades/student/:studentId')
    }
  })

  router.get('/my/subject/:subjectId', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return

      const subjectId = parseSubjectIdParam(req.params.subjectId)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      const studentRow = await fetchStudentRowForSession(pool, gate.user)
      if (!studentRow?.id) {
        res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: 'Student profile not linked.' })
        return
      }

      const enrolled = await fetchStudentSubjects(pool, studentRow)
      const allowed = (enrolled || []).some((s) => Number(s.id) === subjectId)
      if (!allowed) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Subject is not in your enrollment.' })
        return
      }

      const detail = await fetchStudentSubjectGradeDetail(pool, studentRow.id, subjectId)
      if (!detail) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }

      res.json({ success: true, subject: detail })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/grades/my/subject/:subjectId')
    }
  })

  router.get('/my', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      const studentRow = await fetchStudentRowForSession(pool, gate.user)
      if (!studentRow?.id) {
        res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: 'Student profile not linked.' })
        return
      }

      const result = await fetchStudentGradesBySubject(pool, studentRow.id, studentRow)
      res.json({
        success: true,
        subjects: result.subjects || [],
        has_any_scores: Boolean(result.has_any_scores),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/grades/my')
    }
  })

  router.get('/section-overview', async (req, res) => {
    try {
      const gate = await requireAdminOrFacultySession(req, res, auth)
      if (!gate) return
      if (gate.kind === 'admin') {
        res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Section overview is available to faculty only.',
        })
        return
      }

      const sectionId = parseStudentIdParam(req.query.section_id ?? req.query.sectionId)
      if (!sectionId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'section_id is required.' })
        return
      }

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }

      const allowed = await facultyCanAccessSection(pool, facultyRow, sectionId)
      if (!allowed) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Section is not in your assignments.' })
        return
      }

      const matrix = await fetchSectionSubjectGradesMatrix(pool, sectionId, {
        facultyId: facultyRow.id,
      })
      res.json({
        success: true,
        grade_level: String(matrix?.grade_level ?? '').trim(),
        subjects: (matrix?.subjects || []).map(sanitizeSectionMatrixSubject),
        students: (matrix?.students || []).map(sanitizeSectionMatrixStudent),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/grades/section-overview')
    }
  })

  return router
}
