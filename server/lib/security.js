import { customActivityLogger } from '../services/CustomActivityLogger.js'

/** OWASP A07 — minimum password policy (also enforced in server/auth.js). */
export const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

export function validatePasswordStrength(password, label = 'Password') {
  if (!password || typeof password !== 'string') return
  if (!STRONG_PASSWORD_REGEX.test(password)) {
    const err = new Error(
      `${label} must be at least 8 characters with uppercase, lowercase, a number, and a symbol.`,
    )
    err.code = 'WEAK_PASSWORD'
    throw err
  }
}

/** Fields users must not change on their own account (OWASP A01 privilege escalation). */
export const FORBIDDEN_SELF_UPDATE_FIELDS = [
  'role',
  'is_admin',
  'isAdmin',
  'permissions',
  'twoFactorEnabled',
  'two_factor_enabled',
  'failedLoginAttempts',
  'failed_attempts',
  'lockedUntil',
  'locked_until',
  'banExpires',
  'banned',
]

/**
 * Strip privilege / lockout fields from self-service profile update bodies.
 * @param {Record<string, unknown> | null | undefined} body
 */
export function sanitizeSelfUpdateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  for (const field of FORBIDDEN_SELF_UPDATE_FIELDS) {
    delete body[field]
  }
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    for (const field of FORBIDDEN_SELF_UPDATE_FIELDS) {
      delete body.data[field]
    }
  }
  return body
}

/** OWASP A02 — never expose auth secrets in API JSON. */
export function sanitizeUserResponse(user) {
  if (!user || typeof user !== 'object') return user
  const {
    password,
    failedLoginAttempts,
    failed_attempts,
    lockedUntil,
    locked_until,
    resetToken,
    reset_token,
    otpSecret,
    otp_secret,
    ...safeUser
  } = user
  return safeUser
}

/**
 * @param {import('express').Request} req
 */
export function clientIpFromRequest(req) {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0]?.trim()
  return xf || String(req?.ip || '').trim() || ''
}

/**
 * @param {import('express').Request} req
 * @param {{ reason?: string, requiredRole?: string, path?: string }} [meta]
 */
export function logUnauthorizedAccessFromRequest(req, meta = {}) {
  void customActivityLogger
    .logUnauthorizedAccess({
      endpoint: String(meta.path || req?.originalUrl || req?.path || ''),
      method: String(req?.method || ''),
      ipAddress: clientIpFromRequest(req),
      userAgent: String(req?.headers?.['user-agent'] || ''),
      reason: meta.reason || 'Access denied',
      requiredRole: meta.requiredRole || '',
    })
    .catch(() => {})
}

/**
 * Super-admin gate for destructive audit operations (OWASP A09).
 * Set SUPER_ADMIN_EMAILS=comma,separated,emails in .env
 */
export async function requireSuperAdminSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const user = session?.user ?? session?.data?.user
    if (!user?.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(user.role || '').trim().toLowerCase()
    if (role !== 'admin') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Super-admin only',
        requiredRole: 'super_admin',
      })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied. Super admin only.' })
      return null
    }
    const allowlist = String(process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const email = String(user.email || '').trim().toLowerCase()
    if (!allowlist.length || !allowlist.includes(email)) {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Not in SUPER_ADMIN_EMAILS allowlist',
        requiredRole: 'super_admin',
      })
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Access denied. Configure SUPER_ADMIN_EMAILS for audit log deletion.',
      })
      return null
    }
    return session
  } catch (e) {
    console.error('[security] requireSuperAdminSession:', e?.message || e)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

export async function requireAdminRole(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const role = String(session?.user?.role || session?.data?.user?.role || '')
      .trim()
      .toLowerCase()
    if (!session?.user?.id || role !== 'admin') {
      logUnauthorizedAccessFromRequest(req, { reason: 'Admin only', requiredRole: 'admin' })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied. Admin only.' })
      return null
    }
    return session
  } catch (e) {
    console.error('[security] requireAdminRole:', e?.message || e)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

export async function requireFacultyRole(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const user = session?.user ?? session?.data?.user
    if (!user?.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(user.role || '').trim().toLowerCase()
    if (role !== 'faculty' && role !== 'teacher') {
      logUnauthorizedAccessFromRequest(req, { reason: 'Faculty only', requiredRole: 'faculty' })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    return session
  } catch (e) {
    console.error('[security] requireFacultyRole:', e?.message || e)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

/**
 * Require an authenticated session whose role is in `allowedRoles`.
 * @param {string[]} allowedRoles e.g. ['admin','faculty','student']
 */
export async function requireAnyRoleSession(req, res, auth, allowedRoles) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication unavailable.' })
    return null
  }
  const allowed = new Set(
    (allowedRoles || []).map((r) => String(r || '').trim().toLowerCase()).filter(Boolean),
  )
  if (allowed.has('faculty')) allowed.add('teacher')
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const user = session?.user ?? session?.data?.user
    if (!user?.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(user.role || '').trim().toLowerCase()
    if (!allowed.has(role)) {
      logUnauthorizedAccessFromRequest(req, {
        reason: `Requires one of: ${[...allowed].join(', ')}`,
        requiredRole: [...allowed].join('|'),
      })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied.' })
      return null
    }
    return session
  } catch (e) {
    console.error('[security] requireAnyRoleSession:', e?.message || e)
    res.status(500).json({ error: 'Internal server error' })
    return null
  }
}

/**
 * Destructive admin operations require explicit confirmation tokens (OWASP A08).
 * @param {import('express').Request} req
 * @param {string} expectedToken
 */
export function requireDestructiveConfirm(req, res, expectedToken) {
  const token = String(req.body?.confirm || '').trim()
  if (token !== expectedToken && req.body?.confirmed !== true) {
    res.status(400).json({
      error: 'CONFIRMATION_REQUIRED',
      message: `Confirmation required. Send { "confirm": "${expectedToken}" } in the request body.`,
    })
    return false
  }
  return true
}
