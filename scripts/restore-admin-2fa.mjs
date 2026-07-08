/**
 * Restore admin email OTP enrollment (flags + twoFactor row).
 * Run: node --env-file=.env scripts/restore-admin-2fa.mjs
 */
import pg from 'pg'
import { ensurePortalUserEmailOtpMfa } from '../server/lib/enrollEmailOtpMfa.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
const { rows } = await pool.query(
  `SELECT id FROM "user" WHERE LOWER(username) = 'admin' LIMIT 1`,
)
const adminId = rows[0]?.id
if (!adminId) {
  console.error('[restore] admin user not found')
  await pool.end()
  process.exit(1)
}

const result = await ensurePortalUserEmailOtpMfa(pool, adminId, { role: 'admin' })
console.log('[restore] admin MFA enrolled:', result)
await pool.end()
