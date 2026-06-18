/**
 * Run Better Auth + LMS SQL migrations against DATABASE_URL.
 *
 *   npm run db:migrate
 */
console.log('[db:migrate] script entry', {
  pid: process.pid,
  cwd: process.cwd(),
  node: process.version,
})
console.log('[db:migrate] memory', process.memoryUsage())

const REQUIRED_ENV = ['DATABASE_URL']

function maskDatabaseUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return '(not set)'
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//***@${parsed.host}${parsed.pathname}`
  } catch {
    return '(invalid URL)'
  }
}

async function verifyDbConnection(pool, timeoutMs = 10_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[db:migrate] Database connection timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  try {
    const client = await Promise.race([pool.connect(), timeout])
    await client.query('SELECT 1')
    client.release()
    console.log('[db:migrate] database connection OK')
  } finally {
    clearTimeout(timer)
  }
}

function validateRequiredEnv(dotenvLoadedFrom) {
  const missing = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim())
  if (missing.length > 0) {
    console.error('[db:migrate] Missing required environment variables:', missing.join(', '))
    console.error('[db:migrate] dotenv loaded from:', dotenvLoadedFrom)
    process.exit(1)
  }
  console.log('[db:migrate] DATABASE_URL:', maskDatabaseUrl(process.env.DATABASE_URL))
}

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

async function seedAdminIfNeeded(pool, execSync) {
  const isProduction = (process.env.NODE_ENV || '') === 'production'
  const password = String(process.env.SEED_ADMIN_PASSWORD || '').trim()
  if (!isProduction || !password) {
    console.log('[db:migrate] admin seed skipped (not production or SEED_ADMIN_PASSWORD unset)')
    return
  }
  if (password === 'Admin123@') {
    console.warn('[db:migrate] SEED_ADMIN_PASSWORD is the dev default — seeding anyway.')
  }

  const adminUsername = String(process.env.SEED_ADMIN_USERNAME || 'admin').trim()
  const { rows } = await pool.query(
    `SELECT 1 FROM "user" WHERE LOWER(role) = 'admin' OR username = $1 LIMIT 1`,
    [adminUsername],
  )
  if (rows.length > 0) {
    console.log('[db:migrate] Admin user already exists — skip seed.')
    return
  }

  console.log('[db:migrate] No admin user — running seed from SEED_ADMIN_* env…')
  try {
    execSync('node scripts/seed-admin.mjs', {
      stdio: 'inherit',
      env: { ...process.env, AUTH_DISABLE_SIGNUP: 'false' },
    })
    console.log('[db:migrate] admin seed completed')
  } catch (err) {
    console.error(
      '[db:migrate] Admin seed failed — server will still start:',
      err?.message || err,
    )
  }
}

export async function runMigrations() {
  const { LENLEARN_DOTENV_LOADED_FROM } = await import('../server/env-bootstrap.js')
  console.log('[db:migrate] env loaded from:', LENLEARN_DOTENV_LOADED_FROM)
  validateRequiredEnv(LENLEARN_DOTENV_LOADED_FROM)

  const { execSync } = await import('node:child_process')
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { getPgPool } = await import('../server/pgPool.js')
  const { ensureSchema } = await import('../server/api/state/shared.js')

  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.join(__dirname, '..', 'Database', 'migrations')

  const pool = getPgPool()
  if (!pool) {
    console.error('[db:migrate] DATABASE_URL is not set (pool unavailable)')
    throw new Error('DATABASE_URL is not set')
  }

  console.log('[db:migrate] connecting to database…')
  await verifyDbConnection(pool)

  console.log('[db:migrate] Running Better Auth migrations…')
  execSync('npx @better-auth/cli migrate --yes --config server/auth.js', {
    stdio: 'inherit',
  })
  console.log('[db:migrate] Better Auth migrations complete')

  await ensureMigrationTable(pool)

  console.log('[db:migrate] Ensuring base LMS schema (faculties, students, …)…')
  await ensureSchema(pool)
  console.log('[db:migrate] Base LMS schema ready')

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  console.log(`[db:migrate] Applying ${files.length} LMS SQL migration(s)…`)
  for (const filename of files) {
    console.log(`[db:migrate] starting migration: ${filename}`)
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8')
    await runSqlMigration(pool, filename, sql)
  }

  console.log('[db:migrate] Done.')
  console.log('[db:migrate] running admin seed check…')
  await seedAdminIfNeeded(pool, execSync)
  console.log('[db:migrate] closing pool')
  await pool.end()
}

const scriptArg = String(process.argv[1] || '').replace(/\\/g, '/')
const isDirectRun =
  scriptArg.endsWith('/run-migrations.mjs') || scriptArg.endsWith('run-migrations.mjs')

if (isDirectRun) {
  runMigrations().catch((err) => {
    console.error('[db:migrate] FAILED:', err?.message || err)
    if (err?.stack) console.error(err.stack)
    process.exit(1)
  })
}
