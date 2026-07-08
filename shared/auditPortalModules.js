/** Portal sidebar module labels shown in Audit Logs. */

export const TEACHER_PORTAL_MODULES = {
  DASHBOARD: 'Dashboard',
  CURRICULUM: 'Curriculum',
  SECTION: 'Section',
  SUBJECTS: 'Subjects',
  ASSIGNMENTS: 'Assignments',
  ACTIVITIES: 'Activities',
  ANNOUNCEMENTS: 'Announcements',
  QUIZ_MAKER: 'Quiz Maker',
  GRADES: 'Grades',
  AI_CHECKER: 'AI-Checker',
  STUDY_MATERIALS: 'Study Materials',
}

export const STUDENT_PORTAL_MODULES = {
  DASHBOARD: 'Dashboard',
  SUBJECTS: 'Subjects',
  ASSIGNMENTS: 'Assignments',
  ACTIVITIES: 'Activities',
  QUIZZES: 'Quizzes',
  ANNOUNCEMENT: 'Announcement',
  STUDY_MATERIALS: 'Study Materials',
}

export const ADMIN_PORTAL_MODULES = {
  DASHBOARD: 'Dashboard',
  CURRICULUM: 'Curriculum',
  SECTION: 'Section',
  STUDENTS: 'Students',
  FACULTIES: 'Faculties',
  SUBJECTS: 'Subjects',
  ANNOUNCEMENTS: 'Announcements',
  AUDIT_LOGS: 'Audit Logs',
  DATA_BACKUP: 'Data Backup',
  ARCHIVE_VAULT: 'Archive Vault',
  TERMS_AND_CONDITIONS: 'Terms & Conditions',
}

/** Shared Legal Center module label (all portals). */
export const TERMS_AND_CONDITIONS_MODULE = 'Terms & Conditions'

/** Audit Logs module for sign-in, sign-out, and session lifecycle events (all portals). */
export const LOGIN_MODULE = 'Login'

export function loginAuditModule() {
  return LOGIN_MODULE
}

export function termsAndConditionsModule() {
  return TERMS_AND_CONDITIONS_MODULE
}

const SIGN_IN_ACTIVITY_TYPES = new Set(['USER_SIGNED_IN', 'LOGIN'])
const SIGN_IN_EVENT_TYPES = new Set(['user_signed_in', 'login'])

export function isSignInAuditActivity(activityType) {
  return SIGN_IN_ACTIVITY_TYPES.has(String(activityType || '').trim().toUpperCase())
}

export function isSignInAuditEventType(eventType) {
  return SIGN_IN_EVENT_TYPES.has(String(eventType || '').trim().toLowerCase())
}

export function isLoginAuditActivity(activityType) {
  return (
    isSignInAuditActivity(activityType) || isSessionOnlyAuditActivity(activityType)
  )
}

export function isSessionOnlyAuditActivity(activityType) {
  const activity = String(activityType || '').trim().toUpperCase()
  return activity === 'USER_SESSION_STARTED' || activity === 'SESSION_CREATED'
}

export function isSessionOnlyAuditEventType(eventType) {
  const type = String(eventType || '').trim().toLowerCase()
  return type === 'session_created'
}

export function isLoginAuditEventType(eventType) {
  const type = String(eventType || '').trim().toLowerCase()
  return isSignInAuditEventType(type) || isSessionOnlyAuditEventType(type)
}

export function isSessionAuditActivity(activityType) {
  return isSessionOnlyAuditActivity(activityType)
}

export function isSessionAuditEventType(eventType) {
  return isSessionOnlyAuditEventType(eventType) || String(eventType || '').trim().toLowerCase() === 'session_revoked'
}

const LOGIN_MODULE_ACTIVITIES = new Set([
  'USER_SIGNED_IN',
  'LOGIN',
  'USER_SIGNED_OUT',
  'USER_SESSION_STARTED',
  'SESSION_CREATED',
  'SESSION_REVOKED',
])

const LOGIN_MODULE_EVENT_TYPES = new Set([
  'user_signed_in',
  'login',
  'user_signed_out',
  'session_created',
  'session_revoked',
])

export function isLoginModuleAuditActivity(activityType) {
  return LOGIN_MODULE_ACTIVITIES.has(String(activityType || '').trim().toUpperCase())
}

export function isLoginModuleAuditEventType(eventType) {
  return LOGIN_MODULE_EVENT_TYPES.has(String(eventType || '').trim().toLowerCase())
}

