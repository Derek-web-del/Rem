/**
 * Fix or create a Better Auth user so they can open /teacher/dashboard on localhost:5173.
 *
 * Faculty portal sign-in uses **username** (Faculty Code ID), not email — the script prints
 * the username to use after it runs.
 *
 *   npm run ensure:teacher
 *   npm run ensure:teacher -- other@email.com
 *
 * Requires DATABASE_URL (PostgreSQL).
 *
 * Optional env:
 *   TEACHER_PASSWORD=Your#Strong1Pass   (required — no default password in repo)
 *   TEACHER_NAME="Adolfo Bukele"        (default: derived from email)
 *   TEACHER_USERNAME=faderek            (optional: force Better Auth username / Faculty Code ID)
 *   TEACHER_ENABLE_2FA=1                (default: 1 — email OTP on sign-in, same as institute-created faculty)
 *                                       Set to 0 / false / no to disable 2FA for this account.
 */
import 'dotenv/config'
import { enrollSinglePortalEmailOtpMfa } from '../server/lib/enrollEmailOtpMfa.js'
import { hashPasswordBcrypt } from '../server/password.js'
import { getPgPool } from '../server/pgPool.js'

process.env.AUTH_DISABLE_SIGNUP = 'false'
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) {
  process.env.BETTER_AUTH_SECRET =
    'dev-secret-replace-in-production-use-openssl-rand-base64-32!!'
}

function usernameFromEmail(email) {
  const local = String(email).split('@')[0] || 'teacher'
  const safe = local.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase()
  return (safe || 'teacher').slice(0, 64)
}

function displayNameFromEmail(email) {
  const local = String(email).split('@')[0] || 'Teacher'
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

async function resetPasswordAndUnlock(pool, username, plainPassword) {
  const r1 = await pool.query('SELECT id FROM "user" WHERE username = $1', [username])
  const id = r1.rows[0]?.id
  if (!id) {
    console.warn(`[ensure:teacher] No user row for username "${username}" — skip password reset`)
    return
  }
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
  console.log(`[ensure:teacher] Password reset + lockout cleared for username "${username}"`)
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
  const emailArg = process.argv[2]
  const email = String(
    emailArg && !emailArg.startsWith('-') ? emailArg : process.env.TEACHER_EMAIL || 'adolfo.jbukele@gmail.com',
  )
    .trim()
    .toLowerCase()
  const password = String(process.env.TEACHER_PASSWORD || '').trim()
  if (!password) {
    throw new Error(
      '[ensure:teacher] Set TEACHER_PASSWORD in the environment (8+ chars with upper, lower, digit, and symbol).',
    )
  }
  const name =
    String(process.env.TEACHER_NAME || '').trim() || displayNameFromEmail(email)
  const desiredUsername = usernameFromEmail(email)
  const forceUsername = String(process.env.TEACHER_USERNAME || '').trim().toLowerCase()
  const enable2faRaw = String(process.env.TEACHER_ENABLE_2FA ?? '1')
    .trim()
    .toLowerCase()
  const twoFactorEnabled = ['0', 'false', 'no', 'off'].includes(enable2faRaw) ? false : true

  const pool = getPgPool()
  if (!pool) {
    throw new Error('[ensure:teacher] DATABASE_URL is not set.')
  }

  console.log(`[ensure:teacher] DATABASE_URL database (PostgreSQL)`)
  console.log(`[ensure:teacher] Email: ${email}`)

  const { auth } = await import('../server/auth.js')

  let { rows: found } = await pool.query(
    'SELECT id, username, email, role FROM "user" WHERE LOWER(email) = LOWER($1)',
    [email],
  )
  let row = found[0]

  if (!row) {
    console.log(`[ensure:teacher] No user with this email — creating via sign-up (username "${desiredUsername}")…`)
    const created = await trySignUp(auth, {
      email,
      password,
      name,
      username: forceUsername || desiredUsername,
    })
    if (!created) {
      ;({ rows: found } = await pool.query(
        'SELECT id, username, email, role FROM "user" WHERE LOWER(email) = LOWER($1)',
        [email],
      ))
      row = found[0]
    }
    if (!row) {
      const { rows: byUser } = await pool.query(
        'SELECT id, username, email, role FROM "user" WHERE LOWER(username) = LOWER($1)',
        [forceUsername || desiredUsername],
      )
      row = byUser[0]
    }
    if (!row) {
      throw new Error(
        '[ensure:teacher] Could not create or find user. Check AUTH_DISABLE_SIGNUP, BETTER_AUTH_SECRET, DATABASE_URL, and password policy (upper, lower, digit, symbol, 8+ chars).',
      )
    }
  }

  const now = new Date().toISOString()
  await pool.query(
    'UPDATE "user" SET role = $1, "twoFactorEnabled" = $2, "emailVerified" = true, "updatedAt" = $3 WHERE id = $4',
    ['teacher', twoFactorEnabled, now, row.id],
  )

  if (forceUsername && forceUsername !== String(row.username || '').trim().toLowerCase()) {
    const { rows: taken } = await pool.query(
      'SELECT id FROM "user" WHERE LOWER(username) = LOWER($1) AND id != $2',
      [forceUsername, row.id],
    )
    if (taken[0]?.id) {
      throw new Error(`[ensure:teacher] Username "${forceUsername}" is already used by another account.`)
    }
    await pool.query(
      'UPDATE "user" SET username = $1, "displayUsername" = $2, "updatedAt" = $3 WHERE id = $4',
      [forceUsername, forceUsername, now, row.id],
    )
  }

  const { rows: urows } = await pool.query(
    'SELECT id, username, email, role, "twoFactorEnabled", "emailVerified" FROM "user" WHERE id = $1',
    [row.id],
  )
  const u = urows[0]

  await resetPasswordAndUnlock(pool, u.username, password)

  if (twoFactorEnabled) {
    await enrollSinglePortalEmailOtpMfa(pool, u.id)
  }

  console.log('')
  console.log(
    `[ensure:teacher] OK — role **teacher**, email verified, password reset, twoFactorEnabled=${u.twoFactorEnabled ? '1 (email OTP on sign-in)' : '0'}.`,
  )
  console.log('')
  console.log('Sign in at http://localhost:5173 :')
  console.log('  1. Choose **FACULTY**')
  console.log(`  2. Faculty Code ID (username): **${u.username}**`)
  console.log(`  3. Password: **${password}**`)
  console.log('')
  console.log('Then open http://localhost:5173/teacher/dashboard (or sign in redirects there).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
