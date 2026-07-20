/** Generic message returned to API clients for unexpected / database failures. */
export const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.'

/** Human-readable reason for admin restore UI. */
export function describeRestoreFailureReason(err) {
  const e = /** @type {Record<string, unknown>} */ (err || {})
  const constraint = typeof e.constraint === 'string' ? e.constraint : ''
  const pgCode = typeof e.pg_code === 'string' ? e.pg_code : typeof e.code === 'string' ? e.code : ''
  if (pgCode === '25P02' || /current transaction is aborted/i.test(String(e.detail || e.message || ''))) {
    const debug = e.restore_debug && typeof e.restore_debug === 'object' ? e.restore_debug : null
    const replicaErr = debug && typeof debug.replicaRoleError === 'string' ? debug.replicaRoleError : ''
    if (/session_replication_role|replication role|permission denied/i.test(replicaErr)) {
      return 'PostgreSQL denied session_replication_role (common on managed databases). Restore continues without it — redeploy the latest server fix and retry.'
    }
    return 'A prior SQL step failed inside the restore transaction (often session_replication_role permission or a locked table). Check server logs for the first [BACKUP] error, then retry with no active users.'
  }
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
 * Map known auth / validation failures to client-safe 4xx responses.
 * @param {unknown} err
 * @returns {{ status: number, error: string, message: string } | null}
 */
export function clientErrorFromException(err) {
  const e = /** @type {Record<string, unknown>} */ (err || {})
  const body = e.body && typeof e.body === 'object' ? /** @type {Record<string, unknown>} */ (e.body) : null
  if (body?.message) {
    const code = String(body.code || e.code || 'BAD_REQUEST')
    const status =
      code === 'USER_EXISTS' || code === 'USERNAME_IS_ALREADY_TAKEN' ? 409 : 400
    let message = String(body.message)
    if (code === 'INVALID_USERNAME' && /username is invalid/i.test(message)) {
      message =
        'Login ID may only contain letters, numbers, dots, and underscores (minimum 3 characters).'
    }
    return { status, error: code, message }
  }
  const pgCode = String(e.code || '')
  if (pgCode === '23505') {
    return {
      status: 409,
      error: 'USER_EXISTS',
      message: 'A user with this email or login ID already exists.',
    }
  }
  const message = String(e.message || '')
  if (pgCode === 'INVALID_USERNAME' || /username is invalid/i.test(message)) {
    return {
      status: 400,
      error: 'INVALID_USERNAME',
      message:
        'Login ID may only contain letters, numbers, dots, and underscores (minimum 3 characters).',
    }
  }
  if (pgCode === 'USERNAME_TOO_SHORT') {
    return {
      status: 400,
      error: 'INVALID_USERNAME',
      message: 'Login ID must be at least 3 characters.',
    }
  }
  return null
}

/**
 * Return a safe 4xx when possible; otherwise fall back to generic 500.
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {string} [context]
 */
export function sendClientSafeError(res, err, context = '') {
  const mapped = clientErrorFromException(err)
  if (mapped) {
    console.warn('[API]', context || res.req?.path || res.req?.originalUrl || '', err)
    if (!res.headersSent) {
      res.status(mapped.status).json({
        success: false,
        error: mapped.error,
        message: mapped.message,
      })
    }
    return true
  }
  sendSafeServerError(res, err, context)
  return false
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
