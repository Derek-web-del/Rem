// TODO: migrate to apiFetch from ./apiClient.js
/** Shared audit statistics helpers (Better Auth Infra + dashboard). */

import { coerceAuditTimestamp, formatAuditTime, pickAuditEventDate } from '../../../shared/auditTime.js'
import { computeAuditStatistics as computeAuditStatisticsShared } from '../../../shared/auditStatisticsCompute.js'

export { formatAuditTime, coerceAuditTimestamp, pickAuditEventDate }

export const EVENT_LABELS = {
  user_created: 'New user registration',
  user_signed_up: 'New user registration',
  profile_updated: 'User updates their profile',
  user_profile_updated: 'User updates their profile',
  user_account_changed: 'Profile Updated (Account)',
  profile_image_updated: 'User changes their avatar',
  user_profile_image_updated: 'User changes their avatar',
  user_deleted: 'User account deleted',
  user_signed_in: 'User Signed In',
  user_signed_out: 'User signs out',
  user_sign_in_failed: 'Sign In Failed',
  login_failed: 'Sign In Failed',
  password_reset_requested: 'Password Reset Requested',
  password_reset_completed: 'Password Reset Completed',
  password_reset: 'Password Reset',
  password_changed: 'Password updated',
  session_created: 'New session created',
  session_revoked: 'Single session revoked',
}

export function humanEventType(t) {
  const key = String(t || '')
  return EVENT_LABELS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || '—'
}

/** @deprecated Prefer pickAuditEventDate — returns Date or legacy raw field. */
export function pickTime(e) {
  const d = pickAuditEventDate(e)
  if (d) return d
  return e?.time || e?.timestamp || e?.createdAt || e?.created_at || e?.occurredAt || e?.occurred_at || null
}

export function normalizeAuditEvent(raw) {
  const eventData = raw?.eventData ?? raw?.details ?? raw?.metadata ?? raw?.data ?? raw?.context ?? null
  const userObj = raw?.user ?? raw?.actor ?? raw?.account ?? raw?.principal ?? null
  const email =
    raw?.email ||
    raw?.userEmail ||
    raw?.user_email ||
    userObj?.email ||
    eventData?.userEmail ||
    ''
  const name = raw?.userName || userObj?.name || eventData?.userName || ''
  const when = pickAuditEventDate(raw)
  return {
    id: raw?.id || raw?._id || raw?.eventId || raw?.eventKey || '',
    time: when,
    eventType: raw?.eventType || raw?.event_type || raw?.type || raw?.event || '',
    userId: raw?.userId || raw?.user_id || userObj?.id || userObj?.userId || eventData?.userId || '',
    userEmail: name ? `${name}${email ? ` (${email})` : ''}` : email,
    detailsObj: eventData,
    raw,
  }
}

export async function fetchAuditLogs(filters = {}) {
  const { fetchDashAuditLogs } = await import('./dashAuditLogs.js')
  return fetchDashAuditLogs({
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    eventType: filters.eventType,
    userId: filters.userId,
  })
}

/** Aggregate metrics from normalized audit events (same rules as Audit Logs page). */
export function computeAuditStatistics(collected) {
  const stats = computeAuditStatisticsShared(collected)
  return {
    ...stats,
    topTypes: stats.topTypes.map((row) => ({
      ...row,
      label: humanEventType(row.key) || row.label,
    })),
  }
}

export async function loadAuditStatisticsFromApi() {
  const r = await fetch('/api/monitoring/audit-statistics', { credentials: 'include' })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(json?.message || `Audit statistics failed (HTTP ${r.status}).`)
  }
  return {
    ...json,
    topTypes: (Array.isArray(json?.topTypes) ? json.topTypes : []).map((row) => ({
      ...row,
      label: humanEventType(row.key) || row.label,
    })),
  }
}
