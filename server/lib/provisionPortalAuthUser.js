/**
 * Create or link Better Auth users for institute roster records (students / faculty).
 * Mirrors the admin dashboard flow without changing server/auth.js configuration.
 */
import { findAuthUserIdByEmail, findAuthUserIdByUsername } from '../api/logs.js'
import { hashPasswordBcrypt } from '../password.js'
import { ensurePortalUserEmailOtpMfa } from './enrollEmailOtpMfa.js'

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
  const hash = await hashPasswordBcrypt(pw)
  const now = new Date().toISOString()
  await pool.query(
    `UPDATE account SET password = $1, "updatedAt" = $2 WHERE "userId" = $3 AND "providerId" = $4`,
    [hash, now, userId, 'credential'],
  )
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
