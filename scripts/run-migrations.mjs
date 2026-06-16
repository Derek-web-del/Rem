/**
 * Run Better Auth + LMS SQL migrations against DATABASE_URL.
 *
 *   npm run db:migrate
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import '../server/env-bootstrap.js'
import { getPgPool } from '../server/pgPool.js'
import { ensureSchema } from '../server/api/state/shared.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'Database', 'migrations')

async function ensureMigrationTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function runSqlMigration(pool, filename, sql) {
  const { rows } = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename],
  )
  if (rows.length > 0) {
    console.log(`[db:migrate] skip (already applied): ${filename}`)
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [filename],
    )
    await client.query('COMMIT')
    console.log(`[db:migrate] applied: ${filename}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function main() {
  const pool = getPgPool()
  if (!pool) {
    console.error('[db:migrate] DATABASE_URL is not set')
    process.exit(1)
  }

  console.log('[db:migrate] Running Better Auth migrations…')
  execSync('npx @better-auth/cli migrate --yes --config server/auth.js', {
    stdio: 'inherit',
  })

  await ensureMigrationTable(pool)

  console.log('[db:migrate] Ensuring base LMS schema (faculties, students, …)…')
  await ensureSchema(pool)

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  console.log(`[db:migrate] Applying ${files.length} LMS SQL migration(s)…`)
  for (const filename of files) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8')
    await runSqlMigration(pool, filename, sql)
  }

  console.log('[db:migrate] Done.')
  await pool.end()
}

main().catch((err) => {
  console.error('[db:migrate]', err?.message || err)
  process.exit(1)
})
