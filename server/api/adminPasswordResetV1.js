import { requireAdminSession } from './state/shared.js'
import { sendSafeServerError } from '../lib/safeApiError.js'

function maskEmail(email) {
  const trimmed = String(email || '').trim()
  if (!trimmed.includes('@')) return trimmed || ''
  const [local, domain] = trimmed.split('@')
  if (!local || !domain) return trimmed
  const visible = local.length <= 1 ? local : `${local[0]}***`
  return `${visible}@${domain}`
}

/**
 * @param {import('express').Express} express
 * @param {{ api: object }} auth
 */
export function createAdminPasswordResetV1Router(express, auth) {
  const router = express.Router()

  router.post('/send-password-reset', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const body = req.body && typeof req.body === 'object' ? req.body : {}
      let email = String(body.email || '').trim().toLowerCase()

      if (!email && body.authUserId) {
        const pool = (await import('../pgPool.js')).getPgPool()
        if (pool) {
          const { rows } = await pool.query(`SELECT email FROM "user" WHERE id = $1 LIMIT 1`, [
            String(body.authUserId).trim(),
          ])
          email = String(rows?.[0]?.email || '').trim().toLowerCase()
        }
      }

      if (!email) {
        res.status(400).json({
          ok: false,
          error: 'BAD_REQUEST',
          message: 'Provide email or authUserId.',
        })
        return
      }

      const adminId = String(adminSession.user?.id || '').trim()
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
        else headers.set(key, String(value))
      }
      headers.set('x-lenlearn-reset-source', 'admin')
      if (adminId) headers.set('x-lenlearn-reset-initiated-by', adminId)

      try {
        await auth.api.requestPasswordReset({
          body: { email, redirectTo: '/reset-password' },
          headers,
        })
      } catch {
        /* generic response — do not leak whether the account exists */
      }

      res.json({ ok: true, maskedEmail: maskEmail(email) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/admin/send-password-reset')
    }
  })

  return router
}