const DASHBOARD_MODULE_LABELS = new Set([
  ADMIN_PORTAL_MODULES.DASHBOARD,
  TEACHER_PORTAL_MODULES.DASHBOARD,
  STUDENT_PORTAL_MODULES.DASHBOARD,
  'Dashboard',
])

/**
 * Resolve admin portal module for user_account_changed events.
 * @param {{ targetRole?: string, studentRecordId?: number|null }} ctx
 * @returns {string}
 */
export function resolveAccountChangedModule({ targetRole = '', studentRecordId = null } = {}) {
  const role = normalizeRole(targetRole)
  if (studentRecordId != null || role === 'student') return ADMIN_PORTAL_MODULES.STUDENTS
  if (role === 'teacher' || role === 'faculty') return ADMIN_PORTAL_MODULES.FACULTIES
  return ADMIN_PORTAL_MODULES.DASHBOARD
}

/** Legacy stored module values → canonical portal label (teacher-oriented). */
const MODULE_LEGACY_ALIASES = {
  'Subject Modules': TEACHER_PORTAL_MODULES.SUBJECTS,
  'Plagiarism Checker': TEACHER_PORTAL_MODULES.AI_CHECKER,
}

const SUBJECTS_EVENT_TYPES = new Set([
  'module_created',
  'module_renamed',
  'module_deleted',
  'topic_created',
  'topic_renamed',
  'topic_deleted',
  'item_moved',
  'lesson_created',
  'lesson_updated',
  'lesson_deleted',
])

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase()
  if (r === 'faculty') return 'teacher'
  return r
}

function pickEventDetails(event) {
  return event?.detailsObj || event?.raw?.eventData || event?.raw?.details || {}
}

function pickActivityType(event) {
  const ed = pickEventDetails(event)
  return String(
    event?.activityType || ed?.activityType || event?.raw?.activityType || '',
  )
    .trim()
    .toUpperCase()
}

function pickEventType(event) {
  const ed = pickEventDetails(event)
  return String(
    ed?.event_type || event?.eventType || ed?.eventType || ed?.type || event?.raw?.type || '',
  )
    .trim()
    .toLowerCase()
}

function pickUserRole(event) {
  const ed = pickEventDetails(event)
  return normalizeRole(
    event?.userRole || ed?.userRole || ed?.role || ed?.actorRole || event?.raw?.userRole || '',
  )
}

export function isLoginModuleAuditEvent(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)
  return (
    isLoginModuleAuditActivity(activity) ||
    isLoginModuleAuditEventType(eventType) ||
    isLoginModuleAuditActivity(String(ed?.activityType || '').trim().toUpperCase()) ||
    isLoginModuleAuditEventType(String(ed?.eventType || ed?.type || '').trim().toLowerCase())
  )
}

export function dashboardModuleForRole(role) {
  const r = normalizeRole(role)
  if (r === 'student') return STUDENT_PORTAL_MODULES.DASHBOARD
  if (r === 'admin') return ADMIN_PORTAL_MODULES.DASHBOARD
  return TEACHER_PORTAL_MODULES.DASHBOARD
}

/**
 * Map institute admin LMS activity types to admin portal sidebar modules.
 * @param {string} activityType
 * @returns {string|null}
 */
