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

async function seedAdminIfNeeded(pool) {
  const isProduction = (process.env.NODE_ENV || '') === 'production'
  const password = String(process.env.SEED_ADMIN_PASSWORD || '').trim()
  if (!isProduction || !password) return
  if (password === 'Admin123@') {
    console.warn('[db:migrate] SEED_ADMIN_PASSWORD is the dev default — seeding anyway.')
  }

  const { rows } = await pool.query(
    `SELECT 1 FROM "user" WHERE LOWER(role) = 'admin' LIMIT 1`,
  )
  if (rows.length > 0) {
    console.log('[db:migrate] Admin user already exists — skip seed.')
    return
  }

  console.log('[db:migrate] No admin user — running seed from SEED_ADMIN_* env…')
  execSync('node scripts/seed-admin.mjs', {
    stdio: 'inherit',
    env: { ...process.env, AUTH_DISABLE_SIGNUP: 'false' },
  })
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
  await seedAdminIfNeeded(pool)
  await pool.end()
}

main().catch((err) => {
  console.error('[db:migrate]', err?.message || err)
  process.exit(1)
})
