/** Build concise Event Data JSON for the Audit Logs eye-icon modal (display only). */

function trim(v) {
  const s = String(v ?? '').trim()
  return s || undefined
}

function person(name, email, role) {
  const out = {}
  const n = trim(name)
  const e = trim(email)
  const r = trim(role)
  if (n) out.name = n
  if (e) out.email = e
  if (r) out.role = r
  return Object.keys(out).length ? out : undefined
}

function pruneEmpty(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = pruneEmpty(v)
      if (nested && Object.keys(nested).length) out[k] = nested
    } else {
      out[k] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

function formatChangeValue(v) {
  if (v == null) return null
  if (v === '[redacted]' || v === '[changed]') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function extractChanges(detailedDiffs) {
  if (!detailedDiffs || typeof detailedDiffs !== 'object' || Array.isArray(detailedDiffs)) {
    return undefined
  }
  const out = {}
  for (const [field, diff] of Object.entries(detailedDiffs)) {
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) continue
    if (!('old' in diff) && !('new' in diff)) continue
    out[field] = {
      old: formatChangeValue(diff.old),
      new: formatChangeValue(diff.new),
    }
  }
  return Object.keys(out).length ? out : undefined
}

function mergeEventData(e) {
  const raw = e?.raw && typeof e.raw === 'object' ? e.raw : {}
  const base = e?.detailsObj || raw?.eventData || raw?.details || {}
  const payload = base?.payload && typeof base.payload === 'object' ? base.payload : {}
  return { raw, ed: { ...base, ...payload }, payload }
}

function resolveEventType(e, ed) {
  const activity = String(e?.activityType || ed?.activityType || '').toUpperCase()
  const authType = String(e?.eventType || ed?.eventType || ed?.type || rawType(e) || '').toLowerCase()
  if (activity === 'USER_ACCOUNT_CHANGED') return 'user_account_changed'
  if (activity === 'USER_SIGNED_IN') return 'user_signed_in'
  if (activity === 'USER_PROFILE_UPDATED') return 'profile_updated'
  return authType
}

function rawType(e) {
  return e?.raw?.eventType || e?.raw?.type || ''
}

function isAccountChangedType(type, activity) {
  return type === 'user_account_changed' || activity === 'USER_ACCOUNT_CHANGED'
}

function isUserCreatedType(type) {
  return type === 'user_created' || type === 'user_signed_up'
}

function isSessionFamilyType(type, activity) {
  if (
    type === 'session_created' ||
    type === 'user_signed_in' ||
    type === 'session_revoked' ||
    type === 'user_signed_out' ||
    type === 'user_sign_in_failed' ||
    type === 'login_failed'
  ) {
    return true
  }
  return (
    activity === 'USER_SIGNED_IN' ||
    activity === 'SESSION_CREATED' ||
    activity === 'SESSION_REVOKED'
  )
}

function formatAccountChanged(ed, e, eventLabel) {
  const actor = person(
    ed?.performed_by?.name || ed?.actorName || e?.actorName,
    ed?.performed_by?.email || ed?.actorEmail || e?.actorEmail,
    ed?.performed_by?.role || ed?.actorRole || 'admin',
  )
  const target = person(
    ed?.target_user?.name || ed?.targetName,
    ed?.target_user?.email || ed?.targetEmail,
    ed?.target_user?.role || ed?.targetRole || e?.userRole,
  )
  const changes = extractChanges(ed?.detailedDiffs)
  return pruneEmpty({
    event: eventLabel || 'Profile Updated (Account)',
    actor,
    target,
    changes,
  })
}

function formatUserCreated(ed, e, eventLabel) {
  const actor = person(
    ed?.performed_by?.name || ed?.actorName || e?.actorName,
    ed?.performed_by?.email || ed?.actorEmail || e?.actorEmail,
    ed?.actorRole || 'admin',
  )
  const created = person(
    ed?.target_user?.name || ed?.targetName || ed?.userName,
    ed?.target_user?.email || ed?.targetEmail || ed?.userEmail,
    ed?.target_user?.role || ed?.targetRole || e?.userRole,
  )
  return pruneEmpty({
    event: eventLabel || 'New User Registration',
    actor,
    created,
  })
}

function formatSessionFamily(ed, e, eventLabel) {
  const user = person(
    ed?.userName || ed?.targetName,
    ed?.userEmail || ed?.targetEmail,
    ed?.userRole || e?.userRole,
  )
  const loginMethod = trim(ed?.loginMethod || ed?.method)
  const sourceToken = String(ed?.source || '').toLowerCase()
  const context = trim(ed?.triggerContext || (sourceToken === 'admin' ? 'admin' : sourceToken ? sourceToken : 'user'))
  return pruneEmpty({
    event: eventLabel,
    user,
    ...(loginMethod ? { loginMethod } : {}),
    ...(context ? { context } : {}),
  })
}

const SKIP_DETAIL_KEYS = new Set([
  'userId',
  'targetUserId',
  'actorUserId',
  'triggeredBy',
  'studentRecordId',
  'sessionId',
  'projectId',
  'eventKey',
  'resourceId',
  'payload',
  'source',
  'triggerContext',
  'type',
  'eventType',
  'displayType',
  'updatedFields',
  'changed_fields',
  'detailedDiffs',
  'performed_by',
  'target_user',
])

function stripInternalFields(obj) {
  if (obj == null || typeof obj !== 'object') return undefined
  if (Array.isArray(obj)) {
    const arr = obj.map(stripInternalFields).filter((x) => x != null && x !== '')
    return arr.length ? arr : undefined
  }
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_DETAIL_KEYS.has(k)) continue
    if (/Id$/.test(k) || k.endsWith('_id')) continue
    if (v == null || v === '') continue
    if (typeof v === 'object') {
      const nested = stripInternalFields(v)
      if (nested && (typeof nested !== 'object' || Object.keys(nested).length)) out[k] = nested
    } else {
      out[k] = v
    }
  }
  return Object.keys(out).length ? out : undefined
}

