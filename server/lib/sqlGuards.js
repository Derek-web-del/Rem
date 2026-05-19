/** Whitelisted roster tables for archive / purge routes. */
export const ARCHIVE_ENTITY_TYPES = new Set(['students', 'faculties'])

const ARCHIVE_TABLE_SQL = {
  students: 'public.students',
  faculties: 'public.faculties',
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i

/**
 * @param {string} type
 * @returns {string | null}
 */
export function resolveArchiveTableSql(type) {
  if (!ARCHIVE_ENTITY_TYPES.has(type)) return null
  return ARCHIVE_TABLE_SQL[type] || null
}

/**
 * @param {string} name
 * @param {string} [label]
 */
export function assertSqlIdentifier(name, label = 'SQL identifier') {
  const n = String(name || '').trim()
  if (!SQL_IDENTIFIER.test(n)) {
    const err = new Error(`Invalid ${label}.`)
    err.statusCode = 400
    throw err
  }
  return n
}

/**
 * Filter dynamic INSERT/UPDATE column keys to safe identifiers present in schema set.
 * @param {string[]} keys
 * @param {Set<string>} colSet
 */
export function filterFacultyRowKeys(keys, colSet) {
  return keys.filter((k) => colSet.has(k) && SQL_IDENTIFIER.test(k))
}
