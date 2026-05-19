import { queryLocalAuditLogsPage } from './auditLogsLedger.js'

const logger = {
  error: (message, meta) => {
    console.error(message, meta ?? {})
  },
}

/**
 * @param {unknown} error
 * @param {string} [context]
 */
export function logAuditInfraError(error, context = 'infra') {
  logger.error('[AuditLogs] Infra call failed', {
    context,
    status: error?.status,
    statusText: error?.statusText,
    cause: error?.cause,
    message: error?.message,
  })
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [retries]
 * @param {number} [delayMs]
 * @returns {Promise<T>}
 */
export async function withRetry(fn, retries = 2, delayMs = 200) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const isRetryable = !err?.status || err.status >= 500
      if (i === retries || !isRetryable) throw err
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw new Error('withRetry: unreachable')
}

/**
 * @param {Record<string, unknown>} filters
 */
async function fetchLocalAuditFallback(filters) {
  const page = await queryLocalAuditLogsPage(filters)
  return {
    ...page,
    source: 'local_fallback',
  }
}

/**
 * Single Infra GET /events/user attempt (throws on non-retryable HTTP errors).
 */
async function fetchInfraUserAuditLogsOnce({ headers, userId, limit, offset }) {
  const apiKey = String(process.env.BETTER_AUTH_API_KEY || '').trim()
  const apiUrl = String(process.env.BETTER_AUTH_API_URL || 'https://dash.better-auth.com').trim()
  if (!apiKey) {
    const err = new Error('Events API is not configured (missing BETTER_AUTH_API_KEY).')
    err.status = 503
    throw err
  }
  if (!userId) {
    const err = new Error('Missing user id for Infra audit logs.')
    err.status = 400
    throw err
  }

  const url = new URL('/events/user', apiUrl)
  url.searchParams.set('userId', String(userId))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))

  let r
  try {
    r = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'user-agent': headers?.['user-agent'] || 'lenlearn-auth-server',
      },
    })
  } catch (networkErr) {
    const err = new Error(`Infra audit logs network error: ${networkErr?.message || networkErr}`)
    err.status = undefined
    err.cause = networkErr
    throw err
  }

  const text = await r.text()
  if (!r.ok) {
    const err = new Error(
      `Infra audit logs failed (${r.status}): ${text.slice(0, 500) || '(empty body)'}`,
    )
    err.status = r.status >= 400 && r.status < 600 ? r.status : 502
    err.statusText = r.statusText
    err.cause = text || null
    throw err
  }

  try {
    const data = JSON.parse(text)
    return {
      events: Array.isArray(data?.events) ? data.events : [],
      total: Number(data?.total ?? 0),
      limit: Number(data?.limit ?? limit),
      offset: Number(data?.offset ?? offset),
      source: 'infra',
    }
  } catch {
    const err = new Error(`Infra audit logs returned non-JSON: ${text.slice(0, 200)}`)
    err.status = 502
    err.statusText = 'Bad Gateway'
    throw err
  }
}

/**
 * Remote Better Auth Infra user events API (requires BETTER_AUTH_API_KEY).
 * Retries transient 500 / network failures before throwing.
 */
export async function fetchInfraUserAuditLogs(params) {
  return withRetry(() => fetchInfraUserAuditLogsOnce(params))
}

/**
 * Dash plugin route → Infra API (with retry) → local `public.audit_logs` ledger.
 * Never throws; returns `{ source: 'local_fallback', events, ... }` when upstream fails.
 */
export async function fetchAuthAuditLogPage({
  auth,
  headers,
  userId,
  limit = 50,
  offset = 0,
  eventType = '',
  dateFrom = '',
  dateTo = '',
  search = '',
}) {
  const pageLimit = Math.max(1, Math.min(100, Number(limit)))
  const pageOffset = Math.max(0, Number(offset))
  const localFilters = {
    limit: pageLimit,
    offset: pageOffset,
    userId,
    eventType,
    dateFrom,
    dateTo,
    search,
  }
  const query = {
    limit: pageLimit,
    offset: pageOffset,
    ...(userId ? { userId: String(userId) } : {}),
    ...(eventType ? { eventType: String(eventType) } : {}),
  }

  if (auth?.api?.getAuditLogs) {
    try {
      const dash = await auth.api.getAuditLogs({ headers, query })
      const payload = dash?.data ?? dash
      if (Array.isArray(payload?.events)) {
        return {
          events: payload.events,
          total: Number(payload.total ?? payload.events.length),
          limit: Number(payload.limit ?? pageLimit),
          offset: Number(payload.offset ?? pageOffset),
          source: 'dash',
        }
      }
    } catch (e) {
      logAuditInfraError(e, 'auth.api.getAuditLogs')
    }
  }

  if (String(process.env.BETTER_AUTH_API_KEY || '').trim() && userId) {
    try {
      return await fetchInfraUserAuditLogs({
        headers,
        userId,
        limit: pageLimit,
        offset: pageOffset,
      })
    } catch (e) {
      logAuditInfraError(e, 'GET /events/user')
    }
  }

  logger.error('[AuditLogs] Using PostgreSQL public.audit_logs local_fallback', {
    userId: userId || null,
    reason: 'Dash / Infra unavailable, misconfigured, or exhausted retries',
  })
  return fetchLocalAuditFallback(localFilters)
}
