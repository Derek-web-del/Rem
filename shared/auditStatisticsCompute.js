import { coerceAuditTimestampMs, pickAuditEventDate } from './auditTime.js'

/** @param {Record<string, unknown>} e */
export function statsEventType(e) {
  const authType = String(e.eventType || e.event_type || e.type || '').trim().toLowerCase()
  if (authType) return authType
  const lms = String(e.activityType || '').trim().toUpperCase()
  if (lms === 'USER_SIGNED_IN') return 'user_signed_in'
  if (lms === 'AUTH_LOCKOUT') return 'auth_lockout'
  if (lms === 'USER_CREATED') return 'user_created'
  return lms ? lms.toLowerCase() : ''
}

function isFailedSignIn(type) {
  const t = String(type || '').toLowerCase()
  return (
    t === 'login_failed' ||
    t === 'user_sign_in_failed' ||
    (t.includes('sign_in') && t.includes('fail'))
  )
}

function isPasswordReset(type) {
  const t = String(type || '').toLowerCase()
  return t === 'password_reset' || t.startsWith('password_reset')
}

function isAccountCreated(type) {
  const t = String(type || '').toLowerCase()
  return t === 'user_created' || t === 'user_signed_up'
}

/**
 * @param {Array<Record<string, unknown>>} collected
 */
export function computeAuditStatistics(collected) {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - 7)
  startOfWeek.setHours(0, 0, 0, 0)

  const todayStartMs = startOfToday.getTime()
  const weekStartMs = startOfWeek.getTime()

  const todayEvents = []
  const weekEvents = []

  for (const e of collected) {
    const ms = coerceAuditTimestampMs(pickAuditEventDate(e) ?? e.time ?? e.timestamp)
    if (ms == null) continue
    if (ms >= todayStartMs) todayEvents.push(e)
    if (ms >= weekStartMs) weekEvents.push(e)
  }

  const totalEventsToday = todayEvents.length
  const signInsToday = todayEvents.filter((e) => statsEventType(e) === 'user_signed_in').length
  const failedSignIns = todayEvents.filter((e) => isFailedSignIn(statsEventType(e))).length
  const accountsCreatedThisWeek = weekEvents.filter((e) => isAccountCreated(statsEventType(e))).length
  const passwordResetsToday = todayEvents.filter((e) => isPasswordReset(statsEventType(e))).length

  const signInsByHour = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    value: 0,
  }))

  for (const e of todayEvents) {
    if (statsEventType(e) !== 'user_signed_in') continue
    const d = pickAuditEventDate(e)
    if (!d) continue
    signInsByHour[d.getHours()].value += 1
  }

  const typeCounts = new Map()
  for (const e of collected) {
    const k = statsEventType(e) || 'unknown'
    typeCounts.set(k, (typeCounts.get(k) || 0) + 1)
  }

  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ key: k, label: k.replaceAll('_', ' '), value: v }))

  return {
    totalEventsToday,
    signInsToday,
    failedSignIns,
    accountsCreatedThisWeek,
    passwordResetsToday,
    signInsByHour,
    topTypes,
  }
}
