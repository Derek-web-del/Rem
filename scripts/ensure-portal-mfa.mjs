/**
 * Enable email OTP (2FA) for all portal auth users (admin, teacher, student).
 * Run: npm run ensure:portal-mfa
 */
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

const { rows: before } = await pool.query(`
  SELECT role, COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "twoFactorEnabled" IS TRUE)::int AS mfa_on
  FROM "user"
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
  GROUP BY role
  ORDER BY role
`)

const { rowCount } = await pool.query(`
  UPDATE "user"
  SET "twoFactorEnabled" = true,
      "emailVerified" = true,
      "updatedAt" = NOW()
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
    AND ("twoFactorEnabled" IS NOT TRUE OR "emailVerified" IS NOT TRUE)
`)

const { rows: after } = await pool.query(`
  SELECT username, email, role, "twoFactorEnabled", "emailVerified"
  FROM "user"
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
  ORDER BY role, username
`)

console.log('[ensure:portal-mfa] Before:')
for (const r of before) {
  console.log(`  ${r.role}: ${r.mfa_on}/${r.total} with MFA on`)
}
console.log(`[ensure:portal-mfa] Updated ${rowCount ?? 0} user row(s)`)
console.log('[ensure:portal-mfa] Portal users:')
for (const r of after) {
  console.log(
    `  ${r.role} ${r.username || '(no username)'} ${r.email} MFA=${r.twoFactorEnabled ? 'on' : 'off'}`,
  )
}

await pool.end()
