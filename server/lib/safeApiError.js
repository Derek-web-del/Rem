/** Generic message returned to API clients for unexpected / database failures. */
export const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.'

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
  const label = failed_table || 'unknown'
  return {
    success: false,
    error: 'RESTORE_FAILED',
    message: `Restore failed at table: ${label}`,
    failed_table,
    constraint,
    pg_code,
    rolled_back: e.rolled_back !== false,
    detail,
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
