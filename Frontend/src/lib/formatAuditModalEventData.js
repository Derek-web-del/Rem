/** Build concise Event Data JSON for the Audit Logs eye-icon modal (display only). */

import {
  isGradeCriteriaAuditEvent,
  resolveGradeCriteriaAuditDisplay,
} from '../../../shared/gradeCriteriaAudit.js'
import { normalizeInstituteAdminDisplayName } from './instituteAdminDisplay.js'

function trim(v) {
  const s = String(v ?? '').trim()
  return s || undefined
}

function person(name, email, role) {
  const out = {}
  const n = trim(normalizeInstituteAdminDisplayName(name, email))
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
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.map((item) => formatChangeValue(item)).join(', ')
    const parts = Object.entries(v)
      .filter(([, val]) => val != null && val !== '')
      .map(([key, val]) => `${key}: ${formatChangeValue(val)}`)
    return parts.length ? parts.join('; ') : JSON.stringify(v)
  }
  return String(v)
}

function extractChanges(detailedDiffs) {
  if (!detailedDiffs || typeof detailedDiffs !== 'object' || Array.isArray(detailedDiffs)) {
    return undefined
  }
  const out = {}
  for (const [field, diff] of Object.entries(detailedDiffs)) {
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) continue
    const oldVal = diff.old ?? diff.before
    const newVal = diff.new ?? diff.after
    if (oldVal === undefined && newVal === undefined) continue
    out[field] = {
      old: formatChangeValue(oldVal),
      new: formatChangeValue(newVal),
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
  if (activity === 'USER_SIGNED_IN' || activity === 'LOGIN') return 'user_signed_in'
  if (activity === 'TERMS_ACCEPTED') return 'terms_accepted'
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

function isSectionEventType(type, activity) {
  const t = String(activity || type || '').toUpperCase()
  return t === 'SECTION_CREATED' || t === 'SECTION_UPDATED' || t === 'SECTION_DELETED'
}

function isSubjectEventType(type, activity) {
  const t = String(activity || type || '').toUpperCase()
  return t === 'SUBJECT_CREATED' || t === 'SUBJECT_UPDATED' || t === 'SUBJECT_DELETED'
}

function isAnnouncementInstituteEventType(type, activity) {
  const t = String(activity || type || '').toUpperCase()
  return t === 'ANNOUNCEMENT_CREATED' || t === 'ANNOUNCEMENT_UPDATED' || t === 'ANNOUNCEMENT_DELETED'
}

function formatSectionEvent(ed, e, eventLabel) {
  const changes = extractChanges(ed?.detailedDiffs)
  const actor = person(
    ed?.actorName || e?.actorName,
    ed?.actorEmail || e?.actorEmail,
    ed?.actorRole || 'admin',
  )
  const record = pruneEmpty({
    type: trim(ed?.recordType) || 'section',
    id: trim(ed?.recordId),
    sectionName: trim(ed?.sectionName || ed?.section_name || ed?.name),
    gradeLevel: trim(ed?.gradeLevel || ed?.grade_level || ed?.grade),
  })
  const deletedSnapshot =
    ed?.deletedSnapshot && typeof ed.deletedSnapshot === 'object' ? ed.deletedSnapshot : undefined
  return pruneEmpty({
    event: eventLabel,
    actor,
    record,
    ...(changes ? { changes } : {}),
    ...(deletedSnapshot && !changes ? { deleted: deletedSnapshot } : {}),
    ...(trim(ed?.description) ? { description: trim(ed.description) } : {}),
  })
}

function isCurriculumEventType(type, activity) {
  const t = String(activity || type || '').toUpperCase()
  return (
    t === 'CURRICULUM_CREATED' ||
    t === 'CURRICULUM_UPLOADED' ||
    t === 'CURRICULUM_UPDATED' ||
    t === 'CURRICULUM_DELETED'
  )
}

function formatCurriculumEvent(ed, e, eventLabel) {
  const changes = extractChanges(ed?.detailedDiffs)
  const actor = person(
    ed?.actorName || e?.actorName,
    ed?.actorEmail || e?.actorEmail,
    ed?.actorRole || 'admin',
  )
  const record = pruneEmpty({
    type: trim(ed?.recordType) || 'curriculum',
    id: trim(ed?.recordId),
    subject: trim(ed?.subject),
    gradeLevel: trim(ed?.gradeLevel || ed?.grade_level),
    fileName: trim(ed?.fileName || ed?.file_name),
  })
  const deletedSnapshot =
    ed?.deletedSnapshot && typeof ed.deletedSnapshot === 'object' ? ed.deletedSnapshot : undefined
  return pruneEmpty({
    event: eventLabel,
    actor,
    record,
    ...(changes ? { changes } : {}),
    ...(deletedSnapshot && !changes ? { deleted: deletedSnapshot } : {}),
    ...(trim(ed?.description) ? { description: trim(ed.description) } : {}),
  })
}

function formatSubjectEvent(ed, e, eventLabel) {
  const changes = extractChanges(ed?.detailedDiffs)
  const actor = person(
    ed?.actorName || e?.actorName,
    ed?.actorEmail || e?.actorEmail,
    ed?.actorRole || 'admin',
  )
  const record = pruneEmpty({
    type: trim(ed?.recordType) || 'subject',
    id: trim(ed?.recordId),
    subjectCode: trim(ed?.subjectCode || ed?.subject_code),
    subjectName: trim(ed?.subjectName || ed?.subject_name),
    gradeLevel: trim(ed?.gradeLevel || ed?.grade_level),
    semester: trim(ed?.semester),
    facultyName: trim(ed?.facultyName || ed?.faculty_name),
  })
  const deletedSnapshot =
    ed?.deletedSnapshot && typeof ed.deletedSnapshot === 'object' ? ed.deletedSnapshot : undefined
  return pruneEmpty({
    event: eventLabel,
    actor,
    record,
    ...(changes ? { changes } : {}),
    ...(deletedSnapshot && !changes ? { deleted: deletedSnapshot } : {}),
    ...(trim(ed?.description) ? { description: trim(ed.description) } : {}),
  })
}

function isGradeCriteriaEventType(type, ed, activity = '') {
  return isGradeCriteriaAuditEvent({
    event_type: type || ed?.event_type,
    eventType: ed?.eventType || type,
    type: ed?.type,
    activityType: activity || ed?.activityType,
  })
}

function formatGradeCriteriaEvent(ed, e, eventLabel) {
  const normalized = resolveGradeCriteriaAuditDisplay({
    event_type: ed?.event_type,
    eventType: ed?.eventType || e?.eventType,
    type: ed?.type || e?.type,
    activityType: ed?.activityType || e?.activityType,
    old_values: ed?.old_values,
    new_values: ed?.new_values,
    detailedDiffs: ed?.detailedDiffs,
    changed_fields: ed?.changed_fields,
  })
  const displayEd = normalized
    ? {
        ...ed,
        old_values: normalized.old_values,
        new_values: normalized.new_values,
        changed_fields: normalized.changed_fields,
        detailedDiffs: normalized.detailedDiffs,
      }
    : ed
  const changes = extractChanges(displayEd?.detailedDiffs)
  const teacher = person(
    ed?.performed_by_name || ed?.userName || e?.actorName,
    ed?.userEmail || e?.actorEmail,
    ed?.role || 'teacher',
  )
  return pruneEmpty({
    event: eventLabel,
    teacher,
    subject: trim(ed?.target_label),
    ...(changes ? { changes } : {}),
    ...(trim(ed?.summary) ? { summary: trim(ed.summary) } : {}),
  })
}

function formatAnnouncementInstituteEvent(ed, e, eventLabel) {
  const changes = extractChanges(ed?.detailedDiffs)
  const actor = person(
    ed?.actorName || e?.actorName,
    ed?.actorEmail || e?.actorEmail,
    ed?.actorRole || 'admin',
  )
  const record = pruneEmpty({
    type: trim(ed?.recordType) || 'announcement',
    id: trim(ed?.recordId),
    title: trim(ed?.title),
    announcementType: trim(ed?.announcementType || ed?.type),
  })
  const deletedSnapshot =
    ed?.deletedSnapshot && typeof ed.deletedSnapshot === 'object' ? ed.deletedSnapshot : undefined
  return pruneEmpty({
    event: eventLabel,
    actor,
    record,
    ...(changes ? { changes } : {}),
    ...(deletedSnapshot && !changes ? { deleted: deletedSnapshot } : {}),
    ...(trim(ed?.description) ? { description: trim(ed.description) } : {}),
  })
}

function isLoginSecurityType(type, activity) {
  return (
    type === 'auth_lockout' ||
    type === 'login_failed' ||
    activity === 'AUTH_LOCKOUT' ||
    activity === 'LOGIN_FAILED'
  )
}

function loginSecurityPortalLabel(ed) {
  if (ed?.portalLabel) return trim(ed.portalLabel)
  if (ed?.portal === 'admin') return 'Admin portal'
  if (ed?.portal === 'faculty') return 'Faculty portal'
  if (ed?.portal === 'student') return 'Student portal'
  return trim(ed?.portal)
}

function formatLoginSecurityEvent(ed, e, eventLabel) {
  const activity = String(e?.activityType || ed?.activityType || '').toUpperCase()
  const portal = loginSecurityPortalLabel(ed)
  return pruneEmpty({
    event: eventLabel || (activity === 'AUTH_LOCKOUT' ? 'Account Lockout' : 'Sign In Failed'),
    suspiciousLoginDetected: ed?.suspiciousLoginDetected === true ? true : undefined,
    account: pruneEmpty({
      userId: trim(ed?.targetUserId || e?.userId),
      username: trim(ed?.username),
      loginId: trim(ed?.loginId || ed?.identifier),
      type: trim(ed?.accountType),
    }),
    portal,
    attempts: ed?.attempts != null ? Number(ed.attempts) : undefined,
    maxAttempts: ed?.maxAttempts != null ? Number(ed.maxAttempts) : undefined,
    lockedUntil: trim(ed?.lockedUntil),
    reason: trim(ed?.reason),
    duringLockout: ed?.duringLockout === true ? true : undefined,
    device: trim(ed?.userAgent),
  })
}

function isTermsAcceptedType(type, activity) {
  return type === 'terms_accepted' || activity === 'TERMS_ACCEPTED'
}

function formatTermsAccepted(ed, e, eventLabel) {
  const portal =
    ed?.portal === 'admin'
      ? 'Admin portal'
      : ed?.portal === 'faculty'
        ? 'Faculty portal'
        : ed?.portal === 'student'
          ? 'Student portal'
          : trim(ed?.portal)
  const user = person(ed?.userName, ed?.userEmail, ed?.userRole || e?.userRole)
  return pruneEmpty({
    event: eventLabel || 'Terms & Conditions Accepted',
    user,
    portal,
    acceptedAt: trim(ed?.acceptedAt),
    description: trim(ed?.description),
  })
}

function isSessionFamilyType(type, activity) {
  if (
    type === 'session_created' ||
    type === 'user_signed_in' ||
    type === 'login' ||
    type === 'session_revoked' ||
    type === 'user_signed_out' ||
    type === 'user_sign_in_failed' ||
    type === 'login_failed'
  ) {
    return true
  }
  return (
    activity === 'USER_SIGNED_IN' ||
    activity === 'USER_SESSION_STARTED' ||
    activity === 'SESSION_CREATED' ||
    activity === 'SESSION_REVOKED' ||
    activity === 'LOGIN'
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
  const loginMethod = trim(ed?.loginMethod || ed?.login_method || ed?.method)
  const userAgent = trim(ed?.userAgent || ed?.user_agent)
  const sourceToken = String(ed?.source || '').toLowerCase()
  const context = trim(ed?.triggerContext || (sourceToken === 'admin' ? 'admin' : sourceToken ? sourceToken : 'user'))
  return pruneEmpty({
    event: eventLabel,
    user,
    ...(loginMethod ? { loginMethod } : {}),
    ...(userAgent ? { device: userAgent } : {}),
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
  'old_values',
  'new_values',
  'criteria',
  'components',
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
  } else if (isLoginSecurityType(type, activity)) {
    data = formatLoginSecurityEvent(ed, e, label)
  } else if (isTermsAcceptedType(type, activity)) {
    data = formatTermsAccepted(ed, e, label)
  } else if (isCurriculumEventType(type, activity)) {
    data = formatCurriculumEvent(ed, e, label)
  } else if (isSectionEventType(type, activity)) {
    data = formatSectionEvent(ed, e, label)
  } else if (isSubjectEventType(type, activity)) {
    data = formatSubjectEvent(ed, e, label)
  } else if (isGradeCriteriaEventType(type, ed, activity)) {
    data = formatGradeCriteriaEvent(ed, e, label)
  } else if (isAnnouncementInstituteEventType(type, activity)) {
    data = formatAnnouncementInstituteEvent(ed, e, label)
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
