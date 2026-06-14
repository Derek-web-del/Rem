/** Shared helpers for login lockout / suspicious sign-in audit events. */

export const LOCKOUT_REASON = 'Account Lockout for 5 Attempts failed'
export const MAX_LOCKOUT_ATTEMPTS = 5

const PORTAL_LABELS = {
  admin: 'Admin portal',
  faculty: 'Faculty portal',
  student: 'Student portal',
}

/**
 * @param {string | null | undefined} role
 * @returns {'Admin' | 'Faculty' | 'Student' | 'Unknown'}
 */
export function accountTypeFromRole(role) {
  const r = String(role || '').trim().toLowerCase()
  if (r === 'admin') return 'Admin'
  if (r === 'teacher' || r === 'faculty') return 'Faculty'
  if (r === 'student') return 'Student'
  return 'Unknown'
}

/**
 * Normalize portal token from header or referer path.
 * @param {string | null | undefined} token
 * @returns {'admin' | 'faculty' | 'student' | null}
 */
export function normalizePortalToken(token) {
  const t = String(token || '').trim().toLowerCase()
  if (t === 'admin' || t === 'institute') return 'admin'
  if (t === 'faculty' || t === 'teacher') return 'faculty'
  if (t === 'student') return 'student'
  return null
}

/**
 * @param {string | null | undefined} portal
 * @returns {string}
 */
export function portalDisplayLabel(portal) {
  const p = normalizePortalToken(portal)
  return p ? PORTAL_LABELS[p] : portal ? String(portal) : ''
}

/**
 * Resolve login portal from Better Auth hook context.
 * @param {{ headers?: { get?: (name: string) => string | null } } | null | undefined} ctx
 * @returns {'admin' | 'faculty' | 'student' | null}
 */
export function resolveLoginPortal(ctx) {
  const headers = ctx?.headers
  const headerPortal = normalizePortalToken(headers?.get?.('x-lms-login-portal'))
  if (headerPortal) return headerPortal

  const referer = String(headers?.get?.('referer') || headers?.get?.('referrer') || '')
  if (referer.includes('/login/institute')) return 'admin'
  if (referer.includes('/login/faculty')) return 'faculty'
  if (referer.includes('/login/student')) return 'student'
  return null
}

/**
 * @param {{ headers?: { get?: (name: string) => string | null } } | null | undefined} ctx
 * @returns {string}
 */
export function resolveClientIp(ctx) {
  return (
    ctx?.headers?.get?.('x-forwarded-for')?.split?.(',')?.[0]?.trim() ||
    ctx?.headers?.get?.('x-real-ip') ||
    ''
  )
}

/**
 * @param {{ headers?: { get?: (name: string) => string | null } } | null | undefined} ctx
 * @returns {string}
 */
export function resolveUserAgent(ctx) {
  return String(ctx?.headers?.get?.('user-agent') || '').slice(0, 512)
}

/**
 * Build normalized audit payload for lockout and enriched login-failure events.
 * @param {object} params
 */
export function buildLockoutAuditPayload({
  user = null,
  identifier = '',
  attempts = 0,
  maxAttempts = MAX_LOCKOUT_ATTEMPTS,
  lockedUntil = null,
  portal = null,
  ipAddress = '',
  userAgent = '',
  cooldownMs = null,
  suspiciousLoginDetected = true,
  reason = LOCKOUT_REASON,
} = {}) {
  const targetUserId = user?.id != null ? String(user.id) : ''
  const username = String(user?.username || '').trim()
  const userName = String(user?.name || '').trim()
  const userEmail = String(user?.email || '').trim().toLowerCase()
  const userRole = String(user?.role || '').trim()
  const accountType = accountTypeFromRole(userRole)
  const loginId = String(identifier || username || userEmail || '').trim()
  const portalToken = normalizePortalToken(portal)
  const portalLabel = portalDisplayLabel(portalToken)

  const description = targetUserId
    ? `Suspicious sign-in: ${attempts} failed password attempts for ${accountType} account (${loginId || username || userEmail})`
    : loginId
      ? `Suspicious sign-in: failed login attempt for unknown account (${loginId})`
      : 'Suspicious sign-in: failed login attempt'

  return {
    targetUserId: targetUserId || null,
    username: username || null,
    identifier: loginId || null,
    loginId: loginId || null,
    userName: userName || null,
    userEmail: userEmail || null,
    userRole: userRole || null,
    accountType,
    portal: portalToken,
    portalLabel: portalLabel || null,
    attempts,
    maxAttempts,
    lockedUntil: lockedUntil ? String(lockedUntil) : null,
    cooldownMs: cooldownMs != null ? Number(cooldownMs) : null,
    reason,
    suspiciousLoginDetected: Boolean(suspiciousLoginDetected),
    description,
    ipAddress: String(ipAddress || ''),
    userAgent: String(userAgent || '').slice(0, 512),
  }
}
