/**
 * Create or link Better Auth users for institute roster records (students / faculty).
 * Mirrors the admin dashboard flow without changing server/auth.js configuration.
 */
import { randomUUID } from 'node:crypto'
import { findAuthUserIdByEmail, findAuthUserIdByUsername } from '../api/logs.js'
import { hashPasswordBcrypt } from '../password.js'
import { ensurePortalUserEmailOtpMfa } from './enrollEmailOtpMfa.js'

async function ensureCredentialAccount(pool, userId, email, plainPassword) {
  const hash = await hashPasswordBcrypt(plainPassword)
  const now = new Date().toISOString()
  const { rows } = await pool.query(
    `SELECT id FROM account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  )
  if (rows[0]?.id) {
    await pool.query(
      `UPDATE account SET password = $1, "accountId" = $2, "updatedAt" = $3 WHERE id = $4`,
      [hash, email, now, rows[0].id],
    )
    return
  }
  await pool.query(
    `
      INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES ($1, $2, 'credential', $3, $4, $5, $5)
    `,
    [randomUUID(), email, userId, hash, now],
  )
}

/**
 * Admin-provisioned portal user via direct PostgreSQL inserts.
 * Works when AUTH_DISABLE_SIGNUP=true (public sign-up blocked).
 * @param {import('pg').Pool} pool
 * @param {{
 *   email: string,
 *   name: string,
 *   username: string,
 *   password: string,
 *   role: string,
 * }} opts
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, code: string, message: string }>}
 */
export async function createInstituteAuthUserDirect(pool, opts) {
  const email = String(opts.email || '').trim().toLowerCase()
  const name = String(opts.name || '').trim() || email
  const username = String(opts.username || '').trim().toLowerCase()
  const password = String(opts.password || '').trim()
  const role = String(opts.role || 'user').trim().toLowerCase()

  if (!email || !username || !password) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Email, username, and password are required.' }
  }

  const existingEmail = await findAuthUserIdByEmail(email)
  if (existingEmail) {
    return { ok: false, code: 'USER_EXISTS', message: 'A user with this email already exists.' }
  }
  const existingUsername = await findAuthUserIdByUsername(username)
  if (existingUsername) {
    return { ok: false, code: 'USER_EXISTS', message: 'A user with this login ID already exists.' }
  }

  const userId = randomUUID()
  const now = new Date().toISOString()
  await pool.query(
    `
      INSERT INTO "user" (
        id, name, email, "emailVerified", role, username, "displayUsername",
        "twoFactorEnabled", "failedLoginAttempts", "lockedUntil", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, true, $4, $5, $5, true, 0, NULL, $6, $6)
    `,
    [userId, name, email, role, username, now],
  )
  await ensureCredentialAccount(pool, userId, email, password)
  await ensurePortalUserEmailOtpMfa(pool, userId, { role })
  return { ok: true, userId }
}

async function trySignUp(auth, body) {
  try {
    await auth.api.signUpEmail({ body })
    return true
  } catch (e) {
    const msg = String(e?.message || e)
    if (msg.includes('already') || msg.includes('UNPROCESSABLE') || msg.includes('exists')) {
      return false
    }
    throw e
  }
}

async function setCredentialPassword(pool, userId, plainPassword) {
  const pw = String(plainPassword || '').trim()
  if (!pw || !userId) return
  const { rows } = await pool.query(`SELECT email FROM "user" WHERE id = $1 LIMIT 1`, [userId])
  const email = String(rows[0]?.email || '').trim().toLowerCase()
  await ensureCredentialAccount(pool, userId, email || userId, pw)
}

/**
 * @param {import('../auth.js').auth} auth
 * @param {import('pg').Pool} pool
 * @param {{
 *   email: string,
 *   name?: string,
 *   password?: string,
 *   username: string,
 *   role: 'student' | 'teacher',
 *   existingAuthUserId?: string,
 *   twoFactorEnabled?: boolean,
 * }} opts
 * @returns {Promise<string|null>}
 */
export async function provisionPortalAuthUser(auth, pool, opts) {
  if (!auth?.api?.signUpEmail || !pool) return null

  const email = String(opts.email || '').trim().toLowerCase()
  const name = String(opts.name || '').trim() || email
  const username = String(opts.username || '').trim().toLowerCase()
  const password = String(opts.password || '').trim()
  const role = opts.role === 'teacher' ? 'teacher' : 'student'
  const twoFactorEnabled = opts.twoFactorEnabled !== false

  let authUserId = String(opts.existingAuthUserId || '').trim()
  if (!authUserId) authUserId = (await findAuthUserIdByEmail(email)) || ''
  if (!authUserId && username) {
    authUserId = (await findAuthUserIdByUsername(username)) || ''
  }

  if (!authUserId) {
    if (!email) return null
    if (!password) return null
    const signupDisabled = process.env.AUTH_DISABLE_SIGNUP !== 'false'
    if (signupDisabled) {
      const created = await createInstituteAuthUserDirect(pool, {
        email,
        name,
        username: username || email,
        password,
        role,
      })
      if (!created.ok) return null
      authUserId = created.userId
    } else {
      await trySignUp(auth, {
        email,
        password,
        name,
        username: username || undefined,
      })
      authUserId =
        (await findAuthUserIdByEmail(email)) ||
        (username ? (await findAuthUserIdByUsername(username)) : '') ||
        ''
    }
  }

  if (!authUserId) return null

  const now = new Date().toISOString()
  await pool.query(
    `UPDATE "user"
     SET role = $1,
         name = $2,
         email = $3,
         "twoFactorEnabled" = $4,
         "emailVerified" = true,
         "updatedAt" = $5
     WHERE id = $6`,
    [role, name, email, twoFactorEnabled, now, authUserId],
  )

  if (username) {
    await pool.query(
      `UPDATE "user"
       SET username = $1, "displayUsername" = $2, "updatedAt" = $3
       WHERE id = $4`,
      [username, username, now, authUserId],
    )
  }

  if (password) {
    await setCredentialPassword(pool, authUserId, password)
  }

  if (twoFactorEnabled) {
    await ensurePortalUserEmailOtpMfa(pool, authUserId, { role })
  }

  return authUserId
}
