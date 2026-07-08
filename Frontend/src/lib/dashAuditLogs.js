// TODO: migrate to apiFetch from ./apiClient.js
import { authClient } from './auth-client.js'
import { normalizeAuditEvent } from './auditStatisticsCore.js'

/**
 * Load audit logs via monitoring API (retry + local fallback), then optional Dash client.
 *
 * @param {{
 *   session?: import('better-auth').Session | { user?: { id?: string, role?: string, email?: string } },
 *   limit?: number,
 *   offset?: number,
 *   eventType?: string,
 *   userId?: string,
 * }} [options]
 */
export async function fetchDashAuditLogs(options = {}) {
  const sessionRes = options.session ? { data: options.session, error: null } : await authClient.getSession()
  if (sessionRes?.error) {
    throw new Error(sessionRes.error?.message || 'Session lookup failed.')
  }
  const session = sessionRes?.data
  const role = String(session?.user?.role || '').trim()
  if (role !== 'admin') {
    throw new Error('Admins only: you do not have permission to view audit logs.')
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit ?? 50)))
  const offset = Math.max(0, Number(options.offset ?? 0))

  const params = new URLSearchParams()
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  if (options.eventType) params.set('eventType', String(options.eventType))
  if (options.userId) params.set('userId', String(options.userId))

  const r = await fetch(`/api/monitoring/auth-audit-logs?${params.toString()}`, {
    credentials: 'include',
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(json?.message || `Auth audit logs failed (HTTP ${r.status}).`)
  }

  const source = json?.source || 'monitoring'
  const localFallback = source === 'local_fallback' || json?.localFallback === true

  return {
    events: Array.isArray(json?.events) ? json.events : [],
    total: Number(json?.total ?? 0),
    limit: Number(json?.limit ?? limit),
    offset: Number(json?.offset ?? offset),
    source,
    localFallback,
    warning: json?.warning || null,
  }
}

/** Normalize dash events for table rows (Monitoring / Audit Logs viewers). */
export function mapDashAuditRows(events) {
  return (Array.isArray(events) ? events : []).map((raw) => {
    const n = normalizeAuditEvent(raw)
    return {
      raw,
      time: n.time,
      userEmail: n.userEmail,
      userId: n.userId,
      eventType: n.eventType,
      details: n.detailsObj,
    }
  })
}
