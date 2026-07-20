import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendClientSafeError, sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, requireRegistrarSession, auditInstituteRecord } from './state/shared.js'
import {
  validatePasswordStrength,
  validatePortalUsername,
  validateProfileImageDataUrl,
} from '../lib/security.js'
import { findAuthUserIdByEmail, findAuthUserIdByUsername } from './logs.js'
import { createInstituteAuthUserDirect } from '../lib/provisionPortalAuthUser.js'

async function updateRegistrarUserImage(pool, userId, image) {
  const now = new Date().toISOString()
  await pool.query(`UPDATE "user" SET image = $1, "updatedAt" = $2 WHERE id = $3`, [
    image,
    now,
    userId,
  ])
}

async function assertRegistrarUser(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM "user" WHERE id = $1 AND lower(trim(role)) = 'registrar' LIMIT 1`,
    [userId],
  )
  return Boolean(rows[0]?.id)
}

export function createRegistrarsRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    router.get('/v1/admin/registrars', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available.' })
    })
    router.post('/v1/admin/registrars', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available.' })
    })
    router.patch('/v1/registrar/profile-photo', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available.' })
    })
    router.patch('/v1/admin/registrars/:id/photo', (_req, res) => {
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
        `SELECT id, name, email, username, "displayUsername", role, image, "createdAt"
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
          image: String(r.image || '').trim() || null,
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
      let profileImage = null
      try {
        username = validatePortalUsername(req.body?.username || req.body?.loginId, 'Login ID')
        validatePasswordStrength(password, 'Password')
        profileImage = validateProfileImageDataUrl(
          req.body?.profileImageDataUrl || req.body?.image,
          'Profile photo',
        )
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

      if (profileImage) {
        await updateRegistrarUserImage(pool, created.userId, profileImage)
      }

      await auditInstituteRecord(adminSession, 'REGISTRAR_ACCOUNT_CREATED', {
        recordType: 'user',
        recordId: created.userId,
        description: `Registrar account created: ${name} (${email})`,
        details: { email, username, role: 'registrar', hasProfilePhoto: Boolean(profileImage) },
      })

      res.status(201).json({
        ok: true,
        registrar: {
          id: created.userId,
          name,
          email,
          username,
          role: 'registrar',
          image: profileImage,
        },
      })
    } catch (e) {
      sendClientSafeError(res, e, 'POST /api/v1/admin/registrars')
    }
  })

  router.patch('/v1/registrar/profile-photo', async (req, res) => {
    try {
      const session = await requireRegistrarSession(req, res, auth)
      if (!session) return

      let image = null
      try {
        image = validateProfileImageDataUrl(
          req.body?.profileImageDataUrl || req.body?.image,
          'Profile photo',
        )
      } catch (e) {
        res.status(400).json({ error: e.code || 'BAD_REQUEST', message: e.message })
        return
      }
      if (!image) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Profile photo is required.' })
        return
      }

      const userId = String(session.user?.id || '').trim()
      const pool = getPgPool()
      await updateRegistrarUserImage(pool, userId, image)
      res.json({ ok: true, image })
    } catch (e) {
      sendClientSafeError(res, e, 'PATCH /api/v1/registrar/profile-photo')
    }
  })

  router.patch('/v1/admin/registrars/:id/photo', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const registrarId = String(req.params?.id || '').trim()
      if (!registrarId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Registrar id is required.' })
        return
      }

      let image = null
      try {
        image = validateProfileImageDataUrl(
          req.body?.profileImageDataUrl || req.body?.image,
          'Profile photo',
        )
      } catch (e) {
        res.status(400).json({ error: e.code || 'BAD_REQUEST', message: e.message })
        return
      }
      if (!image) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Profile photo is required.' })
        return
      }

      const pool = getPgPool()
      const isRegistrar = await assertRegistrarUser(pool, registrarId)
      if (!isRegistrar) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Registrar account not found.' })
        return
      }

      await updateRegistrarUserImage(pool, registrarId, image)
      await auditInstituteRecord(adminSession, 'REGISTRAR_PROFILE_PHOTO_UPDATED', {
        recordType: 'user',
        recordId: registrarId,
        description: 'Registrar profile photo updated by admin',
      })
      res.json({ ok: true, image })
    } catch (e) {
      sendClientSafeError(res, e, 'PATCH /api/v1/admin/registrars/:id/photo')
    }
  })

  return router
}
