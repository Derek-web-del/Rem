/**
 * Seed the institute admin account (production wrapper).
 *
 *   npm run db:seed
 *
 * Requires migrated auth tables. Set SEED_ADMIN_* env vars before running in production.
 */
import '../server/env-bootstrap.js'

const isProduction = process.env.NODE_ENV === 'production'
const seedPassword = String(process.env.SEED_ADMIN_PASSWORD || '').trim()

if (isProduction) {
  if (!seedPassword || seedPassword === 'Admin123@') {
    console.error(
      '[db:seed] Set a strong SEED_ADMIN_PASSWORD before seeding in production.',
    )
    process.exit(1)
  }
}

await import('../server/seed.mjs')
