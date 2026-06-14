import fs from 'node:fs'
import path from 'node:path'
import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { fetchStudentRowForSession } from '../lib/studentSession.js'
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
])

/** API category → directory under public/uploads */
const CATEGORY_DIRS = {
  assignments: 'assignments',
  submissions: 'submissions',
  materials: 'materials',
  activities: 'activities',
  lessons: 'lessons',
  /** API segment `photos` → disk folder `public/uploads/faculties` (see facultyPhotoStorage.js). */
  photos: 'faculties',
  subjects: 'Subjects_images',
  announcements: 'announcements',
  curriculum: 'curriculum',
  syllabus: 'syllabus',
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

async function canAccessCategory(req, auth, _category) {
  const session = await getSession(req, auth)
  const user = sessionUser(session)
  if (!user?.id) {
    return { ok: false, status: 401 }
  }
  return { ok: true }
}

/**
 * @param {import('express').Express} express
 * @param {{ auth: object }} options
 */
export function createFileDownloadRouter(express, { auth }) {
  const router = express.Router()

  router.get('/:category/*', async (req, res) => {
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
        const gate = await canAccessCategory(req, auth, category)
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
  })

  return router
}
