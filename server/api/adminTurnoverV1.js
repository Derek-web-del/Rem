import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import {
  normalizeInstituteAdminDisplayName,
  INSTITUTE_ADMIN_DISPLAY_NAME,
} from '../../shared/constants.js'
import { repairFacultyAuthLinks } from '../lib/repairFacultyAuthLinks.js'

async function requireAdmin(req, res, auth) {
  const session = await requireAdminSession(req, res, auth)
  if (!session) return null
  const user = session.user ?? session?.data?.user ?? {}
  return { session, user, userId: String(user.id || '').trim() }
}

function currentAdminDisplay(user) {
  const normalized = normalizeInstituteAdminDisplayName(user?.name, user?.email)
  if (normalized) return normalized
  const role = String(user?.role || '').trim().toLowerCase()
  if (role === 'admin') return INSTITUTE_ADMIN_DISPLAY_NAME
  return String(user?.email || '').trim() || INSTITUTE_ADMIN_DISPLAY_NAME
}

const CANDIDATE_SELECT = `
  SELECT
    u.id,
    COALESCE(NULLIF(trim(MAX(f.name)), ''), u.name) AS name,
    u.email,
    u.role
  FROM public.faculties f
  INNER JOIN "user" u ON u.id::text = f.auth_user_id
  WHERE f.archived_at IS NULL
    AND u.id::text <> $1
    AND lower(trim(coalesce(u.role, ''))) IN ('teacher', 'faculty')
    AND NOT EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.auth_user_id = u.id::text
        AND s.archived_at IS NULL
    )
  GROUP BY u.id, u.name, u.email, u.role
  ORDER BY lower(trim(coalesce(MAX(f.name), u.name, u.email, ''))) ASC
  LIMIT 200
`

const TARGET_SELECT = `
  SELECT u.id, u.name, u.email, u.role
  FROM public.faculties f
  INNER JOIN "user" u ON u.id::text = f.auth_user_id
  WHERE f.archived_at IS NULL
    AND u.id::text = $1
    AND lower(trim(coalesce(u.role, ''))) IN ('teacher', 'faculty')
    AND NOT EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.auth_user_id = u.id::text
        AND s.archived_at IS NULL
    )
  LIMIT 1
`

export function createAdminTurnoverRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    router.get('/v1/admin/turnover/candidates', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    router.post('/v1/admin/turnover/transfer', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    return router
  }

  router.get('/v1/admin/turnover/candidates', async (req, res) => {
    try {
      const ctx = await requireAdmin(req, res, auth)
      if (!ctx) return
      const pool = getPgPool()
      await repairFacultyAuthLinks(pool)
      const { rows } = await pool.query(CANDIDATE_SELECT, [ctx.userId])
      res.json({
        ok: true,
        current_admin: {
          id: ctx.userId,
          email: ctx.user.email,
          name: currentAdminDisplay(ctx.user),
        },
        candidates: (rows || []).map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          role: r.role,
        })),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/turnover/candidates')
    }
  })

  router.post('/v1/admin/turnover/transfer', async (req, res) => {
    try {
      const ctx = await requireAdmin(req, res, auth)
      if (!ctx) return
      const targetUserId = String(req.body?.targetUserId || req.body?.target_user_id || '').trim()
      const demoteSelf = req.body?.demoteSelf === true || req.body?.demote_self === true
      if (!targetUserId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'targetUserId is required.' })
        return
      }
      if (targetUserId === ctx.userId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Choose a different user to promote.' })
        return
      }

      const pool = getPgPool()
      await repairFacultyAuthLinks(pool)
      const { rows: targetRows } = await pool.query(TARGET_SELECT, [targetUserId])
      const target = targetRows?.[0]
      if (!target) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Faculty member not found.' })
        return
      }

      await pool.query('BEGIN')
      try {
        await pool.query(`UPDATE "user" SET role = 'admin' WHERE id::text = $1`, [targetUserId])
        if (demoteSelf) {
          await pool.query(`UPDATE "user" SET role = 'teacher' WHERE id::text = $1`, [ctx.userId])
        }
        await pool.query('COMMIT')
      } catch (e) {
        await pool.query('ROLLBACK')
        throw e
      }

      await auditInstituteRecord(ctx.session, 'ADMIN_PRIMARY_TRANSFER', {
        recordType: 'user',
        recordId: targetUserId,
        description: `Primary admin access granted to ${target.email || target.name || targetUserId}.`,
        details: {
          target_user_id: targetUserId,
          target_email: target.email,
          demote_self: demoteSelf,
          previous_admin_id: ctx.userId,
        },
      })

      res.json({
        ok: true,
        promoted: { id: target.id, email: target.email, name: target.name, role: 'admin' },
        demoted_self: demoteSelf,
        checklist: [
          'Ask the new admin to sign in and confirm they can open the Institute portal.',
          'Review backup and audit log access together if needed.',
        ],
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/admin/turnover/transfer')
    }
  })

  return router
}
