/** LMS auth-account profile row label (faculty / Better Auth user). */
export const PROFILE_UPDATE_DISPLAY_TYPE = 'Profile updated (account)'

/** Institute admin student roster update — matches auth Events dropdown. */
export const AUTH_PROFILE_UPDATE_DISPLAY_TYPE = 'User updates their profile'

/** Custom LMS / audit_logs event token with explicit field-level diffs. */
export const USER_ACCOUNT_CHANGED_EVENT_TYPE = 'user_account_changed'

export const USER_ACCOUNT_CHANGED_DISPLAY = 'Profile Updated (Account)'

const SENSITIVE_FIELD_KEYS = new Set(['password', 'currentpassword', 'token', 'csrftoken', 'csrf'])

/** Human-readable labels for Better Auth `user` row fields (admin / self update-user). */
const AUTH_USER_FIELD_LABELS = {
  name: 'Display name',
  email: 'Email',
  username: 'Username',
  displayUsername: 'Display username',
  twoFactorEnabled: 'Two-factor authentication',
  image: 'Profile photo',
  facultyQualification: 'Faculty qualification',
  facultyContactNumber: 'Faculty contact number',
  emailVerified: 'Email verified',
  role: 'Account role',
}

export function normalizeAuthPath(path) {
  return String(path || '').replace(/\\/g, '/')
}

export function isAdminUserUpdatePath(pathNorm) {
  return pathNorm.includes('/admin/update-user')
}

export function isSelfUserUpdatePath(pathNorm) {
  return pathNorm.endsWith('/update-user') && !isAdminUserUpdatePath(pathNorm)
}

export function isAnyUserUpdatePath(pathNorm) {
  return isAdminUserUpdatePath(pathNorm) || isSelfUserUpdatePath(pathNorm)
}

function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function normBool(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return '1'
  if (v === false || v === 0 || v === '0' || v === 'false') return '0'
  return normStr(v)
}

function fieldValuesEqual(beforeVal, afterVal) {
  if (beforeVal === afterVal) return true
  if (beforeVal == null && afterVal == null) return true
  if (beforeVal instanceof Date || afterVal instanceof Date) {
    return new Date(beforeVal).getTime() === new Date(afterVal).getTime()
  }
  if (typeof beforeVal === 'object' || typeof afterVal === 'object') {
    try {
      return JSON.stringify(beforeVal) === JSON.stringify(afterVal)
    } catch {
      return false
    }
  }
  return String(beforeVal) === String(afterVal)
}

function authFieldValuesEqual(key, beforeVal, afterVal) {
  const low = String(key).toLowerCase()
  if (low === 'twofactorenabled' || low === 'emailverified') {
    return normBool(beforeVal) === normBool(afterVal)
  }
  if (low === 'image') {
    return normStr(beforeVal) === normStr(afterVal)
  }
  return fieldValuesEqual(beforeVal, afterVal)
}

function labelForAuthField(key) {
  return AUTH_USER_FIELD_LABELS[key] || AUTH_USER_FIELD_LABELS[String(key)] || String(key)
}

/**
 * Compare persisted user row with incoming patch; return keys that actually changed.
 * @param {Record<string, unknown> | null | undefined} beforeUser
 * @param {Record<string, unknown> | null | undefined} patch
 */
export function computeChangedUserFields(beforeUser, patch) {
  return computeAuthProfileUpdatedFields(beforeUser, patch, { rawKeys: true })
}

/**
 * Compare Better Auth user row with admin/self update patch; returns human-readable field labels.
 * @param {Record<string, unknown> | null | undefined} beforeUser
 * @param {Record<string, unknown> | null | undefined} patch
 * @param {{ rawKeys?: boolean }} [opts]
 */
function serializeDiffValue(v, key) {
  const low = String(key).toLowerCase()
  if (SENSITIVE_FIELD_KEYS.has(low) || low.includes('password')) return '[redacted]'
  if (low === 'image' && typeof v === 'string' && v.length > 120) {
    return `${v.slice(0, 80)}… (${v.length} chars)`
  }
  if (v instanceof Date) return v.toISOString()
  if (v == null) return null
  return v
}

/**
 * Field-level old/new map for `user_account_changed` audit payloads.
 * @returns {Record<string, { old: unknown, new: unknown }>}
 */
export function computeAuthProfileDetailedDiffs(beforeUser, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {}
  const before =
    beforeUser && typeof beforeUser === 'object' && !Array.isArray(beforeUser) ? beforeUser : {}
  /** @type {Record<string, { old: unknown, new: unknown }>} */
  const changedFields = {}
  for (const [key, newVal] of Object.entries(patch)) {
    const low = String(key).toLowerCase()
    if (SENSITIVE_FIELD_KEYS.has(low) || low.includes('password')) continue
    if (newVal === undefined) continue
    if (!authFieldValuesEqual(key, before[key], newVal)) {
      changedFields[key] = {
        old: serializeDiffValue(before[key], key),
        new: serializeDiffValue(newVal, key),
      }
    }
  }
  return changedFields
}

export function computeAuthProfileUpdatedFields(beforeUser, patch, opts = {}) {
  const detailed = computeAuthProfileDetailedDiffs(beforeUser, patch)
  return Object.keys(detailed).map((key) => (opts.rawKeys ? key : labelForAuthField(key)))
}

export function parseUpdatedFieldsArray(details) {
  if (!details || typeof details !== 'object') return []
  const raw = details.updatedFields
  if (Array.isArray(raw)) return raw.map((f) => String(f)).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((f) => String(f)).filter(Boolean)
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

/**
 * Resolve target id + patch object from a Better Auth update-user request.
 */
export function resolveProfileUpdateRequest(pathNorm, body, sessionUserId) {
  if (isAdminUserUpdatePath(pathNorm)) {
    const b = body && typeof body === 'object' ? body : {}
    const targetId = b.userId != null ? String(b.userId).trim() : ''
    const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : {}
    return { targetId, patch: data, source: 'admin' }
  }
  if (isSelfUserUpdatePath(pathNorm)) {
    const uid = sessionUserId != null ? String(sessionUserId).trim() : ''
    const patch = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
    return { targetId: uid, patch, source: 'user' }
  }
  return { targetId: '', patch: {}, source: 'user' }
}
