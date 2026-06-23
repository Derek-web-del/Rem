/** Map public.audit_logs.type → unified Monitoring Records labels. */

export const LEDGER_EVENT_DISPLAY = {
  LOGIN: 'Login',
  AUTH_LOCKOUT: 'Account Lockout',
  TERMS_ACCEPTED: 'Terms & Conditions Accepted',
  GRADE_OVERRIDE: 'Grade override',
  CURRICULUM_CREATED: 'Curriculum uploaded',
  CURRICULUM_UPLOADED: 'Curriculum uploaded',
  CURRICULUM_UPDATED: 'Curriculum updated',
  CURRICULUM_DELETED: 'Curriculum deleted',
  SECTION_CREATED: 'Section created',
  SECTION_UPDATED: 'Section updated',
  SECTION_DELETED: 'Section deleted',
  user_account_changed: 'Profile Updated (Account)',
}

/** Ledger types that must never be shown as profile/account-changed events. */
export const NON_PROFILE_LEDGER_TYPES = new Set([
  'LOGIN',
  'AUTH_LOCKOUT',
  'TERMS_ACCEPTED',
  'USER_SIGNED_IN',
  'USER_SESSION_STARTED',
  'LOGIN_FAILED',
])

/**
 * @param {string | null | undefined} ledgerType
 * @returns {string}
 */
export function ledgerTypeToActivityType(ledgerType) {
  const t = String(ledgerType || '').trim().toUpperCase()
  if (t === 'LOGIN') return 'USER_SIGNED_IN'
  if (t === 'AUTH_LOCKOUT') return 'AUTH_LOCKOUT'
  if (t === 'TERMS_ACCEPTED') return 'TERMS_ACCEPTED'
  if (t === 'USER_ACCOUNT_CHANGED') return 'USER_ACCOUNT_CHANGED'
  return t || ''
}

/**
 * @param {string | null | undefined} ledgerType
 * @param {string | null | undefined} [payloadDisplayType]
 * @returns {string}
 */
export function resolveLedgerDisplayType(ledgerType, payloadDisplayType = '') {
  const custom = String(payloadDisplayType || '').trim()
  if (custom) return custom
  const key = String(ledgerType || '').trim()
  if (LEDGER_EVENT_DISPLAY[key]) return LEDGER_EVENT_DISPLAY[key]
  if (key) return key.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  return 'Audit event'
}

/**
 * @param {string | null | undefined} token
 * @returns {boolean}
 */
export function isNonProfileLedgerType(token) {
  const t = String(token || '').trim().toUpperCase()
  return NON_PROFILE_LEDGER_TYPES.has(t)
}