export function resolveInstituteActivityModule(activityType) {
  const activity = String(activityType || '').trim().toUpperCase()
  if (!activity) return null

  if (activity.startsWith('CURRICULUM_')) return ADMIN_PORTAL_MODULES.CURRICULUM
  if (activity.startsWith('SECTION_')) return ADMIN_PORTAL_MODULES.SECTION
  if (activity.startsWith('SUBJECT_')) return ADMIN_PORTAL_MODULES.SUBJECTS
  if (activity.startsWith('STUDENT_')) {
    if (
      activity === 'STUDENT_RESTORED' ||
      activity === 'STUDENT_PERMANENTLY_PURGED' ||
      activity === 'STUDENT_IMMEDIATELY_PURGED'
    ) {
      return ADMIN_PORTAL_MODULES.ARCHIVE_VAULT
    }
    return ADMIN_PORTAL_MODULES.STUDENTS
  }
  if (activity.startsWith('FACULTY_') || activity === 'FACULTY_ADVISORY_SECTION_REMOVED') {
    if (
      activity === 'FACULTY_RESTORED' ||
      activity === 'FACULTY_PERMANENTLY_PURGED' ||
      activity === 'FACULTY_IMMEDIATELY_PURGED' ||
      activity === 'RESTORE_PASSWORD_FAILED'
    ) {
      return ADMIN_PORTAL_MODULES.ARCHIVE_VAULT
    }
    return ADMIN_PORTAL_MODULES.FACULTIES
  }
  if (activity.startsWith('ANNOUNCEMENT_')) return ADMIN_PORTAL_MODULES.ANNOUNCEMENTS
  if (activity === 'ARCHIVED_RECORD_ACCESSED') return ADMIN_PORTAL_MODULES.ARCHIVE_VAULT
  if (
    activity === 'ACCOUNT_AUTO_PURGED' ||
    activity === 'ACCOUNT_AUTO_PURGE_WARNING' ||
    activity === 'ACCOUNT_AUTO_PURGE_DRY_RUN'
  ) {
    return ADMIN_PORTAL_MODULES.ARCHIVE_VAULT
  }
  if (activity === 'AUDIT_LOGS_CLEARED' || activity === 'AUDIT_LOG_DELETED') {
    return ADMIN_PORTAL_MODULES.AUDIT_LOGS
  }
  if (
    activity.startsWith('BACKUP_') ||
    activity.startsWith('GOOGLE_DRIVE_') ||
    activity === 'BACKUP_UPLOADED_TO_GDRIVE'
  ) {
    return ADMIN_PORTAL_MODULES.DATA_BACKUP
  }
  if (activity === 'GRADE_OVERRIDE') return ADMIN_PORTAL_MODULES.STUDENTS
  if (
    activity === 'SCORE_OVERWRITE_REQUESTED' ||
    activity === 'SCORE_OVERWRITE_APPROVED' ||
    activity === 'SCORE_OVERWRITE_REJECTED'
  ) {
    return ADMIN_PORTAL_MODULES.STUDENTS
  }
  if (
    activity === 'PASSWORD_RESET_REQUESTED' ||
    activity === 'PASSWORD_RESET_COMPLETED' ||
    activity === 'ADMIN_INITIATED_PASSWORD_RESET'
  ) {
    return ADMIN_PORTAL_MODULES.DASHBOARD
  }

  return null
}

function normalizeModuleLabel(raw, event) {
  const label = String(raw || '').trim()
  if (!label) return null
  if (label === 'Quizzes') {
    const role = pickUserRole(event)
    const activity = pickActivityType(event)
    if (role === 'student' || activity === 'QUIZ_SUBMITTED') {
      return STUDENT_PORTAL_MODULES.QUIZZES
    }
    return TEACHER_PORTAL_MODULES.QUIZ_MAKER
  }
  return MODULE_LEGACY_ALIASES[label] || label
}

function moduleFromEventType(eventType) {
  if (!eventType) return null
  if (eventType === 'grade_criteria_saved') return TEACHER_PORTAL_MODULES.GRADES
  if (SUBJECTS_EVENT_TYPES.has(eventType)) return TEACHER_PORTAL_MODULES.SUBJECTS
  if (eventType.endsWith('_published') || eventType.endsWith('_unpublished')) {
    return TEACHER_PORTAL_MODULES.SUBJECTS
  }
  return null
}

