/**
 * Apply `scripts/sql/lenlearn_postgres_sections_table.sql` using DATABASE_URL from .env.
 *
 *   node scripts/ensure-postgres-sections-table.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.join(__dirname, 'sql', 'lenlearn_postgres_sections_table.sql')

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('[ensure-postgres-sections-table] Set DATABASE_URL in .env')
  process.exit(1)
}

const sql = fs.readFileSync(sqlPath, 'utf8')
const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  await pool.query(sql)
  console.log('[ensure-postgres-sections-table] OK — applied', path.basename(sqlPath))
} catch (e) {
  console.error('[ensure-postgres-sections-table]', e?.code || '', e?.message || e)
  process.exit(1)
} finally {
  await pool.end().catch(() => {})
}
