/** Generic message returned to API clients for unexpected / database failures. */
export const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again.'

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
