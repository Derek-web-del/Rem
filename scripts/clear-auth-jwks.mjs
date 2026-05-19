/**
 * Remove JWT JWKS rows from the Better Auth PostgreSQL database.
 *
 * Run this after changing BETTER_AUTH_SECRET if you see:
 *   "Failed to decrypt private key ... same as the one used to encrypt"
 *
 * Existing JWTs signed with the old key will no longer verify until clients
 * fetch fresh tokens. User sessions (cookies) are unaffected.
 *
 *   npm run auth:clear-jwks
 */
import 'dotenv/config'
import pg from 'pg'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 1 })

async function main() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM jwks')
    const before = Number(rows[0]?.n ?? 0)
    await pool.query('DELETE FROM jwks')
    console.log(
      `Cleared ${before} JWKS key row(s). Restart the auth server; new keys are created when JWT signing runs again.`,
    )
  } catch (e) {
    if (String(e?.message || e).includes('does not exist')) {
      console.log('Table jwks does not exist yet; nothing to clear.')
    } else {
      throw e
    }
  } finally {
    await pool.end().catch(() => {})
  }
}

main().catch(async (e) => {
  console.error(e)
  await pool.end().catch(() => {})
  process.exit(1)
})
