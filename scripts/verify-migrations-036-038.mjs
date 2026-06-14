#!/usr/bin/env node
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function colExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[verify-migrations] DATABASE_URL not set')
    process.exit(1)
  }
  const checks = [
    ['students', 'dob'],
    ['faculties', 'terms_accepted'],
    ['faculties', 'terms_accepted_at'],
    ['user', 'terms_accepted'],
    ['user', 'terms_accepted_at'],
  ]
  const missing = []
  for (const [table, col] of checks) {
    const ok = await colExists(table, col)
    console.log(`[verify-migrations] ${table}.${col}: ${ok ? 'OK' : 'MISSING'}`)
    if (!ok) missing.push(`${table}.${col}`)
  }
  const { rows: dobType } = await pool.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'dob'`,
  )
  if (dobType[0]) {
    console.log(`[verify-migrations] students.dob type: ${dobType[0].data_type}`)
  }
  await pool.end()
  if (missing.length) {
    console.error('[verify-migrations] Missing columns:', missing.join(', '))
    process.exit(1)
  }
  console.log('[verify-migrations] All 036-038 columns present')
}

main().catch((e) => {
  console.error('[verify-migrations]', e?.message || e)
  process.exit(1)
})
