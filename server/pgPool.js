import pg from 'pg'

/** Keep PostgreSQL DATE columns as plain YYYY-MM-DD strings — avoids JS Date timezone shifts. */
pg.types.setTypeParser(1082, (value) => value)

let _pool = null

/** Validates DATABASE_URL uses a PostgreSQL scheme. Throws on unsupported protocols. */
export function assertPostgresDatabaseUrl(connectionString) {
  const raw = String(connectionString || '').trim()
  if (!raw) return
  let protocol
  try {
    protocol = new URL(raw).protocol
  } catch {
    throw new Error(
      '[pg] Invalid DATABASE_URL. LenLearn requires PostgreSQL (e.g. postgres://user:pass@localhost:5432/lenlearn_db).',
    )
  }
  if (!['postgres:', 'postgresql:'].includes(protocol)) {
    throw new Error(
      `[pg] Unsupported DATABASE_URL protocol "${protocol}". LenLearn requires PostgreSQL only.`,
    )
  }
}

/**
 * Shared PostgreSQL pool for Better Auth (Kysely) and LMS institute state / activity logs.
 * Configure with `DATABASE_URL` (e.g. postgres://user:pass@localhost:5432/dbname).
 */
export function getPgPool() {
  if (_pool) return _pool
  const connectionString = String(process.env.DATABASE_URL || '').trim()
  if (!connectionString) return null
  assertPostgresDatabaseUrl(connectionString)
  const connectionTimeoutMillis = Number(process.env.PG_CONNECT_TIMEOUT_MS || 8000)
  const queryTimeout = Number(process.env.PG_QUERY_TIMEOUT_MS || 15000)
  _pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10) || 10,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis > 0
      ? connectionTimeoutMillis
      : 8000,
    query_timeout: Number.isFinite(queryTimeout) && queryTimeout > 0 ? queryTimeout : 15000,
    options: '-c timezone=UTC',
  })
  _pool.on('error', (err) => {
    console.error('[pg] pool error:', err?.message || err)
  })
  return _pool
}

export function isPgConfigured() {
  return !!String(process.env.DATABASE_URL || '').trim()
}

export async function closePgPool() {
  if (_pool) {
    try {
      await _pool.end()
    } catch {}
    _pool = null
  }
}
