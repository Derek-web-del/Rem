/**
 * Add "user"."lastActiveAt" for @better-auth/infra activity tracking (PostgreSQL).
 *
 *   npm run pg:activity-tracking
 * Or: psql "$DATABASE_URL" -f Database/migrations/003_add_activity_tracking.sql
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Set DATABASE_URL in .env')
  process.exit(1)
}

const sqlPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../Database/migrations/003_add_activity_tracking.sql',
)
const sql = fs.readFileSync(sqlPath, 'utf8')

const pool = new pg.Pool({ connectionString: url, max: 2 })
try {
  await pool.query(sql)
  console.log('[pg:activity-tracking] Applied lastActiveAt column on "user" (if missing).')
} finally {
  await pool.end().catch(() => {})
}
