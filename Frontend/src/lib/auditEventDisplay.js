/** Display helpers for Audit Logs (Monitoring Records). */

import { normalizeInstituteAdminDisplayName } from './instituteAdminDisplay.js'

const EVENT_LABELS = {
  session_created: 'Session started',
  USER_SESSION_STARTED: 'Session started',
  SESSION_CREATED: 'Session started',
  USER_SIGNED_IN: 'Signed In',
  user_signed_in: 'Signed In',
  LOGIN: 'Signed In',
  login: 'Signed In',
  SESSION_REVOKED: 'Session Revoked',
  session_revoked: 'Session Revoked',
  TERMS_ACCEPTED: 'Terms & Conditions Accepted',
  terms_accepted: 'Terms & Conditions Accepted',
  LOGIN_FAILED: 'Sign In Failed',
  user_sign_in_failed: 'Sign In Failed',
  login_failed: 'Sign In Failed',
  AUTH_LOCKOUT: 'Account Lockout',
  auth_lockout: 'Account Lockout',
  SESSION_EXPIRED: 'Session expired',
  USER_SIGNED_OUT: 'User signed out',
  user_signed_out: 'User signed out',
  USER_CREATED: 'Account created',
  user_created: 'Account created',
  user_signed_up: 'Account created',
  USER_UPDATED: 'Account updated',
  STUDENT_CREATED: 'Student created',
  STUDENT_UPDATED: 'Student record updated',
  STUDENT_DELETED: 'Student archived',
  STUDENT_RESTORED: 'Student restored',
  STUDENT_PERMANENTLY_PURGED: 'Student permanently purged',
  STUDENT_IMMEDIATELY_PURGED: 'Student immediately purged',
  FACULTY_CREATED: 'Faculty created',
  FACULTY_UPDATED: 'Faculty record updated',
  FACULTY_DELETED: 'Faculty archived',
  FACULTY_RESTORED: 'Faculty restored',
  FACULTY_PERMANENTLY_PURGED: 'Faculty permanently purged',
  FACULTY_IMMEDIATELY_PURGED: 'Faculty immediately purged',
  RESTORE_PASSWORD_FAILED: 'Archive restore password failed',
  ACCOUNT_AUTO_PURGED: 'Account auto-deleted after retention',
  ACCOUNT_AUTO_PURGE_WARNING: 'Account auto-deletion warning',
  ACCOUNT_AUTO_PURGE_DRY_RUN: 'Account auto-deletion dry-run',
  MATERIAL_DOWNLOADED: 'Study material downloaded',
  QUIZ_SUBMITTED: 'Quiz submitted',
  GRADE_OVERRIDE: 'Grade override',
  SCORE_OVERWRITE_REQUESTED: 'Score overwrite requested',
  SCORE_OVERWRITE_APPROVED: 'Score overwrite approved',
  SCORE_OVERWRITE_REJECTED: 'Score overwrite rejected',
  assignment_created: 'Assignment created',
  assignment_updated: 'Assignment updated',
  assignment_deleted: 'Assignment deleted',
  assignment_published: 'Assignment published',
  assignment_unpublished: 'Assignment unpublished',
  activity_created: 'Activity created',
  activity_updated: 'Activity updated',
  activity_deleted: 'Activity deleted',
  activity_published: 'Activity published',
  activity_unpublished: 'Activity unpublished',
  quiz_created: 'Quiz created',
  quiz_updated: 'Quiz updated',
  quiz_deleted: 'Quiz deleted',
  quiz_published: 'Quiz published',
  quiz_unpublished: 'Quiz unpublished',
  quiz_question_added: 'Quiz question added',
  quiz_question_edited: 'Quiz question edited',
  quiz_question_deleted: 'Quiz question deleted',
  material_created: 'Study material created',
  material_updated: 'Study material updated',
  material_deleted: 'Study material deleted',
  grade_criteria_saved: 'Grade criteria saved',
  grade_score_saved: 'Grade score saved',
  announcement_created: 'Announcement created',
  announcement_updated: 'Announcement updated',
  module_created: 'Module created',
  module_renamed: 'Module renamed',
  module_deleted: 'Module deleted',
  topic_created: 'Topic created',
  topic_renamed: 'Topic renamed',
  topic_deleted: 'Topic deleted',
  item_moved: 'Item moved',
  plagiarism_check_submitted: 'Plagiarism check submitted',
  plagiarism_report_deleted: 'Plagiarism report deleted',
  CURRICULUM_CREATED: 'Curriculum uploaded',
  CURRICULUM_UPLOADED: 'Curriculum uploaded',
  CURRICULUM_UPDATED: 'Curriculum updated',
  CURRICULUM_DELETED: 'Curriculum deleted',
  SECTION_CREATED: 'Section created',
  SECTION_UPDATED: 'Section updated',
  SECTION_DELETED: 'Section deleted',
  SECTION_ARCHIVED: 'Section archived',
  faculty_advisory_section_removed: 'Advisory section removed',
  AUDIT_LOGS_CLEARED: 'Audit logs cleared',
  audit_logs_cleared: 'Audit logs cleared',
  SUBJECT_CREATED: 'Subject created',
  SUBJECT_UPDATED: 'Subject updated',
  SUBJECT_DELETED: 'Subject deleted',
  ANNOUNCEMENT_CREATED: 'Announcement created',
  ANNOUNCEMENT_UPDATED: 'Announcement updated',
  ANNOUNCEMENT_DELETED: 'Announcement deleted',
  ARCHIVED_RECORD_ACCESSED: 'Archived record viewed',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'Unauthorized access attempt',
  audit_cleared: 'Audit logs cleared',
  restore_completed: 'System restore completed',
  BACKUP_CREATED: 'Backup created',
  BACKUP_RESTORED: 'Data restored',
  BACKUP_DELETED: 'Backup deleted',
  BACKUP_SCHEDULE_UPDATED: 'Backup schedule updated',
  BACKUP_UPLOADED_TO_GDRIVE: 'Backup uploaded to Drive',
  backup_uploaded_to_gdrive: 'Backup uploaded to Drive',
  GOOGLE_DRIVE_CONNECTED: 'Google Drive connected',
  google_drive_connected: 'Google Drive connected',
  GOOGLE_DRIVE_DISCONNECTED: 'Google Drive disconnected',
  google_drive_disconnected: 'Google Drive disconnected',
  PASSWORD_RESET_REQUESTED: 'Password reset requested',
  PASSWORD_RESET_COMPLETED: 'Password reset completed',
  ADMIN_INITIATED_PASSWORD_RESET: 'Admin sent password reset email',
  PASSWORD_CHANGED: 'Password changed',
}

