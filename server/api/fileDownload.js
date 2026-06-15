import fs from 'node:fs'
import path from 'node:path'
import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { fetchStudentRowForSession, normalizeGradeLevel } from '../lib/studentSession.js'
import { fetchFacultyRowForSession } from '../lib/facultySession.js'

const ALLOWED_CATEGORIES = new Set([
  'assignments',
  'submissions',
  'materials',
  'activities',
  'lessons',
  'photos',
  'subjects',
  'announcements',
  'curriculum',
  'syllabus',
  'originality',
])

/** API category → directory under public/uploads */
const CATEGORY_DIRS = {
  assignments: 'assignments',
  submissions: 'submissions',
  materials: 'materials',
  activities: 'activities',
  lessons: 'lessons',
  photos: 'faculties',
  subjects: 'Subjects_images',
  announcements: 'announcements',
  curriculum: 'curriculum',
  syllabus: 'syllabus',
  originality: 'originality',
}

function uploadsRoot() {
  return path.resolve(process.cwd(), 'public', 'uploads')
}

function sessionUser(session) {
  return (
    session?.user ??
    session?.data?.user ??
    session?.session?.user ??
    session?.data?.session?.user ??
    null
  )
}

async function getSession(req, auth) {
  if (!auth?.api?.getSession) return null
  try {
    return await auth.api.getSession({ headers: req.headers })
  } catch {
    return null
  }
}

function normalizeRole(user) {
  return String(user?.role || '').trim().toLowerCase()
}

function isFacultyRole(role) {
  return role === 'teacher' || role === 'faculty'
}

function storedUploadPath(category, relativePath) {
  const dir = CATEGORY_DIRS[category]
  if (!dir) return ''
  return `/uploads/${dir}/${relativePath.replace(/\\/g, '/')}`.replace(/\/+/g, '/')
}

async function resolveStudentGradeFromSection(pool, studentRow) {
  const sectionId = Number(studentRow.section_id)
  if (!Number.isFinite(sectionId) || sectionId <= 0) return ''
  const { rows } = await pool.query(`SELECT grade_level FROM sections WHERE id = $1 LIMIT 1`, [sectionId])
  return rows?.[0]?.grade_level ?? ''
}

async function studentCanAccessGrade(pool, studentRow, gradeLevel) {
  if (!studentRow?.id) return false
  const direct = normalizeGradeLevel(studentRow.grade_level)
  const studentGrade = direct || normalizeGradeLevel(await resolveStudentGradeFromSection(pool, studentRow))
  return Boolean(studentGrade && studentGrade === normalizeGradeLevel(gradeLevel))
}

