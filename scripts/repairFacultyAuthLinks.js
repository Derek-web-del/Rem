/**
 * Link faculties.auth_user_id to Better Auth "user" rows by matching email.
 *
 *   node scripts/repairFacultyAuthLinks.js
 *
 * Requires DATABASE_URL in the environment.
 */
import '../server/env-bootstrap.js'
import { getPgPool } from '../server/pgPool.js'
import { repairFacultyAuthLinks } from '../server/lib/repairFacultyAuthLinks.js'

async function main() {
  const pool = getPgPool()
  if (!pool) {
    console.error('DATABASE_URL is not configured.')
    process.exit(1)
  }

  const stats = await repairFacultyAuthLinks(pool)
  if (
    stats.linked === 0 &&
    stats.missing_auth === 0 &&
    stats.skipped_no_email === 0
  ) {
    console.log('No faculty with missing auth_user_id.')
    return
  }
  console.log('Repair complete:', stats)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
