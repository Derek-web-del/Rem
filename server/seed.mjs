/**
 * Seed institute admin into Better Auth PostgreSQL. Set AUTH_DISABLE_SIGNUP=false for this process.
 *
 *   npm run seed
 *
 * Faculty demo accounts are not created here. Use `npm run ensure:teacher` with your own email/password.
 *
 * Requires DATABASE_URL and migrated auth tables (`npx auth@latest migrate --yes --config server/auth.js`).
 */
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

async function main() {
  console.log('Seeding institute admin (Better Auth PostgreSQL)…')

  const { auth } = await import('./auth.js')
  const pool = getPgPool()
  if (!pool) {
    throw new Error('DATABASE_URL is not set; cannot connect to PostgreSQL.')
  }

  const { rows: adminExisting } = await pool.query('SELECT id FROM "user" WHERE username = $1', [ADMIN_USER])
  if (adminExisting[0]?.id) {
    const now = new Date().toISOString()
    await pool.query(
      'UPDATE "user" SET email = $1, name = $2, "emailVerified" = true, "updatedAt" = $3 WHERE username = $4',
      [ADMIN_EMAIL, 'Derek John Bantad', now, ADMIN_USER],
    )
    console.log(`Updated admin email → ${ADMIN_EMAIL} (username "${ADMIN_USER}")`)
  }

  await trySignUp(auth, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
    name: 'Derek John Bantad',
    username: ADMIN_USER,
  })

  const now = new Date().toISOString()
  await pool.query(
    'UPDATE "user" SET role = $1, "twoFactorEnabled" = true, "emailVerified" = true, "updatedAt" = $2 WHERE LOWER(email) = LOWER($3)',
    ['admin', now, ADMIN_EMAIL],
  )

  await resetPasswordAndUnlock(pool, ADMIN_USER, ADMIN_PASS)

  console.log('Done.')
  console.log(`Admin (email OTP 2FA): ${ADMIN_EMAIL} or username "${ADMIN_USER}" / (password from SEED_ADMIN_PASSWORD or default in script)`)
  console.log('To add a faculty account: npm run ensure:teacher -- your@email.com (set TEACHER_PASSWORD in env)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