function formatGeneric(ed, e, eventLabel) {
  const type = resolveEventType(e, ed)
  const changes = extractChanges(ed?.detailedDiffs)
  const actor = person(ed?.actorName || e?.actorName, ed?.actorEmail || e?.actorEmail, ed?.actorRole)
  const user = person(ed?.userName || ed?.targetName, ed?.userEmail || ed?.targetEmail, ed?.userRole || e?.userRole)
  const details = stripInternalFields(ed)

  if (type === 'profile_updated' || type === 'user_profile_updated') {
    return pruneEmpty({
      event: eventLabel,
      actor,
      target: user,
      changes,
    })
  }

  if (
    type.startsWith('password_reset') ||
    type === 'password_changed' ||
    type.startsWith('security_')
  ) {
    return pruneEmpty({
      event: eventLabel,
      user,
      ...(details ? { details } : {}),
    })
  }

  return pruneEmpty({
    event: eventLabel || type || 'Audit event',
    ...(user ? { user } : {}),
    ...(actor && !user ? { actor } : {}),
    ...(changes ? { changes } : {}),
    ...(details && !changes ? { details } : {}),
  })
}

/**
 * @param {Record<string, unknown>} e Normalized audit row from MonitoringRecords
 * @param {string} [eventDisplayName] Human-readable event title
 * @returns {string} Pretty-printed JSON for modal
 */
export function formatAuditModalEventDataJson(e, eventDisplayName = '') {
  const { ed } = mergeEventData(e)
  const activity = String(e?.activityType || ed?.activityType || '').toUpperCase()
  const type = resolveEventType(e, ed)
  const label = trim(eventDisplayName) || type || 'Audit event'

  let data
  if (isAccountChangedType(type, activity)) {
    data = formatAccountChanged(ed, e, label)
  } else if (isUserCreatedType(type)) {
    data = formatUserCreated(ed, e, label)
  } else if (isSessionFamilyType(type, activity)) {
    data = formatSessionFamily(ed, e, label)
  } else if (e?.source === 'lms') {
    const lmsUser = person(
      ed?.targetName || ed?.userName || (e?.userEmail || '').split(' (')[0],
      ed?.targetEmail || ed?.userEmail,
      ed?.userRole || e?.userRole,
    )
    const details = stripInternalFields(ed)
    data = pruneEmpty({
      event: label,
      user: lmsUser,
      ...(details ? { details } : {}),
    })
  } else {
    data = formatGeneric(ed, e, label)
  }

  try {
    return JSON.stringify(data || {}, null, 2)
  } catch {
    return '{}'
  }
}
