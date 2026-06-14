import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { facultyDisplayName, fetchFacultyRowForSession } from '../lib/facultySession.js'
import {
  ensureFacultyTermsColumns,
  facultyTermsAccepted,
  markFacultyTermsAccepted,
} from '../lib/facultyTerms.js'
import {
  adminTermsAccepted,
  fetchAdminTermsRow,
  markAdminTermsAccepted,
} from '../lib/adminTerms.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'

async function getSessionUser(req, auth) {
  if (!auth?.api?.getSession) return null
  const session = await auth.api.getSession({ headers: req.headers })
  return (
    session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user ?? null
  )
}

async function requireFacultyUser(req, res, auth) {
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
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, { reason: 'Faculty terms API requires teacher/faculty role', requiredRole: 'faculty' })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied.' })
      return null
    }
    return u
  } catch (e) {
    sendSafeServerError(res, e, 'faculty terms session')
    return null
  }
}

async function requireAdminUser(req, res, auth) {
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
    if (role !== 'admin') {
      logUnauthorizedAccessFromRequest(req, { reason: 'Admin terms API requires admin role', requiredRole: 'admin' })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied.' })
      return null
    }
    return u
  } catch (e) {
    sendSafeServerError(res, e, 'admin terms session')
    return null
  }
}

export function createTermsV1Router(express, auth) {
  const router = express.Router()

  router.get('/v1/faculty/terms-status', async (req, res) => {
    try {
      const user = await requireFacultyUser(req, res, auth)
      if (!user) return
      const pool = getPgPool()
      await ensureFacultyTermsColumns(pool)
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const acceptedAt =
        facultyRow.terms_accepted_at instanceof Date
          ? facultyRow.terms_accepted_at.toISOString()
          : facultyRow.terms_accepted_at ?? null
      res.json({
        success: true,
        accepted: facultyTermsAccepted(facultyRow),
        accepted_at: acceptedAt,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/faculty/terms-status')
    }
  })

  router.post('/v1/faculty/accept-terms', async (req, res) => {
    try {
      const user = await requireFacultyUser(req, res, auth)
      if (!user) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const alreadyAccepted = facultyTermsAccepted(facultyRow)
      const updated = await markFacultyTermsAccepted(pool, facultyRow.id)
      const acceptedAt =
        updated?.terms_accepted_at instanceof Date
          ? updated.terms_accepted_at.toISOString()
          : updated?.terms_accepted_at ?? null
      if (!alreadyAccepted) {
        try {
          await customActivityLogger.logTermsAccepted(
            String(user.id),
            {
              portal: 'faculty',
              acceptedAt,
              userName: facultyDisplayName(facultyRow),
              userEmail: String(user?.email || '').trim().toLowerCase(),
            },
            { userRole: 'faculty' },
          )
        } catch {
          /* ignore */
        }
      }
      res.json({ success: true, accepted_at: acceptedAt })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/faculty/accept-terms')
    }
  })

  router.get('/v1/admin/terms-status', async (req, res) => {
    try {
      const user = await requireAdminUser(req, res, auth)
      if (!user) return
      const pool = getPgPool()
      const row = await fetchAdminTermsRow(pool, user.id)
      const acceptedAt =
        row?.terms_accepted_at instanceof Date
          ? row.terms_accepted_at.toISOString()
          : row?.terms_accepted_at ?? null
      res.json({
        success: true,
        accepted: adminTermsAccepted(row || user),
        accepted_at: acceptedAt,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/terms-status')
    }
  })

  router.post('/v1/admin/accept-terms', async (req, res) => {
    try {
      const user = await requireAdminUser(req, res, auth)
      if (!user) return
      const pool = getPgPool()
      const priorRow = await fetchAdminTermsRow(pool, user.id)
      const alreadyAccepted = adminTermsAccepted(priorRow || user)
      const updated = await markAdminTermsAccepted(pool, user.id)
      const acceptedAt =
        updated?.terms_accepted_at instanceof Date
          ? updated.terms_accepted_at.toISOString()
          : updated?.terms_accepted_at ?? null
      if (!alreadyAccepted) {
        try {
          await customActivityLogger.logTermsAccepted(
            String(user.id),
            {
              portal: 'admin',
              acceptedAt,
              userName: String(user?.name || '').trim(),
              userEmail: String(user?.email || '').trim().toLowerCase(),
            },
            { userRole: 'admin' },
          )
        } catch {
          /* ignore */
        }
      }
      res.json({ success: true, accepted_at: acceptedAt })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/admin/accept-terms')
    }
  })

  return router
}
