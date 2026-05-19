import 'dotenv/config'
import pg from 'pg'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('[postgres-ping] Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  const { rows } = await pool.query('SELECT current_database() AS db, version() AS version')
  console.log('[postgres-ping] OK database=', rows[0]?.db)
  console.log(rows[0]?.version?.split('\n')[0] || '')
} catch (e) {
  console.error('[postgres-ping]', e?.code || '', e?.message || e)
  process.exit(1)
} finally {
  await pool.end().catch(() => {})
}
