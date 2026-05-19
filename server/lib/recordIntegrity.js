/**
 * Record integrity: last_modified_by + updated_at on institute tables (OWASP A04/A08).
 */

const columnCache = new Map()

/**
 * @param {import('pg').Pool} pool
 * @param {string} table
 */
export async function getPublicTableColumnSet(pool, table) {
  const key = String(table)
  if (columnCache.has(key)) return columnCache.get(key)
  const { rows } = await pool.query(
    `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [key],
  )
  const set = new Set((rows || []).map((r) => String(r.column_name)))
  columnCache.set(key, set)
  return set
}

export function clearRecordIntegrityColumnCache() {
  columnCache.clear()
}

/**
 * @param {import('pg').Pool} pool
 */
export async function ensureRecordIntegrityColumns(pool) {
  for (const table of ['students', 'faculties']) {
    try {
      await pool.query(
        `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255)`,
      )
      await pool.query(
        `ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
      )
    } catch (e) {
      console.warn(`[recordIntegrity] ensure columns on ${table}:`, e?.message || e)
    }
  }
  clearRecordIntegrityColumnCache()
}

/**
 * @param {import('pg').Pool} pool
 * @param {'students' | 'faculties'} table
 * @param {Record<string, unknown>} row
 * @param {string} adminUserId
 */
export async function stampRowLastModified(pool, table, row, adminUserId) {
  const cols = await getPublicTableColumnSet(pool, table)
  if (cols.has('last_modified_by')) {
    row.last_modified_by = String(adminUserId || '').slice(0, 255)
  }
  if (cols.has('updated_at')) {
    row.updated_at = new Date()
  }
  return row
}

/**
 * Append integrity columns to a parameterized UPDATE SET clause.
 * @param {import('pg').Pool} pool
 * @param {'students' | 'faculties'} table
 * @param {string} setClause - e.g. "col = $1, col2 = $2"
 * @param {unknown[]} values
 * @param {string} adminUserId
 * @param {number} nextParamIndex - index for next placeholder after existing values
 */
export async function extendUpdateSetWithIntegrity(
  pool,
  table,
  setClause,
  values,
  adminUserId,
  nextParamIndex,
) {
  const cols = await getPublicTableColumnSet(pool, table)
  const parts = [setClause]
  let idx = nextParamIndex
  if (cols.has('last_modified_by')) {
    parts.push(`last_modified_by = $${idx++}`)
    values.push(String(adminUserId || '').slice(0, 255))
  }
  if (cols.has('updated_at')) {
    parts.push('updated_at = NOW()')
  }
  return { setClause: parts.join(', '), values, nextParamIndex: idx }
}