function moduleFromActivityType(activity, role) {
  if (!activity) return null

  const instituteModule = resolveInstituteActivityModule(activity)
  if (instituteModule && role !== 'student' && role !== 'teacher') {
    return instituteModule
  }

  if (role === 'admin') {
    if (instituteModule) return instituteModule
    if (
      activity === 'USER_SIGNED_OUT' ||
      activity === 'USER_SESSION_STARTED' ||
      activity === 'SESSION_CREATED' ||
      activity === 'SESSION_REVOKED' ||
      activity === 'USER_SIGNED_IN' ||
      activity === 'LOGIN'
    ) {
      return LOGIN_MODULE
    }
    if (activity === 'TERMS_ACCEPTED') return TERMS_AND_CONDITIONS_MODULE
  }

  if (activity === 'ASSIGNMENT_SUBMITTED') return STUDENT_PORTAL_MODULES.ASSIGNMENTS
  if (activity === 'ACTIVITY_SUBMITTED') return STUDENT_PORTAL_MODULES.ACTIVITIES
  if (activity === 'QUIZ_SUBMITTED') return STUDENT_PORTAL_MODULES.QUIZZES

  if (
    activity === 'USER_SIGNED_OUT' ||
    activity === 'USER_SESSION_STARTED' ||
    activity === 'SESSION_CREATED' ||
    activity === 'SESSION_REVOKED' ||
    activity === 'USER_SIGNED_IN' ||
    activity === 'LOGIN'
  ) {
    return LOGIN_MODULE
  }

  if (activity === 'TERMS_ACCEPTED') return TERMS_AND_CONDITIONS_MODULE

  if (activity.startsWith('CURRICULUM_')) return TEACHER_PORTAL_MODULES.CURRICULUM
  if (activity.startsWith('SECTION_')) return TEACHER_PORTAL_MODULES.SECTION
  if (activity.startsWith('SUBJECT_')) return TEACHER_PORTAL_MODULES.SUBJECTS

  if (activity === 'ANNOUNCEMENT_POSTED' || activity.startsWith('ANNOUNCEMENT_')) {
    return role === 'student' ? STUDENT_PORTAL_MODULES.ANNOUNCEMENT : TEACHER_PORTAL_MODULES.ANNOUNCEMENTS
  }

  if (activity === 'QUIZ_CREATED' || activity.startsWith('QUIZ_')) {
    return role === 'student' ? STUDENT_PORTAL_MODULES.QUIZZES : TEACHER_PORTAL_MODULES.QUIZ_MAKER
  }

  if (activity === 'ASSIGNMENT_GRADED' || activity.startsWith('ASSIGNMENT_')) {
    return role === 'student' ? STUDENT_PORTAL_MODULES.ASSIGNMENTS : TEACHER_PORTAL_MODULES.ASSIGNMENTS
  }

  if (activity === 'ACTIVITY_GRADED' || activity.startsWith('ACTIVITY_')) {
    return role === 'student' ? STUDENT_PORTAL_MODULES.ACTIVITIES : TEACHER_PORTAL_MODULES.ACTIVITIES
  }

  if (activity === 'GRADE_EXPORTED' || activity === 'GRADE_OVERRIDE' || activity.includes('GRADE')) {
    return TEACHER_PORTAL_MODULES.GRADES
  }

  if (activity === 'FILE_UPLOADED' || activity.includes('MATERIAL')) {
    return role === 'student' ? STUDENT_PORTAL_MODULES.STUDY_MATERIALS : TEACHER_PORTAL_MODULES.STUDY_MATERIALS
  }

  return null
}

function moduleFromLedgerType(event) {
  const role = pickUserRole(event)
  const ledgerType = String(event?.raw?.type || pickEventDetails(event)?.type || '')
    .trim()
    .toUpperCase()

  const instituteModule = resolveInstituteActivityModule(ledgerType)
  if (instituteModule && role !== 'student' && role !== 'teacher') {
    return instituteModule
  }

  if (ledgerType === 'LOGIN') return LOGIN_MODULE
  if (ledgerType.startsWith('CURRICULUM_')) return TEACHER_PORTAL_MODULES.CURRICULUM
  if (ledgerType.startsWith('SECTION_')) return TEACHER_PORTAL_MODULES.SECTION
  if (ledgerType.startsWith('SUBJECT_')) return TEACHER_PORTAL_MODULES.SUBJECTS
  if (ledgerType === 'ASSIGNMENT_SUBMITTED') return STUDENT_PORTAL_MODULES.ASSIGNMENTS
  if (ledgerType === 'ACTIVITY_SUBMITTED') return STUDENT_PORTAL_MODULES.ACTIVITIES
  if (ledgerType === 'TERMS_ACCEPTED') return TERMS_AND_CONDITIONS_MODULE
  return null
}

function moduleFromAccountChanged(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)
  if (activity !== 'USER_ACCOUNT_CHANGED' && eventType !== 'user_account_changed') return null

  const payload = ed?.payload && typeof ed.payload === 'object' ? ed.payload : ed
  const targetRole = payload?.target_user?.role || payload?.targetRole || ed?.targetRole || ''
  const studentRecordId = payload?.studentRecordId ?? ed?.studentRecordId ?? null
  return resolveAccountChangedModule({ targetRole, studentRecordId })
}

