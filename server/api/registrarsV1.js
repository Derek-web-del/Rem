import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendClientSafeError, sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { validatePasswordStrength, validatePortalUsername } from '../lib/security.js'
import { findAuthUserIdByEmail, findAuthUserIdByUsername } from './logs.js'
import { createInstituteAuthUserDirect } from '../lib/provisionPortalAuthUser.js'

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
      const password = String(req.body?.password || '').trim()

      if (!name || !email) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Name and email are required.' })
        return
      }
      let username = ''
      try {
        username = validatePortalUsername(req.body?.username || req.body?.loginId, 'Login ID')
        validatePasswordStrength(password, 'Password')
      } catch (e) {
        res.status(400).json({ error: e.code || 'BAD_REQUEST', message: e.message })
        return
      }

      const pool = getPgPool()
      const existingEmail = await findAuthUserIdByEmail(email)
      if (existingEmail) {
        res.status(409).json({ error: 'USER_EXISTS', message: 'A user with this email already exists.' })
        return
      }
      const existingUsername = await findAuthUserIdByUsername(username)
      if (existingUsername) {
        res.status(409).json({ error: 'USER_EXISTS', message: 'A user with this login ID already exists.' })
        return
      }

      const created = await createInstituteAuthUserDirect(pool, {
        email,
        name,
        username,
        password,
        role: 'registrar',
      })
      if (!created.ok) {
        const status = created.code === 'USER_EXISTS' ? 409 : 400
        res.status(status).json({ error: created.code, message: created.message })
        return
      }

      await auditInstituteRecord(adminSession, 'REGISTRAR_ACCOUNT_CREATED', {
        recordType: 'user',
        recordId: created.userId,
        description: `Registrar account created: ${name} (${email})`,
        details: { email, username, role: 'registrar' },
      })

      res.status(201).json({
        ok: true,
        registrar: { id: created.userId, name, email, username, role: 'registrar' },
      })
    } catch (e) {
      sendClientSafeError(res, e, 'POST /api/v1/admin/registrars')
    }
  })

  return router
}
