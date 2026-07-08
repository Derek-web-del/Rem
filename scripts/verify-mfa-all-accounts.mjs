/**
 * Read-only MFA audit for portal accounts (admin, teacher, student, faculty).
 * Exit code 1 when any row lacks twoFactorEnabled, emailVerified, or a twoFactor record.
 *
 * Run: npm run verify:portal-mfa
 * Remediation: npm run ensure:portal-mfa
 */
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

const { rows: flagIssues } = await pool.query(`
  SELECT id, email, role, name, "twoFactorEnabled", "emailVerified"
  FROM "user"
  WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
    AND ("twoFactorEnabled" IS NOT TRUE OR "emailVerified" IS NOT TRUE)
  ORDER BY role, email
`)

const { rows: rowIssues } = await pool.query(`
  SELECT u.id, u.email, u.role, u.name
  FROM "user" u
  LEFT JOIN "twoFactor" tf ON tf."userId" = u.id
  WHERE LOWER(u.role) IN ('admin', 'teacher', 'student', 'faculty')
    AND tf.id IS NULL
  ORDER BY u.role, u.email
`)

const issues = [...flagIssues, ...rowIssues]
if (issues.length === 0) {
  console.log('[verify:portal-mfa] All portal accounts have MFA flags and twoFactor rows.')
  await pool.end()
  process.exit(0)
}

if (flagIssues.length) {
  console.error(
    `[verify:portal-mfa] ${flagIssues.length} portal account(s) missing MFA flags or email verification:`,
  )
  for (const r of flagIssues) {
    console.error(
      `  ${r.role} ${r.email || '(no email)'} MFA=${r.twoFactorEnabled ? 'on' : 'off'} verified=${r.emailVerified ? 'yes' : 'no'}`,
    )
  }
}

if (rowIssues.length) {
  console.error(
    `[verify:portal-mfa] ${rowIssues.length} portal account(s) missing "twoFactor" enrollment row (OTP verify will fail):`,
  )
  for (const r of rowIssues) {
    console.error(`  ${r.role} ${r.email || '(no email)'}`)
  }
}

console.error('[verify:portal-mfa] Remediation: npm run ensure:portal-mfa')

await pool.end()
process.exit(1)