const SESSION_EVENT_TYPES = new Set([
  'session_created',
  'USER_SESSION_STARTED',
  'SESSION_CREATED',
])

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

export function getEventLabel(eventType, activityType) {
  const authKey = String(eventType || '').trim()
  const lmsKey = String(activityType || '').trim().toUpperCase()
  if (authKey && EVENT_LABELS[authKey]) return EVENT_LABELS[authKey]
  if (lmsKey && EVENT_LABELS[lmsKey]) return EVENT_LABELS[lmsKey]
  const raw = lmsKey || authKey
  if (!raw) return ''
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

function sessionRoleLabel(role) {
  const r = String(role || '').trim().toLowerCase()
  if (r === 'admin') return 'Admin'
  if (r === 'teacher' || r === 'faculty' || r === 'user') return 'Faculty'
  if (r === 'student') return 'Student'
  return role ? String(role) : ''
}

export function formatDescription(eventType, description, metadata = {}) {
  const authType = String(eventType || '').trim().toLowerCase()
  const activityType = String(metadata?.activityType || '').trim().toUpperCase()
  const isSession =
    authType === 'session_created' ||
    activityType === 'USER_SESSION_STARTED' ||
    activityType === 'SESSION_CREATED'

  if (isSession) {
    const name = normalizeInstituteAdminDisplayName(
      pickStr(metadata?.name, metadata?.userName, metadata?.user?.name),
      pickStr(metadata?.email, metadata?.userEmail, metadata?.user?.email),
    )
    const role = pickStr(metadata?.role, metadata?.userRole, metadata?.user?.role)
    const method = pickStr(metadata?.login_method, metadata?.loginMethod, metadata?.method, 'credentials')
    const roleLabel = sessionRoleLabel(role)
    if (name) {
      return `${name} started a ${roleLabel || 'user'} session via ${method}`
    }
    return pickStr(metadata?.description, description) || description || ''
  }

  return pickStr(metadata?.description, description) || description || ''
}

export function isSessionAuditEvent(e) {
  const authType = String(e?.eventType || e?.raw?.eventType || e?.raw?.type || '').trim().toLowerCase()
  const activity = String(e?.activityType || '').trim().toUpperCase()
  if (SESSION_EVENT_TYPES.has(authType)) return true
  if (SESSION_EVENT_TYPES.has(activity)) return true
  const ed = e?.detailsObj || e?.raw?.eventData || {}
  const detailType = String(ed?.eventType || ed?.type || '').trim().toLowerCase()
  return detailType === 'session_created'
}

export function resolveSessionDetailFields(e) {
  const raw = e?.raw || {}
  const ed = raw?.eventData || e?.detailsObj || {}
  const role = pickStr(ed?.role, ed?.userRole, e?.userRole)
  return {
    name: normalizeInstituteAdminDisplayName(
      pickStr(ed?.name, ed?.userName, ed?.targetName),
      pickStr(ed?.email, ed?.userEmail, ed?.targetEmail, e?.userEmail),
    ),
    email: pickStr(ed?.email, ed?.userEmail, ed?.targetEmail, e?.userEmail),
    role,
    roleLabel: sessionRoleLabel(role),
    loginMethod: pickStr(ed?.login_method, ed?.loginMethod, ed?.method, 'credentials'),
    userAgent: pickStr(ed?.user_agent, ed?.userAgent, 'unknown') || 'unknown',
    signedInAt: pickStr(ed?.signed_in_at, ed?.signedInAt),
  }
}

export function auditEventMetadata(e) {
  const raw = e?.raw || {}
  const ed = raw?.eventData || e?.detailsObj || {}
  return {
    ...ed,
    activityType: e?.activityType,
    description: ed?.description,
  }
}