function moduleFromSecurityAuth(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)
  const isSecurity =
    activity === 'LOGIN_FAILED' ||
    activity === 'AUTH_LOCKOUT' ||
    eventType === 'login_failed' ||
    eventType === 'user_sign_in_failed' ||
    eventType === 'auth_lockout'
  if (!isSecurity) return null

  const portal = String(ed?.portal || '').trim().toLowerCase()
  const portalRole =
    portal === 'admin' || portal === 'institute'
      ? 'admin'
      : portal === 'faculty' || portal === 'teacher'
        ? 'teacher'
        : portal === 'student'
          ? 'student'
          : ''
  const role = portalRole || pickUserRole(event)
  return dashboardModuleForRole(role)
}

function moduleFromTermsOrLogin(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)

  if (activity === 'TERMS_ACCEPTED' || eventType === 'terms_accepted') {
    return TERMS_AND_CONDITIONS_MODULE
  }

  if (
    isSessionOnlyAuditActivity(activity) ||
    isSessionOnlyAuditEventType(eventType) ||
    activity === 'SESSION_REVOKED' ||
    eventType === 'session_revoked' ||
    activity === 'USER_SIGNED_OUT' ||
    eventType === 'user_signed_out'
  ) {
    return LOGIN_MODULE
  }

  if (isSignInAuditActivity(activity) || isSignInAuditEventType(eventType)) {
    return LOGIN_MODULE
  }

  return null
}

function pickLoginAffectedLabel(event, ed) {
  const raw = event?.raw || {}
  const payload = ed?.payload && typeof ed.payload === 'object' ? ed.payload : ed
  const targetUser = payload?.target_user || ed?.target_user
  const name = String(
    ed?.targetName ||
      ed?.target_label ||
      ed?.userName ||
      ed?.name ||
      targetUser?.name ||
      raw?.targetName ||
      '',
  ).trim()
  if (name) return name

  const email = String(
    ed?.targetEmail || ed?.userEmail || ed?.email || targetUser?.email || raw?.targetEmail || '',
  ).trim()
  if (email) return email

  const eventEmail = String(event?.userEmail || raw?.userEmail || '').trim()
  if (eventEmail) {
    const parenIdx = eventEmail.indexOf(' (')
    return parenIdx > 0 ? eventEmail.slice(0, parenIdx).trim() : eventEmail
  }

  return null
}

/**
 * Resolve the portal module label for an audit event row.
 * @param {object} event Normalized or raw unified audit event
 * @returns {string}
 */
export function resolveAuditPortalModule(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)

  const fromAccountChanged = moduleFromAccountChanged(event)
  if (fromAccountChanged) return fromAccountChanged

  const fromSecurityAuth = moduleFromSecurityAuth(event)
  if (fromSecurityAuth) return fromSecurityAuth

  const fromTermsOrLogin = moduleFromTermsOrLogin(event)
  if (fromTermsOrLogin) return fromTermsOrLogin

  const stored = normalizeModuleLabel(ed?.module, event)
  if (stored) {
    if (
      (activity === 'TERMS_ACCEPTED' || eventType === 'terms_accepted') &&
      stored === ADMIN_PORTAL_MODULES.DASHBOARD
    ) {
      return TERMS_AND_CONDITIONS_MODULE
    }
    if (isLoginModuleAuditEvent(event) && DASHBOARD_MODULE_LABELS.has(stored)) {
      return LOGIN_MODULE
    }
    return stored
  }

  const fromEventType = moduleFromEventType(eventType)
  if (fromEventType) return fromEventType

  const role = pickUserRole(event)
  const fromActivity = moduleFromActivityType(activity, role)
  if (fromActivity) return fromActivity

  const fromLedger = moduleFromLedgerType(event)
  if (fromLedger) return fromLedger

  return '—'
}

/**
 * Resolve affected record label for student submission events.
 * @param {object} event
 * @returns {string|null}
 */
