/** Audit UI noise: role + code-ID labels (not shown in Monitoring Records). */
const ADMIN_SIGNIN_NOISE = 'Administrator · Sign-in ID: admin'
const ADMIN_SIGNIN_NOISE_RE = /Administrator\s*·\s*Sign-in ID:\s*admin/gi
const RBAC_CODE_ID_NOISE_RE =
  /(?:Administrator|Faculty|Student)\s*·\s*(?:Sign-in ID|Faculty Code ID|Student Code ID):\s*[^\s—•·]+/gi
const TRAILING_EDGE_RE = /^[—\s•·]+|[—\s•·]+$/g

/**
 * Strip institute-admin sign-in boilerplate from a single text field.
 * @param {unknown} value
 * @returns {unknown}
 */
export function cleanAuditDescription(value) {
  if (value == null) return value
  if (typeof value !== 'string') return value
  return value
    .replace(ADMIN_SIGNIN_NOISE_RE, '')
    .replace(RBAC_CODE_ID_NOISE_RE, '')
    .replace(ADMIN_SIGNIN_NOISE, '')
    .replace(TRAILING_EDGE_RE, '')
    .trim()
}

/**
 * Deep-clean audit event payloads (description, eventData, details, etc.).
 * @param {unknown} value
 * @returns {unknown}
 */
export function cleanAuditPayload(value) {
  if (value == null) return value
  if (typeof value === 'string') return cleanAuditDescription(value)
  if (Array.isArray(value)) return value.map((item) => cleanAuditPayload(item))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, nested] of Object.entries(value)) {
      out[key] = cleanAuditPayload(nested)
    }
    return out
  }
  return value
}

/**
 * @param {Record<string, unknown> | null | undefined} log
 */
export function cleanAuditLogRow(log) {
  if (!log || typeof log !== 'object') return log
  return cleanAuditPayload(log)
}

/**
 * @param {unknown[]} events
 */
export function cleanAuditLogEvents(events) {
  if (!Array.isArray(events)) return events
  return events.map((e) => cleanAuditLogRow(e))
}
