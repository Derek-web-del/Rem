/**
 * Enable email OTP (2FA) for all portal auth users (admin, teacher, student).
 *
 * Sets user flags AND creates missing `"twoFactor"` rows (required for verify-otp).
 *
 * Run: npm run ensure:portal-mfa
 */
import pg from 'pg'
import { enrollPortalEmailOtpMfa } from '../server/lib/enrollEmailOtpMfa.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

if (!process.env.DATABASE_URL) {
  console.error('[ensure:portal-mfa] DATABASE_URL missing — use --env-file=.env')
  process.exit(1)
}

const { rows: before } = await pool.query(`
  SELECT role, COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "twoFactorEnabled" IS TRUE)::int AS mfa_on
  FROM "user"
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
  GROUP BY role
  ORDER BY role
`)

const { rows: missingRowsBefore } = await pool.query(`
  SELECT COUNT(*)::int AS missing
  FROM "user" u
  LEFT JOIN "twoFactor" tf ON tf."userId" = u.id
  WHERE LOWER(u.role) IN ('admin', 'teacher', 'student', 'faculty')
    AND tf.id IS NULL
`)

const result = await enrollPortalEmailOtpMfa(pool)

const { rows: after } = await pool.query(`
  SELECT u.username, u.email, u.role, u."twoFactorEnabled", u."emailVerified",
         (tf.id IS NOT NULL) AS has_two_factor_row
  FROM "user" u
  LEFT JOIN "twoFactor" tf ON tf."userId" = u.id
  WHERE LOWER(u.role) IN ('admin', 'teacher', 'student', 'faculty')
  ORDER BY u.role, u.username NULLS LAST, u.email
`)

console.log('[ensure:portal-mfa] Before (user flags):')
for (const r of before) {
  console.log(`  ${r.role}: ${r.mfa_on}/${r.total} with twoFactorEnabled`)
}
console.log(
  `[ensure:portal-mfa] Before: ${missingRowsBefore[0]?.missing ?? 0} portal user(s) missing "twoFactor" row`,
)
console.log(
  `[ensure:portal-mfa] Updated ${result.flagsUpdated} user flag(s), created ${result.rowsCreated} twoFactor row(s)`,
)
console.log('[ensure:portal-mfa] Portal users:')
for (const r of after) {
  console.log(
    `  ${r.role} ${r.username || '(no username)'} ${r.email} MFA=${r.twoFactorEnabled ? 'on' : 'off'} row=${r.has_two_factor_row ? 'yes' : 'NO'}`,
  )
}

await pool.end()
