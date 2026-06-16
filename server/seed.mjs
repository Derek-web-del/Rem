/**
 * Seed institute admin into Better Auth PostgreSQL. Set AUTH_DISABLE_SIGNUP=false for this process.
 *
 *   npm run seed
 *
 * Faculty demo accounts are not created here. Use `npm run ensure:teacher` with your own email/password.
 *
 * Uses direct DB inserts (not auth.api.signUp) so deploy-time seed is not blocked by Sentinel rate limits.
 */
import { randomUUID } from 'node:crypto'
import './env-bootstrap.js'
import { INSTITUTE_ADMIN_EMAIL } from '../shared/constants.js'
import { hashPasswordBcrypt } from './password.js'
import { getPgPool } from './pgPool.js'

process.env.AUTH_DISABLE_SIGNUP = 'false'
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  process.env.BETTER_AUTH_SECRET =
    'dev-secret-replace-in-production-use-openssl-rand-base64-32!!'
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || INSTITUTE_ADMIN_EMAIL
const ADMIN_USER = process.env.SEED_ADMIN_USERNAME || 'admin'
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'Admin123@'
const ADMIN_NAME = String(process.env.SEED_ADMIN_NAME || 'Derek John Bantad').trim()

async function resetPasswordAndUnlock(pool, username, plainPassword) {
  const r1 = await pool.query('SELECT id FROM "user" WHERE username = $1', [username])
  const id = r1.rows[0]?.id
  if (!id) return
  const hash = await hashPasswordBcrypt(plainPassword)
  const now = new Date().toISOString()
  await pool.query(
    'UPDATE account SET password = $1, "updatedAt" = $2 WHERE "userId" = $3 AND "providerId" = $4',
    [hash, now, id, 'credential'],
  )
  await pool.query(
    'UPDATE "user" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = $1 WHERE id = $2',
    [now, id],
  )
  console.log(`Reset password + cleared lockout for "${username}"`)
}

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

async function ensureAdminUserDirect(pool) {
  const now = new Date().toISOString()
  const { rows } = await pool.query(
    `SELECT id, username FROM "user" WHERE username = $1 OR LOWER(email) = LOWER($2) LIMIT 1`,
    [ADMIN_USER, ADMIN_EMAIL],
  )
  let userId = rows[0]?.id

  if (!userId) {
    userId = randomUUID()
    await pool.query(
      `
        INSERT INTO "user" (
          id, name, email, "emailVerified", role, username, "displayUsername",
          "twoFactorEnabled", "failedLoginAttempts", "lockedUntil", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, true, 'admin', $4, $4, true, 0, NULL, $5, $5)
      `,
      [userId, ADMIN_NAME, ADMIN_EMAIL, ADMIN_USER, now],
    )
    console.log(`Created admin user "${ADMIN_USER}" (${ADMIN_EMAIL})`)
  } else {
    await pool.query(
      `
        UPDATE "user"
        SET name = $1, email = $2, role = 'admin', "emailVerified" = true,
            "twoFactorEnabled" = true, username = $3, "displayUsername" = $3, "updatedAt" = $4
        WHERE id = $5
      `,
      [ADMIN_NAME, ADMIN_EMAIL, ADMIN_USER, now, userId],
    )
    console.log(`Updated admin user "${ADMIN_USER}" (${ADMIN_EMAIL})`)
  }

  await ensureCredentialAccount(pool, userId, ADMIN_EMAIL, ADMIN_PASS)
  await resetPasswordAndUnlock(pool, ADMIN_USER, ADMIN_PASS)
}

async function main() {
  console.log('Seeding institute admin (Better Auth PostgreSQL)…')

  const pool = getPgPool()
  if (!pool) {
    throw new Error('DATABASE_URL is not set; cannot connect to PostgreSQL.')
  }

  await ensureAdminUserDirect(pool)

  console.log('Done.')
  console.log(
    `Admin (email OTP 2FA): ${ADMIN_EMAIL} or username "${ADMIN_USER}" / (password from SEED_ADMIN_PASSWORD or default in script)`,
  )
  console.log(
    'To add a faculty account: npm run ensure:teacher -- your@email.com (set TEACHER_PASSWORD in env)',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