async function facultyOwnsSubject(pool, facultyId, subjectId) {
  if (!facultyId || !subjectId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM subjects WHERE id = $1 AND faculty_id::text = $2::text LIMIT 1`,
    [subjectId, String(facultyId)],
  )
  return Boolean(rows?.length)
}

async function canAccessSubmissionFile(req, auth, relativePath) {
  const session = await getSession(req, auth)
  const user = sessionUser(session)
  if (!user?.id) return { ok: false, status: 401 }

  const role = normalizeRole(user)
  if (role === 'admin' || isFacultyRole(role)) {
    return { ok: true }
  }

  if (role !== 'student') {
    logUnauthorizedAccessFromRequest(req, {
      reason: 'Submission file requires student, faculty, or admin',
      requiredRole: 'student|faculty|admin',
    })
    return { ok: false, status: 403 }
  }

  const pool = getPgPool()
  if (!pool) return { ok: false, status: 503 }

  const studentRow = await fetchStudentRowForSession(pool, user)
  if (!studentRow?.id) return { ok: false, status: 403 }

  const relPath = `/uploads/submissions/${relativePath.replace(/\\/g, '/')}`
  const studentId = Number(studentRow.id)

  const { rows: assignRows } = await pool.query(
    `SELECT 1 FROM assignment_submissions
     WHERE student_id = $1 AND file_path = $2 LIMIT 1`,
    [studentId, relPath],
  )
  if (assignRows?.length) return { ok: true }

  const { rows: activityRows } = await pool.query(
    `SELECT 1 FROM activity_submissions
     WHERE student_id = $1 AND file_path = $2 LIMIT 1`,
    [studentId, relPath],
  )
  if (activityRows?.length) return { ok: true }

  logUnauthorizedAccessFromRequest(req, {
    reason: 'Student attempted to access another student submission file',
    requiredRole: 'own_submission',
  })
  return { ok: false, status: 403 }
}

async function canAccessCategoryFile(req, auth, category, relativePath) {
  const session = await getSession(req, auth)
  const user = sessionUser(session)
  if (!user?.id) return { ok: false, status: 401 }

  const role = normalizeRole(user)
  const pool = getPgPool()
  if (!pool) return { ok: false, status: 503 }

  const filePath = storedUploadPath(category, relativePath)

  if (role === 'admin') return { ok: true }

  const facultyRow = isFacultyRole(role) ? await fetchFacultyRowForSession(pool, user) : null
  const studentRow = role === 'student' ? await fetchStudentRowForSession(pool, user) : null

  if (isFacultyRole(role) && !facultyRow?.id) {
    return { ok: false, status: 403 }
  }
  if (role === 'student' && !studentRow?.id) {
    return { ok: false, status: 403 }
  }

  switch (category) {
    case 'subjects':
      return { ok: true }

    case 'photos':
      if (isFacultyRole(role) || role === 'student' || role === 'admin') return { ok: true }
      return { ok: false, status: 403 }

    case 'announcements': {
      const { rows } = await pool.query(
        `SELECT 1 FROM announcements WHERE image_path = $1 OR announcement_image = $1 LIMIT 1`,
        [filePath],
      )
      return { ok: Boolean(rows?.length), status: rows?.length ? 200 : 403 }
    }

    case 'curriculum': {
      const { rows } = await pool.query(
        `SELECT grade_level FROM curriculum_guides WHERE file_url = $1 AND is_published = true LIMIT 1`,
        [filePath],
      )
      if (!rows?.length) return { ok: false, status: 403 }
      if (isFacultyRole(role)) return { ok: true }
      if (role === 'student') {
        const ok = await studentCanAccessGrade(pool, studentRow, rows[0].grade_level)
        return { ok, status: ok ? 200 : 403 }
      }
      return { ok: false, status: 403 }
    }

    case 'assignments': {
      const { rows } = await pool.query(
        `SELECT faculty_id, grade_level FROM assignments WHERE file_path = $1 LIMIT 1`,
        [filePath],
      )
      if (!rows?.length) return { ok: false, status: 403 }
      const row = rows[0]
      if (isFacultyRole(role) && String(row.faculty_id) === String(facultyRow.id)) return { ok: true }
      if (role === 'student') {
        const ok = await studentCanAccessGrade(pool, studentRow, row.grade_level)
        return { ok, status: ok ? 200 : 403 }
      }
      return { ok: false, status: 403 }
    }

    case 'activities': {
      const { rows } = await pool.query(
        `SELECT faculty_id, grade_level FROM activities WHERE file_path = $1 LIMIT 1`,
        [filePath],
      )
      if (!rows?.length) return { ok: false, status: 403 }
      const row = rows[0]
      if (isFacultyRole(role) && String(row.faculty_id) === String(facultyRow.id)) return { ok: true }
      if (role === 'student') {
        const ok = await studentCanAccessGrade(pool, studentRow, row.grade_level)
        return { ok, status: ok ? 200 : 403 }
      }
      return { ok: false, status: 403 }
    }

    case 'materials': {
      const { rows } = await pool.query(
        `SELECT subject_id, grade_level, uploaded_by
         FROM study_materials
         WHERE file_url = $1
           AND (archived_at IS NULL)
         LIMIT 1`,
        [filePath],
      )
      if (rows?.length) {
        const row = rows[0]
        if (isFacultyRole(role)) {
          if (row.subject_id) {
            const owns = await facultyOwnsSubject(pool, facultyRow.id, row.subject_id)
            if (owns) return { ok: true }
          }
          if (String(row.uploaded_by || '') === String(facultyRow.id || '')) {
            return { ok: true }
          }
        }
        if (role === 'student') {
          const ok = await studentCanAccessGrade(pool, studentRow, row.grade_level)
          return { ok, status: ok ? 200 : 403 }
        }
      }
      const { rows: smRows } = await pool.query(
        `SELECT sm.subject_id FROM subject_materials sm
         INNER JOIN subjects sub ON sub.id = sm.subject_id
         WHERE (sm.file_path = $1 OR sm.file_url = $1)
           AND (sm.archived_at IS NULL)
         LIMIT 1`,
        [filePath],
      )
      if (smRows?.length) {
        const subjectId = smRows[0].subject_id
        if (isFacultyRole(role)) {
          const owns = await facultyOwnsSubject(pool, facultyRow.id, subjectId)
          return { ok: owns, status: owns ? 200 : 403 }
        }
        if (role === 'student') {
          const { rows: subRows } = await pool.query(
            `SELECT grade_level FROM subjects WHERE id = $1 LIMIT 1`,
            [subjectId],
          )
          const ok = await studentCanAccessGrade(pool, studentRow, subRows?.[0]?.grade_level)
          return { ok, status: ok ? 200 : 403 }
        }
      }
      return { ok: false, status: 403 }
    }

    case 'lessons': {
      const { rows } = await pool.query(
        `SELECT m.subject_id, sub.grade_level, sub.faculty_id
         FROM subject_modules m
         INNER JOIN subjects sub ON sub.id = m.subject_id
         WHERE m.file_path = $1 OR m.lesson_file_path = $1 LIMIT 1`,
        [filePath],
      )
      if (!rows?.length) return { ok: false, status: 403 }
      const row = rows[0]
      if (isFacultyRole(role) && String(row.faculty_id) === String(facultyRow.id)) return { ok: true }
      if (role === 'student') {
        const ok = await studentCanAccessGrade(pool, studentRow, row.grade_level)
        return { ok, status: ok ? 200 : 403 }
      }
      return { ok: false, status: 403 }
    }

    case 'syllabus': {
      const { rows } = await pool.query(
        `SELECT faculty_id, grade_level FROM subjects WHERE syllabus_pdf = $1 LIMIT 1`,
        [filePath],
      )
      if (!rows?.length) return { ok: false, status: 403 }
      const row = rows[0]
      if (isFacultyRole(role) && String(row.faculty_id) === String(facultyRow.id)) return { ok: true }
      if (role === 'student') {
        const ok = await studentCanAccessGrade(pool, studentRow, row.grade_level)
        return { ok, status: ok ? 200 : 403 }
      }
      return { ok: false, status: 403 }
    }

    case 'originality':
      return { ok: isFacultyRole(role), status: isFacultyRole(role) ? 200 : 403 }

    default:
      return { ok: false, status: 403 }
  }
}

/** Rewrite legacy /uploads/... paths to /api/files/... category segments. */
export function rewriteLegacyUploadPath(urlPath) {
  let rest = String(urlPath || '').replace(/^\/uploads\/?/, '')
  if (rest.startsWith('faculties/')) rest = `photos/${rest.slice('faculties/'.length)}`
  else if (rest.startsWith('Subjects_images/')) rest = `subjects/${rest.slice('Subjects_images/'.length)}`
  return rest
}

/**
 * @param {import('express').Express} express
 * @param {{ auth: object }} options
 */
export function createFileDownloadRouter(express, { auth }) {
  const router = express.Router()

  async function serveFile(req, res) {
    try {
      const category = String(req.params.category || '').trim().toLowerCase()
      if (!ALLOWED_CATEGORIES.has(category)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Invalid file category.' })
        return
      }

      const splat = String(req.params[0] || '').trim()
      if (!splat || splat.includes('..')) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Invalid file path.' })
        return
      }

      const root = uploadsRoot()
      const dirSegment = CATEGORY_DIRS[category]
      const allowedRoot = path.resolve(root, dirSegment)
      const resolved = path.resolve(allowedRoot, ...splat.split('/').filter(Boolean))
      const rel = path.relative(allowedRoot, resolved)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Path traversal denied.' })
        return
      }

      if (category === 'submissions') {
        const gate = await canAccessSubmissionFile(req, auth, splat)
        if (!gate.ok) {
          res.status(gate.status).json({
            success: false,
            error: gate.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
            message: gate.status === 401 ? 'Sign-in required.' : 'Access denied.',
          })
          return
        }
      } else {
        const gate = await canAccessCategoryFile(req, auth, category, splat)
        if (!gate.ok) {
          res.status(gate.status).json({
            success: false,
            error: gate.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
            message: gate.status === 401 ? 'Sign-in required.' : 'Access denied.',
          })
          return
        }
      }

      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'File not found.' })
        return
      }

      res.sendFile(resolved)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/files')
    }
  }

  router.get('/:category/*', serveFile)
  return router
}

/** Legacy /uploads mount — authenticated only, same ACL as /api/files. */
export function createLegacyUploadsRouter(express, { auth }) {
  const fileRouter = createFileDownloadRouter(express, { auth })
  const router = express.Router()
  router.get('/*', (req, res, next) => {
    const rest = rewriteLegacyUploadPath(req.path)
    if (!rest) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'File not found.' })
      return
    }
    const slash = rest.indexOf('/')
    if (slash === -1) {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Invalid file path.' })
      return
    }
    req.params = { category: rest.slice(0, slash), 0: rest.slice(slash + 1) }
    return fileRouter.handle(req, res, next)
  })
  return router
}
