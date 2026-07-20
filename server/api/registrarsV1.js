import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { validatePasswordStrength } from '../lib/security.js'
import { findAuthUserIdByEmail } from './logs.js'
import { ensurePortalUserEmailOtpMfa } from '../lib/enrollEmailOtpMfa.js'

export function createRegistrarsRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    router.get('/v1/admin/registrars', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available.' })
    })
    router.post('/v1/admin/registrars', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available.' })
    })
    return router
  }

  router.get('/v1/admin/registrars', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const pool = getPgPool()
      const { rows } = await pool.query(
        `SELECT id, name, email, username, "displayUsername", role, "createdAt"
         FROM "user"
         WHERE lower(trim(role)) = 'registrar'
         ORDER BY "createdAt" DESC NULLS LAST`,
      )
      res.json({
        ok: true,
        registrars: (rows || []).map((r) => ({
          id: String(r.id),
          name: String(r.name || '').trim(),
          email: String(r.email || '').trim(),
          username: String(r.username || r.displayUsername || '').trim(),
          role: 'registrar',
          created_at: r.createdAt ?? null,
        })),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/registrars')
    }
  })

  router.post('/v1/admin/registrars', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const name = String(req.body?.name || '').trim()
      const email = String(req.body?.email || '').trim().toLowerCase()
      const username = String(req.body?.username || req.body?.loginId || email || '').trim().toLowerCase()
      const password = String(req.body?.password || '').trim()

      if (!name || !email || !username) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Name, email, and username are required.' })
        return
      }
      try {
        validatePasswordStrength(password, 'Password')
      } catch (e) {
        res.status(400).json({ error: e.code || 'WEAK_PASSWORD', message: e.message })
        return
      }

      const pool = getPgPool()
      const existingId = await findAuthUserIdByEmail(email)
      if (existingId) {
        res.status(409).json({ error: 'USER_EXISTS', message: 'A user with this email already exists.' })
        return
      }

      if (!auth?.api?.signUpEmail) {
        res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
        return
      }

      try {
        await auth.api.signUpEmail({
          body: { email, password, name, username },
        })
      } catch (e) {
        const msg = String(e?.message || e)
        if (!/already|exists/i.test(msg)) throw e
        res.status(409).json({ error: 'USER_EXISTS', message: 'A user with this email or username already exists.' })
        return
      }

      const userId = await findAuthUserIdByEmail(email)
      if (!userId) {
        res.status(500).json({ error: 'CREATE_FAILED', message: 'Could not create registrar account.' })
        return
      }

      const now = new Date().toISOString()
      await pool.query(
        `UPDATE "user"
         SET role = 'registrar',
             username = $1,
             "displayUsername" = $2,
             "twoFactorEnabled" = true,
             "emailVerified" = true,
             "updatedAt" = $3
         WHERE id = $4`,
        [username, username, now, userId],
      )
      await ensurePortalUserEmailOtpMfa(pool, userId, { role: 'registrar' })

      await auditInstituteRecord(adminSession, 'REGISTRAR_ACCOUNT_CREATED', {
        recordType: 'user',
        recordId: userId,
        description: `Registrar account created: ${name} (${email})`,
        details: { email, username, role: 'registrar' },
      })

      res.status(201).json({
        ok: true,
        registrar: { id: userId, name, email, username, role: 'registrar' },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/admin/registrars')
    }
  })

  return router
}