export function resolveAuditPortalAffected(event) {
  const ed = pickEventDetails(event)
  const activity = pickActivityType(event)
  const eventType = pickEventType(event)

  if (activity === 'USER_ACCOUNT_CHANGED' || eventType === 'user_account_changed') {
    const payload = ed?.payload && typeof ed.payload === 'object' ? ed.payload : ed
    const targetUser = payload?.target_user || ed?.target_user
    const name = String(
      ed?.targetName || ed?.target_label || payload?.targetName || targetUser?.name || '',
    ).trim()
    if (name) return name
    const email = String(
      ed?.targetEmail || payload?.targetEmail || targetUser?.email || ed?.userEmail || '',
    ).trim()
    if (email) return email
  }

  if (
    activity === 'LOGIN_FAILED' ||
    activity === 'AUTH_LOCKOUT' ||
    eventType === 'login_failed' ||
    eventType === 'user_sign_in_failed' ||
    eventType === 'auth_lockout'
  ) {
    const identityLabel = pickLoginAffectedLabel(event, ed)
    if (identityLabel) return identityLabel
    const loginId = String(ed?.loginId || ed?.identifier || '').trim()
    if (loginId) return loginId
  }

  if (
    isSignInAuditActivity(activity) ||
    isSignInAuditEventType(eventType) ||
    isSessionOnlyAuditActivity(activity) ||
    isSessionOnlyAuditEventType(eventType) ||
    activity === 'SESSION_REVOKED' ||
    eventType === 'session_revoked'
  ) {
    const identityLabel = pickLoginAffectedLabel(event, ed)
    if (identityLabel) return identityLabel
  }

  if (activity === 'TERMS_ACCEPTED' || eventType === 'terms_accepted') {
    const termsLabel = pickLoginAffectedLabel(event, ed)
    if (termsLabel) return termsLabel
  }

  if (activity === 'QUIZ_SUBMITTED') {
    const title = ed?.quizTitle || ed?.target_label
    if (title) return String(title)
    if (ed?.quizId || event?.raw?.resourceId) {
      return `Quiz ${ed?.quizId || event?.raw?.resourceId}`
    }
  }

  if (activity === 'ASSIGNMENT_SUBMITTED') {
    const title = ed?.assignmentTitle || ed?.target_label
    if (title) return String(title)
    if (ed?.assignmentId || event?.raw?.resourceId) {
      return `Assignment ${ed?.assignmentId || event?.raw?.resourceId}`
    }
  }

  if (activity === 'ACTIVITY_SUBMITTED') {
    const title = ed?.activityTitle || ed?.target_label
    if (title) return String(title)
    if (ed?.activityId || event?.raw?.resourceId) {
      return `Activity ${ed?.activityId || event?.raw?.resourceId}`
    }
  }

  const recordName = ed?.record_name || ed?.recordName
  if (recordName) return String(recordName)

  return null
}

/**
 * Drop session-only audit rows when a login row exists for the same user within ~2s.
 * @param {object[]} events Unified audit events
 * @returns {object[]}
 */
export function dedupeLoginSessionEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return events

  const loginKeys = new Set()
  for (const e of events) {
    const activity = String(e?.activityType || '').trim().toUpperCase()
    const eventType = String(e?.eventType || e?.type || '').trim().toLowerCase()
    const isLogin =
      activity === 'USER_SIGNED_IN' ||
      activity === 'LOGIN' ||
      eventType === 'user_signed_in' ||
      eventType === 'login'
    if (!isLogin) continue

    const ed = e?.detailsObj || e?.eventData || e?.details || e?.raw?.eventData || {}
    const userId = String(e?.userId || ed?.userId || ed?.targetUserId || '').trim()
    const ms =
      (e?.timestamp ? new Date(e.timestamp).getTime() : NaN) ||
      (e?.time ? new Date(e.time).getTime() : NaN) ||
      (e?.createdAt ? new Date(e.createdAt).getTime() : NaN)
    const bucket = Number.isFinite(ms) ? Math.floor(ms / 2000) : 0
    loginKeys.add(`${userId}:${bucket}`)
  }

  if (loginKeys.size === 0) return events

  return events.filter((e) => {
    const activity = String(e?.activityType || '').trim().toUpperCase()
    const eventType = String(e?.eventType || e?.type || '').trim().toLowerCase()
    const isSessionOnly =
      isSessionOnlyAuditActivity(activity) || isSessionOnlyAuditEventType(eventType)
    if (!isSessionOnly) return true

    const ed = e?.detailsObj || e?.eventData || e?.details || e?.raw?.eventData || {}
    const userId = String(e?.userId || ed?.userId || ed?.targetUserId || '').trim()
    const ms =
      (e?.timestamp ? new Date(e.timestamp).getTime() : NaN) ||
      (e?.time ? new Date(e.time).getTime() : NaN) ||
      (e?.createdAt ? new Date(e.createdAt).getTime() : NaN)
    const bucket = Number.isFinite(ms) ? Math.floor(ms / 2000) : 0
    return !loginKeys.has(`${userId}:${bucket}`)
  })
}
