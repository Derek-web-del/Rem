/** Generic message returned to API clients for unexpected / database failures. */
export const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.'

/** Human-readable reason for admin restore UI. */
export function describeRestoreFailureReason(err) {
  const e = /** @type {Record<string, unknown>} */ (err || {})
  const constraint = typeof e.constraint === 'string' ? e.constraint : ''
  const pgCode = typeof e.pg_code === 'string' ? e.pg_code : typeof e.code === 'string' ? e.code : ''
  if (pgCode === '23503' || /foreign key/i.test(String(e.detail || e.message || ''))) {
    if (constraint.includes('topic_id')) {
      return 'foreign key constraint violation (lesson topic_id references a missing topic)'
    }
    return 'foreign key constraint violation'
  }
  return String(e.detail || e.message || err || 'Restore failed')
}

/**
 * Build admin-visible restore error payload (restore endpoints are admin-only).
 * @param {unknown} err
 * @returns {Record<string, unknown>}
 */
export function formatRestoreErrorPayload(err) {
  const e = /** @type {Record<string, unknown>} */ (err || {})
  const failed_table =
    typeof e.failed_table === 'string'
      ? e.failed_table
      : typeof e.table === 'string'
        ? e.table
        : null
  const constraint = typeof e.constraint === 'string' ? e.constraint : null
  const pg_code = typeof e.code === 'string' ? e.code : typeof e.pg_code === 'string' ? e.pg_code : null
  const detail = String(e.detail || e.message || err || 'Restore failed')
  const reason = describeRestoreFailureReason(err)
  const label = failed_table || 'unknown'
  return {
    success: false,
    error: 'RESTORE_FAILED',
    message: `Restore failed at table: ${label}`,
    failed_table,
    constraint,
    pg_code,
    reason,
    rolled_back: e.rolled_back !== false,
    detail,
    restore_engine: typeof e.restore_engine === 'string' ? e.restore_engine : null,
    restore_phase: typeof e.restore_phase === 'string' ? e.restore_phase : null,
    restore_debug: e.restore_debug && typeof e.restore_debug === 'object' ? e.restore_debug : null,
    hint: 'Your database was automatically rolled back. No data was lost. Try again or contact support.',
  }
}

/**
 * Log the real error server-side; never expose Postgres / stack details to clients.
 *
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {string} [context]
 */
export function sendSafeServerError(res, err, context = '') {
  const path = res.req?.path || res.req?.originalUrl || ''
  console.error('[DB ERROR]', context || path, err)
  if (res.headersSent) return
  res.status(500).json({
    success: false,
    error: GENERIC_SERVER_ERROR,
    message: GENERIC_SERVER_ERROR,
  })
}

/**
 * Admin restore failure — returns structured table/constraint details.
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {string} [context]
 */
export function sendRestoreError(res, err, context = '') {
  const path = res.req?.path || res.req?.originalUrl || ''
  console.error('[RESTORE ERROR]', context || path, err)
  if (res.headersSent) return
  res.status(500).json(formatRestoreErrorPayload(err))
}
