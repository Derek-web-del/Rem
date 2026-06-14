/**
 * Read-only MFA audit for portal accounts (admin, teacher, student, faculty).
 * Exit code 1 when any row lacks twoFactorEnabled or emailVerified (CI-friendly).
 *
 * Run: npm run verify:portal-mfa
 * Remediation: npm run ensure:portal-mfa
 */
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

const { rows } = await pool.query(`
  SELECT id, email, role, name, "twoFactorEnabled", "emailVerified"
  FROM "user"
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
    AND ("twoFactorEnabled" IS NOT TRUE OR "emailVerified" IS NOT TRUE)
  ORDER BY role, email
`)

if (rows.length === 0) {
  console.log('[verify:portal-mfa] All portal accounts have MFA enabled and email verified.')
  await pool.end()
  process.exit(0)
}

console.error(`[verify:portal-mfa] ${rows.length} portal account(s) missing MFA or email verification:`)
for (const r of rows) {
  console.error(
    `  ${r.role} ${r.email || '(no email)'} MFA=${r.twoFactorEnabled ? 'on' : 'off'} verified=${r.emailVerified ? 'yes' : 'no'}`,
  )
}
console.error('[verify:portal-mfa] Remediation: npm run ensure:portal-mfa')

await pool.end()
process.exit(1)
