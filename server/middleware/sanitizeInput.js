import { customActivityLogger } from '../services/CustomActivityLogger.js'

/** Internal / session / static / large binary — never scan (avoids false positives). */
const NON_AUDITABLE_PATH_PATTERNS = [
  '/v1/state',
  '/api/v1/state',
  '/api/monitoring/audit-statistics',
  '/api/backup',
  '/api/auth/session',
  '/api/auth/get-session',
  '/api/auth/refresh',
  '/api/auth/token',
  '/api/auth/two-factor',
  '/api/auth/admin',
  '/api/lms/admin',
  '/api/debug',
  '/api/health',
  '/_next',
  '/static',
  '/favicon',
  '/uploads/',
]

const SKIP_FIELDS = new Set([
  'photo',
  'photo_url',
  'photoDataUrl',
  'photo_data_url',
  'image',
  'imageDataUrl',
  'announcement_image',
  'adminAvatarDataUrl',
  'avatar',
  'token',
  'sessionId',
  'id',
  'userId',
  'authUserId',
  'auth_user_id',
  'timestamp',
  'createdAt',
  'updatedAt',
  'state',
  'json',
])

const DANGEROUS_PATTERNS = [
  // SQL injection (OWASP A03)
  /'\s*(OR|AND)\s*'?\d/gi,
  /'\s*(OR|AND)\s*\d+\s*=\s*\d/gi,
  /--/g,
  /\/\*/g,
  /;\s*(DROP|DELETE|TRUNCATE)/gi,
  /UNION\s+SELECT/gi,
  /INSERT\s+INTO/gi,
  /SELECT\s+\*\s+FROM/gi,
  /xp_\w+/gi,
  /'\s*;\s*/g,
  /0x[0-9a-f]{4,}/gi,
  // XSS (OWASP A03)
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /\bon\w+\s*=/gi,
  /<iframe/gi,
  // Path traversal (OWASP A03 / A10)
  /\.\.\//g,
  /\.\.\\/g,
]

/**
 * @param {import('express').Request} req
 */
export function requestPath(req) {
  return String(req.originalUrl || req.path || '').split('?')[0]
}

export function isNonAuditablePath(path) {
  const p = String(path || '')
  return NON_AUDITABLE_PATH_PATTERNS.some((ep) => p.includes(ep))
}

/** True when the request should be scanned (all /api routes except the skip list). */
export function isAuditablePath(path) {
  const p = String(path || '')
  if (isNonAuditablePath(p)) return false
  return p.startsWith('/api')
}

/**
 * Long data URLs / base64 blobs / upload paths are not SQL injection probes.
 * @param {unknown} value
 */
export function isBase64OrBinaryPayload(value) {
  if (typeof value !== 'string') return false
  const t = value.trim()
  if (t.length < 64) return false
  if (t.startsWith('data:image/') || t.startsWith('data:application/')) return true
  if (t.startsWith('/uploads/')) return true
  if (t.length >= 200 && /^[A-Za-z0-9+/=\r\n_-]+$/.test(t)) return true
  return false
}

/**
 * True when input looks like a combined SQL injection probe (not isolated English words).
 * @param {unknown} input
 */
export function isSuspicious(input) {
  if (typeof input !== 'string') return false
  if (isBase64OrBinaryPayload(input)) return false
  return DANGEROUS_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(input)
  })
}

/**
 * @param {Record<string, unknown> | unknown[] | null | undefined} obj
 * @param {{ field?: string, value?: string }} hit
 */
function checkObject(obj, hit) {
  if (!obj || typeof obj !== 'object') return false

  const entries = Array.isArray(obj)
    ? obj.map((value, index) => [String(index), value])
    : Object.entries(obj)

  for (const [key, value] of entries) {
    if (!Array.isArray(obj) && SKIP_FIELDS.has(key)) continue

    if (typeof value === 'string') {
      if (isBase64OrBinaryPayload(value)) continue
      if (isSuspicious(value)) {
        hit.field = key
        hit.value = value
        return true
      }
      continue
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i]
        if (typeof item === 'string') {
          if (isBase64OrBinaryPayload(item)) continue
          if (isSuspicious(item)) {
            hit.field = `${key}[${i}]`
            hit.value = item
            return true
          }
        } else if (item && typeof item === 'object' && checkObject(item, hit)) {
          hit.field = `${key}[${i}].${hit.field || ''}`
          return true
        }
      }
      continue
    }

    if (value && typeof value === 'object' && checkObject(value, hit)) {
      hit.field = Array.isArray(obj) ? hit.field : `${key}.${hit.field || ''}`
      return true
    }
  }

  return false
}

/**
 * Express middleware: block SQLi/XSS probes on /api routes (except NON_AUDITABLE skip list).
 * Covers student write paths (/api/v1/student/*), teacher routes, auth sign-in, etc.
 */
export default function sanitizeInput(req, res, next) {
  const path = requestPath(req)

  if (!isAuditablePath(path)) {
    return next()
  }

  const hit = { field: '', value: '' }
  const suspicious =
    checkObject(req.body, hit) || checkObject(req.query, hit) || checkObject(req.params, hit)

  if (!suspicious) {
    return next()
  }

  console.warn('[SECURITY] Real injection attempt on field:', hit.field, 'path:', path)

  void customActivityLogger
    .logSuspiciousInput({
      endpoint: path,
      method: req.method || '',
      ipAddress: req.ip || '',
      sample: `${hit.field}: ${String(hit.value || '').slice(0, 200)}`,
    })
    .catch((err) => {
      console.warn('[sanitizeInput] audit log failed:', err?.message || err)
    })

  return res.status(400).json({
    error: 'Invalid input detected.',
  })
}
