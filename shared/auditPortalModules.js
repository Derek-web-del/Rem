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
      activity === 'USER_SIGNED_IN' ||
      activity === 'TERMS_ACCEPTED'
    ) {
      return ADMIN_PORTAL_MODULES.DASHBOARD
    }
  }

  if (activity === 'ASSIGNMENT_SUBMITTED') return STUDENT_PORTAL_MODULES.ASSIGNMENTS
  if (activity === 'ACTIVITY_SUBMITTED') return STUDENT_PORTAL_MODULES.ACTIVITIES
  if (activity === 'QUIZ_SUBMITTED') return STUDENT_PORTAL_MODULES.QUIZZES

  if (
    activity === 'USER_SIGNED_OUT' ||
    activity === 'USER_SESSION_STARTED' ||
    activity === 'SESSION_CREATED' ||
    activity === 'USER_SIGNED_IN' ||
    activity === 'TERMS_ACCEPTED'
  ) {
    return dashboardModuleForRole(role)
  }

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

  if (ledgerType === 'LOGIN') return STUDENT_PORTAL_MODULES.DASHBOARD
  if (ledgerType.startsWith('CURRICULUM_')) return TEACHER_PORTAL_MODULES.CURRICULUM
  if (ledgerType.startsWith('SECTION_')) return TEACHER_PORTAL_MODULES.SECTION
  if (ledgerType.startsWith('SUBJECT_')) return TEACHER_PORTAL_MODULES.SUBJECTS
  if (ledgerType === 'ASSIGNMENT_SUBMITTED') return STUDENT_PORTAL_MODULES.ASSIGNMENTS
  if (ledgerType === 'ACTIVITY_SUBMITTED') return STUDENT_PORTAL_MODULES.ACTIVITIES
  if (ledgerType === 'TERMS_ACCEPTED') return dashboardModuleForRole(role)
  return null
}

/**
 * Resolve the portal module label for an audit event row.
 * @param {object} event Normalized or raw unified audit event
 * @returns {string}
 */
export function resolveAuditPortalModule(event) {
  const ed = pickEventDetails(event)
  const stored = normalizeModuleLabel(ed?.module, event)
  if (stored) return stored

  const eventType = pickEventType(event)
  const fromEventType = moduleFromEventType(eventType)
  if (fromEventType) return fromEventType

  const role = pickUserRole(event)
  const activity = pickActivityType(event)
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
