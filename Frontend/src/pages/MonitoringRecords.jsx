import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton.jsx'
import {
  coerceAuditTimestamp,
  formatAuditTime,
  humanEventType as humanEventTypeCore,
  normalizeAuditEvent,
  pickTime,
} from '../lib/auditStatisticsCore.js'
import { AUDIT_LOGS_REFRESH_EVENT, dispatchAuditLogsRefresh } from '../lib/auditLogRefresh.js'
import AuditEventGlyph from '../components/AuditEventGlyph.jsx'
import ClearAuditLogsModal from '../components/ClearAuditLogsModal.jsx'
import { useNotify } from '../components/notifications.jsx'
import { formatAuditModalEventDataJson } from '../lib/formatAuditModalEventData.js'
import {
  auditEventMetadata,
  formatDescription,
  getEventLabel,
  isSessionAuditEvent,
} from '../lib/auditEventDisplay.js'
import { auditEventReactKey, dedupeAuditEvents } from '../lib/dedupeById.js'
import { isNonProfileLedgerType, ledgerTypeToActivityType } from '../../../shared/auditLedgerDisplay.js'
import {
  auditRowAffectedLabel,
  auditRowModuleLabel,
  teacherEventSubline,
} from '../components/TeacherAuditDetailPanel.jsx'
const EVENT_LABELS = {
  user_created: 'New user registration',
  user_signed_up: 'New user registration',
  profile_updated: 'User updates their profile',
  user_profile_updated: 'User updates their profile',
  user_account_changed: 'Profile Updated (Account)',
  profile_image_updated: 'User changes their avatar',
  user_profile_image_updated: 'User changes their avatar',
  user_deleted: 'User account deleted',
  user_signed_in: 'User Signed In',
  user_signed_out: 'User signs out',
  user_sign_in_failed: 'Sign In Failed',
  password_reset_requested: 'Password Reset Requested',
  password_reset_completed: 'Password Reset Completed',
  password_changed: 'Password updated',
  email_verification_sent: 'Email Verification Sent',
  email_verified: 'Email Verified',
  two_factor_enabled: '2FA Enabled',
  two_factor_disabled: '2FA Disabled',
  session_created: 'New session created',
  session_revoked: 'Single session revoked',
  user_banned: 'User Banned',
  user_unbanned: 'User Unbanned',
  user_deleted: 'User Deleted',
  user_impersonated: 'User Impersonated',
  organization_created: 'Organization Created',
  organization_updated: 'Organization Updated',
  organization_member_added: 'Member Added',
  organization_member_removed: 'Member Removed',
  organization_member_invited: 'Member Invited',
  organization_member_invite_canceled: 'Invitation Canceled',
  organization_member_invite_accepted: 'Invitation Accepted',
  // Not currently emitted by your infra package, but included to match the screenshot list.
  email_sent: 'Email Sent',
  sms_sent: 'SMS Sent',
  // Security (Sentinel)
  security_blocked: 'Security Blocked',
  security_allowed: 'Security Allowed',
  security_credential_stuffing: 'Credential Stuffing',
  security_impossible_travel: 'Impossible Travel',
  security_suspicious_ip: 'Suspicious IP',
  security_compromised_password: 'Compromised Password',
  security_velocity_exceeded: 'Velocity Exceeded',
  security_bot_blocked: 'Bot Blocked',
}

// Exact dropdown list (labels + order) to match the screenshot.
const EVENTS_DROPDOWN = [
  { id: '', label: 'All Events' },
  { id: 'user_created', label: 'New user registration' },
  { id: 'profile_updated', label: 'User updates their profile' },
  { id: 'user_account_changed', label: 'Profile Updated (Account)' },
  { id: 'profile_image_updated', label: 'User changes their avatar' },
  { id: 'user_signed_in', label: 'User Signed In' },
  { id: 'user_signed_out', label: 'User signs out' },
  { id: 'user_sign_in_failed', label: 'Sign In Failed' },
  { id: 'password_reset_requested', label: 'Password Reset Requested' },
  { id: 'password_reset_completed', label: 'Password Reset Completed' },
  { id: 'password_changed', label: 'Password updated' },
  { id: 'email_verification_sent', label: 'Email Verification Sent' },
  { id: 'email_verified', label: 'Email Verified' },
  { id: 'two_factor_enabled', label: '2FA Enabled' },
  { id: 'two_factor_disabled', label: '2FA Disabled' },
  { id: 'session_created', label: 'Session started' },
  { id: 'session_revoked', label: 'Single session revoked' },
  { id: 'user_banned', label: 'User Banned' },
  { id: 'user_unbanned', label: 'User Unbanned' },
  { id: 'user_deleted', label: 'User Deleted' },
  { id: 'user_impersonated', label: 'User Impersonated' },
  { id: 'organization_created', label: 'Organization Created' },
  { id: 'organization_updated', label: 'Organization Updated' },
  { id: 'organization_member_added', label: 'Member Added' },
  { id: 'organization_member_removed', label: 'Member Removed' },
  { id: 'organization_member_invited', label: 'Member Invited' },
  { id: 'organization_member_invite_canceled', label: 'Invitation Canceled' },
  { id: 'organization_member_invite_accepted', label: 'Invitation Accepted' },
  { id: 'email_sent', label: 'Email Sent' },
  { id: 'sms_sent', label: 'SMS Sent' },
]

const LMS_ACTIVITY_TYPES = [
  'USER_ACCOUNT_CHANGED',
  'USER_PROFILE_UPDATED',
  'LESSON_ACCESSED',
  'FILE_UPLOADED',
  'GRADE_EXPORTED',
  'ASSIGNMENT_SUBMITTED',
  'QUIZ_SUBMITTED',
  'QUIZ_CREATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'ADMIN_INITIATED_PASSWORD_RESET',
  'TERMS_ACCEPTED',
  'USER_SESSION_STARTED',
  'ANNOUNCEMENT_POSTED',
  'CURRICULUM_UPLOADED',
  'CURRICULUM_CREATED',
  'CURRICULUM_UPDATED',
  'CURRICULUM_DELETED',
  'SECTION_CREATED',
  'SECTION_UPDATED',
  'SECTION_DELETED',
  'SECTION_ARCHIVED',
  'faculty_advisory_section_removed',
  'SUBJECT_CREATED',
  'SUBJECT_UPDATED',
  'SUBJECT_DELETED',
  'ANNOUNCEMENT_CREATED',
  'ANNOUNCEMENT_UPDATED',
  'ANNOUNCEMENT_DELETED',
  'STUDENT_CREATED',
  'STUDENT_UPDATED',
  'STUDENT_DELETED',
  'STUDENT_RESTORED',
  'STUDENT_PERMANENTLY_PURGED',
  'STUDENT_IMMEDIATELY_PURGED',
  'FACULTY_CREATED',
  'FACULTY_UPDATED',
  'FACULTY_DELETED',
  'FACULTY_RESTORED',
  'FACULTY_PERMANENTLY_PURGED',
  'FACULTY_IMMEDIATELY_PURGED',
  'BACKUP_SCHEDULE_UPDATED',
  'BACKUP_CREATED',
  'BACKUP_RESTORED',
  'BACKUP_DELETED',
  'BACKUP_UPLOADED_TO_GDRIVE',
  'backup_uploaded_to_gdrive',
  'GOOGLE_DRIVE_CONNECTED',
  'google_drive_connected',
  'GOOGLE_DRIVE_DISCONNECTED',
  'google_drive_disconnected',
  'AUDIT_LOGS_CLEARED',
  'audit_logs_cleared',
  'audit_cleared',
  'ARCHIVED_RECORD_ACCESSED',
  'GRADE_OVERRIDE',
  'SCORE_OVERWRITE_REQUESTED',
  'SCORE_OVERWRITE_APPROVED',
  'SCORE_OVERWRITE_REJECTED',
]

/** LMS-backed rows merged into Events (filter with unifiedType `lms:…`). */
const LMS_EVENTS_DROPDOWN = [
  { id: 'USER_ACCOUNT_CHANGED', label: 'Profile Updated (Account)' },
  { id: 'USER_PROFILE_UPDATED', label: 'Profile updated (account)' },
  { id: 'TERMS_ACCEPTED', label: 'Terms & Conditions Accepted' },
  { id: 'AUTH_LOCKOUT', label: 'Account Lockout' },
  { id: 'LOGIN_FAILED', label: 'Sign In Failed' },
  { id: 'STUDENT_CREATED', label: 'Student created' },
  { id: 'STUDENT_UPDATED', label: 'Student updated' },
  { id: 'STUDENT_DELETED', label: 'Student archived' },
  { id: 'STUDENT_RESTORED', label: 'Student restored' },
  { id: 'STUDENT_PERMANENTLY_PURGED', label: 'Student permanently purged' },
  { id: 'STUDENT_IMMEDIATELY_PURGED', label: 'Student immediately purged' },
  { id: 'FACULTY_CREATED', label: 'Faculty created' },
  { id: 'FACULTY_UPDATED', label: 'Faculty updated' },
  { id: 'FACULTY_DELETED', label: 'Faculty archived' },
  { id: 'FACULTY_RESTORED', label: 'Faculty restored' },
  { id: 'FACULTY_PERMANENTLY_PURGED', label: 'Faculty permanently purged' },
  { id: 'FACULTY_IMMEDIATELY_PURGED', label: 'Faculty immediately purged' },
  { id: 'ACCOUNT_AUTO_PURGED', label: 'Account auto-deleted after retention' },
  { id: 'ACCOUNT_AUTO_PURGE_WARNING', label: 'Account auto-deletion warning' },
  { id: 'ACCOUNT_AUTO_PURGE_DRY_RUN', label: 'Account auto-deletion dry-run' },
  { id: 'ARCHIVED_RECORD_ACCESSED', label: 'Archived record viewed' },
  { id: 'BACKUP_SCHEDULE_UPDATED', label: 'Backup schedule updated' },
  { id: 'BACKUP_CREATED', label: 'Backup created' },
  { id: 'BACKUP_RESTORED', label: 'Data restored' },
  { id: 'BACKUP_DELETED', label: 'Backup deleted' },
  { id: 'BACKUP_UPLOADED_TO_GDRIVE', label: 'Backup uploaded to Drive' },
  { id: 'GOOGLE_DRIVE_CONNECTED', label: 'Google Drive connected' },
  { id: 'GOOGLE_DRIVE_DISCONNECTED', label: 'Google Drive disconnected' },
  { id: 'SECTION_ARCHIVED', label: 'Section archived' },
  { id: 'faculty_advisory_section_removed', label: 'Advisory section removed' },
  { id: 'AUDIT_LOGS_CLEARED', label: 'Audit logs cleared' },
  { id: 'PASSWORD_RESET_REQUESTED', label: 'Password reset requested (user)' },
  { id: 'ADMIN_INITIATED_PASSWORD_RESET', label: 'Admin sent password reset email' },
  { id: 'PASSWORD_RESET_COMPLETED', label: 'Password reset completed' },
  { id: 'GRADE_OVERRIDE', label: 'Grade override' },
  { id: 'SCORE_OVERWRITE_REQUESTED', label: 'Score overwrite requested' },
  { id: 'SCORE_OVERWRITE_APPROVED', label: 'Score overwrite approved' },
  { id: 'SCORE_OVERWRITE_REJECTED', label: 'Score overwrite rejected' },
]

function loginSecurityPortalLabel(d) {
  if (d?.portalLabel) return String(d.portalLabel)
  if (d?.portal === 'admin') return 'Admin portal'
  if (d?.portal === 'faculty') return 'Faculty portal'
  if (d?.portal === 'student') return 'Student portal'
  return d?.portal ? String(d.portal) : ''
}

function readUpdatedFields(details) {
  if (!details || typeof details !== 'object') return []
  const raw =
    details.updatedFields ||
    (details.payload && typeof details.payload === 'object' ? details.payload.updatedFields : null)
  if (Array.isArray(raw)) return raw.map((f) => String(f)).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((f) => String(f)).filter(Boolean)
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

function isCurriculumEvent(e) {
  const activity = String(e?.activityType || '').toUpperCase()
  return (
    activity === 'CURRICULUM_CREATED' ||
    activity === 'CURRICULUM_UPLOADED' ||
    activity === 'CURRICULUM_UPDATED' ||
    activity === 'CURRICULUM_DELETED'
  )
}

function isCurriculumUpdatedEvent(e) {
  if (String(e?.activityType || '').toUpperCase() !== 'CURRICULUM_UPDATED') return false
  const d = profileEventDetails(e)
  const fields = readUpdatedFields(d)
  return fields.length > 0
}

function curriculumEventSubtitle(d) {
  const grade = d?.gradeLevel || d?.grade_level || d?.grade
  const subject = d?.subject || d?.title
  const fileName = d?.fileName || d?.file_name
  return [grade ? `Grade: ${grade}` : '', subject ? `Subject: ${subject}` : '', fileName || '']
    .filter(Boolean)
    .join(' • ')
}

function isSectionEvent(e) {
  const activity = String(e?.activityType || '').toUpperCase()
  return (
    activity === 'SECTION_CREATED' ||
    activity === 'SECTION_UPDATED' ||
    activity === 'SECTION_DELETED' ||
    activity === 'SECTION_ARCHIVED'
  )
}

function isSectionUpdatedEvent(e) {
  if (String(e?.activityType || '').toUpperCase() !== 'SECTION_UPDATED') return false
  const d = profileEventDetails(e)
  const fields = readUpdatedFields(d)
  return fields.length > 0
}

function sectionEventSubtitle(d) {
  const grade = d?.gradeLevel || d?.grade_level || d?.grade
  const name = d?.sectionName || d?.section_name || d?.name
  return [grade ? `Grade: ${grade}` : '', name ? `Section: ${name}` : ''].filter(Boolean).join(' • ')
}

function isSubjectEvent(e) {
  const activity = String(e?.activityType || '').toUpperCase()
  return activity === 'SUBJECT_CREATED' || activity === 'SUBJECT_UPDATED' || activity === 'SUBJECT_DELETED'
}

function isSubjectUpdatedEvent(e) {
  if (String(e?.activityType || '').toUpperCase() !== 'SUBJECT_UPDATED') return false
  const d = profileEventDetails(e)
  const fields = readUpdatedFields(d)
  return fields.length > 0
}

function subjectEventSubtitle(d) {
  const grade = d?.gradeLevel || d?.grade_level || d?.grade
  const code = d?.subjectCode || d?.subject_code
  const name = d?.subjectName || d?.subject_name
  const faculty = d?.facultyName || d?.faculty_name
  return [
    code ? `Code: ${code}` : '',
    name ? `Subject: ${name}` : '',
    grade ? `Grade: ${grade}` : '',
    faculty ? `Faculty: ${faculty}` : '',
  ]
    .filter(Boolean)
    .join(' • ')
}

function isAnnouncementInstituteEvent(e) {
  const activity = String(e?.activityType || '').toUpperCase()
  return (
    activity === 'ANNOUNCEMENT_CREATED' ||
    activity === 'ANNOUNCEMENT_UPDATED' ||
    activity === 'ANNOUNCEMENT_DELETED'
  )
}

function isAnnouncementInstituteUpdatedEvent(e) {
  if (String(e?.activityType || '').toUpperCase() !== 'ANNOUNCEMENT_UPDATED') return false
  const d = profileEventDetails(e)
  const fields = readUpdatedFields(d)
  return fields.length > 0
}

function announcementInstituteEventSubtitle(d) {
  const title = d?.title
  const type = d?.announcementType || d?.type
  return [title || '', type ? `Type: ${type}` : ''].filter(Boolean).join(' • ')
}

const AUDIT_ROW_AMBER = 'bg-amber-50/70 ring-1 ring-inset ring-amber-200/90'
const AUDIT_ROW_RED_SOFT = 'bg-red-50/50 ring-1 ring-inset ring-red-200/70'
const AUDIT_ROW_RED_STRONG = 'bg-red-50/70 ring-1 ring-inset ring-red-200/90'

function auditEventTokens(e) {
  const d = profileEventDetails(e)
  const activity = String(e?.activityType || d?.activityType || '').toUpperCase()
  const eventType = String(e?.eventType || d?.eventType || d?.type || e?.raw?.type || '').toLowerCase()
  return { activity, eventType, d }
}

function isAuditLockoutEvent(e) {
  const { activity, eventType } = auditEventTokens(e)
  return activity === 'AUTH_LOCKOUT' || eventType === 'auth_lockout'
}

function isAuditLoginFailedEvent(e) {
  const { activity, eventType } = auditEventTokens(e)
  return activity === 'LOGIN_FAILED' || eventType === 'login_failed' || eventType === 'user_sign_in_failed'
}

function isAuditDeleteEvent(e) {
  const { activity, eventType } = auditEventTokens(e)
  if (activity.endsWith('_DELETED')) return true
  return eventType.endsWith('_deleted') || eventType === 'user_deleted'
}

function isAuditUpdateEvent(e) {
  if (isAuditDeleteEvent(e) || isAuditLockoutEvent(e) || isAuditLoginFailedEvent(e)) return false
  const { activity, eventType, d } = auditEventTokens(e)
  if (isUserAccountChangedEvent(e) || isProfileUpdateEvent(e)) return true
  if (
    isCurriculumUpdatedEvent(e) ||
    isSectionUpdatedEvent(e) ||
    isSubjectUpdatedEvent(e) ||
    isAnnouncementInstituteUpdatedEvent(e)
  ) {
    return true
  }
  if (activity.endsWith('_UPDATED') || eventType.endsWith('_updated')) return true
  if (
    activity === 'GRADE_OVERRIDE' ||
    activity === 'SCORE_OVERWRITE_REQUESTED' ||
    activity === 'SCORE_OVERWRITE_APPROVED' ||
    activity === 'SCORE_OVERWRITE_REJECTED' ||
    activity === 'PASSWORD_CHANGED'
  ) {
    return true
  }
  if (eventType === 'password_changed' || eventType === 'organization_updated') return true
  const fields = readUpdatedFields(d)
  if (fields.length > 0) return true
  return Boolean(
    d?.detailedDiffs && typeof d.detailedDiffs === 'object' && Object.keys(d.detailedDiffs).length > 0,
  )
}

function resolveAuditRowHighlightClass(e) {
  if (isAuditLockoutEvent(e)) return AUDIT_ROW_RED_STRONG
  if (isAuditDeleteEvent(e)) return AUDIT_ROW_RED_SOFT
  if (isAuditUpdateEvent(e) || isAuditLoginFailedEvent(e)) return AUDIT_ROW_AMBER
  return ''
}

function resolveAuditChangedFields(e, { isAccountChanged, accountCtx, isProfileAudit, dProfile } = {}) {
  if (isAccountChanged) return accountCtx?.changedFields || []
  const ed = profileEventDetails(e)
  const fromEd = readUpdatedFields(ed)
  if (fromEd.length) return fromEd
  if (Array.isArray(e?.updatedFields) && e.updatedFields.length) return e.updatedFields
  if (isProfileAudit) return readUpdatedFields(dProfile) || []
  return []
}

function resolveFieldsBadgeVariant(e) {
  if (isStudentProfileUpdateEvent(e)) return 'student'
  if (isAuditUpdateEvent(e)) return 'amber'
  return 'neutral'
}

function isUserAccountChangedEvent(e) {
  const d = profileEventDetails(e)
  const activity = String(e?.activityType || d?.activityType || '').toUpperCase()
  const eventToken = String(
    d?.type || d?.eventType || e?.eventType || e?.raw?.type || e?.activityType || '',
  )
  const eventLower = eventToken.toLowerCase()

  if (isNonProfileLedgerType(activity) || isNonProfileLedgerType(eventToken)) return false
  if (
    activity === 'USER_SIGNED_IN' ||
    activity === 'USER_SESSION_STARTED' ||
    activity === 'LOGIN_FAILED' ||
    activity === 'TERMS_ACCEPTED' ||
    activity === 'AUTH_LOCKOUT'
  ) {
    return false
  }

  if (eventLower === 'user_account_changed') return true
  if (activity === 'USER_ACCOUNT_CHANGED') {
    const fields =
      (Array.isArray(d?.updatedFields) && d.updatedFields.length ? d.updatedFields : null) ||
      (Array.isArray(d?.changed_fields) && d.changed_fields.length ? d.changed_fields : null) ||
      (d?.detailedDiffs && typeof d.detailedDiffs === 'object' && Object.keys(d.detailedDiffs).length
        ? Object.keys(d.detailedDiffs)
        : null)
    return Boolean(fields?.length)
  }
  if (e?.source === 'ledger' && eventLower === 'user_account_changed') return true

  const displayType = String(d?.displayType || '').trim()
  if (
    displayType === 'Profile Updated (Account)' ||
    displayType === 'User Account Updated / Changed'
  ) {
    return eventLower === 'user_account_changed' || activity === 'USER_ACCOUNT_CHANGED'
  }
  return false
}

function accountChangeContext(e) {
  const d = profileEventDetails(e)
  const p = d?.payload && typeof d.payload === 'object' ? d.payload : d
  const performedBy = p?.performed_by
    ? { ...p.performed_by }
    : {
        id: p?.actorUserId || d?.actorUserId || e?.actorUserId,
        name: p?.actorName || d?.actorName || e?.actorName || '',
        email: p?.actorEmail || d?.actorEmail || e?.actorEmail || '',
      }
  if (!String(performedBy.name || '').trim()) {
    performedBy.name = 'Administrator'
  }
  const targetUser = p?.target_user || {
    id: p?.targetUserId || d?.targetUserId || '',
    name: p?.targetName || d?.targetName || '',
    email: p?.targetEmail || d?.targetEmail || '',
    role: p?.targetRole || d?.targetRole || e?.userRole || '',
  }
  const changedFields =
    (Array.isArray(p?.changed_fields) && p.changed_fields.length ? p.changed_fields : null) ||
    (Array.isArray(e?.updatedFields) && e.updatedFields.length ? e.updatedFields : null) ||
    readUpdatedFields(d) ||
    []
  return { performedBy, targetUser, changedFields }
}

function isProfileUpdateEvent(e) {
  if (isUserAccountChangedEvent(e)) return true
  const d = profileEventDetails(e)
  const displayType = String(d?.type || '').trim()
  if (displayType === 'User updates their profile' || displayType === 'Profile updated (account)') {
    return true
  }
  if (e?.source === 'lms' && String(e?.activityType) === 'USER_PROFILE_UPDATED') return true
  const t = String(e?.eventType || '').toLowerCase()
  return t === 'profile_updated' || t === 'user_profile_updated'
}

function isStudentProfileUpdateEvent(e) {
  const d = profileEventDetails(e)
  const p = d?.payload && typeof d.payload === 'object' ? d.payload : d
  if (p?.studentRecordId != null) return true
  return String(d?.type || '').trim() === 'User updates their profile'
}

function profileEventDetails(e) {
  return e?.detailsObj || e?.raw?.eventData || e?.raw?.details || {}
}

function isAdminProfileSource(source) {
  return String(source || '').toLowerCase() === 'admin'
}

function UpdatedFieldsBadges({ fields, className = '', variant = 'neutral', showFieldLabel = false }) {
  const list = Array.isArray(fields) ? fields.filter(Boolean) : []
  if (!list.length) return null
  const chipClass =
    variant === 'student'
      ? 'mr-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700'
      : variant === 'amber'
        ? 'mr-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
        : 'mr-1 rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700'
  return (
    <div className={`mt-1.5 flex flex-wrap items-center gap-1 ${className}`.trim()}>
      {variant === 'student' || showFieldLabel ? (
        <span className="text-xs font-medium text-neutral-500">Changed Fields:</span>
      ) : null}
      {list.map((field) => (
        <span key={field} className={chipClass}>
          {field}
        </span>
      ))}
    </div>
  )
}

function fmtRelative(ts) {
  if (!ts) return ''
  const d = coerceAuditTimestamp(ts)
  if (!d) return ''
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const mins = Math.round(abs / 60000)
  const hours = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (mins < 60) return rtf.format(Math.sign(diffMs) * mins, 'minute')
  if (hours < 24) return rtf.format(Math.sign(diffMs) * hours, 'hour')
  return rtf.format(Math.sign(diffMs) * days, 'day')
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())
}

/** Split auth-normalized "Name (email@x.com)" into separate fields. */
function parseCombinedUserLabel(combined) {
  const s = String(combined || '').trim()
  if (!s) return { name: '', email: '' }
  const m = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (m) {
    const name = m[1].trim()
    const email = m[2].trim()
    if (looksLikeEmail(email)) return { name, email }
  }
  if (looksLikeEmail(s)) return { name: '', email: s }
  return { name: s, email: '' }
}

function finalizeAuditUserDisplay(displayName, displayEmail) {
  const name = String(displayName || '').trim()
  let email = String(displayEmail || '').trim()
  if (!name && email) return { displayName: email, displayEmail: '' }
  if (email === name) email = ''
  return { displayName: name || email || '—', displayEmail: email }
}

/** Unified User column: line 1 = full name, line 2 = email. */
function resolveAuditUserDisplay(e, ctx = {}) {
  const raw = e?.raw || {}
  const ed = raw?.eventData || e?.detailsObj || {}
  const userObj = raw?.user ?? raw?.actor ?? raw?.account ?? raw?.principal ?? null
  const combined = parseCombinedUserLabel(e?.userEmail)

  const {
    isSecurityAlert = false,
    isLmsLockout = false,
    isAccountChanged = false,
    isProfileAudit = false,
    accountCtx = null,
    dProfile = {},
  } = ctx

  if (isSecurityAlert) {
    return finalizeAuditUserDisplay(pickStr(ed?.actorName, e?.actorName, 'System'), '')
  }

  if (isLmsLockout) {
    return finalizeAuditUserDisplay(
      pickStr(ed?.userName, combined.name, ed?.identifier, combined.email, e?.userEmail),
      pickStr(ed?.userEmail, e?.actorEmail, combined.email, looksLikeEmail(e?.userEmail) ? e.userEmail : ''),
    )
  }

  if (isAccountChanged) {
    return finalizeAuditUserDisplay(
      pickStr(accountCtx?.performedBy?.name, e?.actorName, ed?.actorName, ed?.performed_by?.name),
      pickStr(
        accountCtx?.performedBy?.email,
        e?.actorEmail,
        ed?.actorEmail,
        ed?.performed_by?.email,
      ),
    )
  }

  if (isProfileAudit) {
    return finalizeAuditUserDisplay(
      pickStr(dProfile?.targetName, dProfile?.targetEmail, combined.name, e?.actorName, e?.targetName),
      pickStr(dProfile?.targetEmail, e?.targetEmail, e?.actorEmail, combined.email),
    )
  }

  return finalizeAuditUserDisplay(
    pickStr(
      ed?.name,
      ed?.userName,
      ed?.targetName,
      e?.actorName,
      e?.targetName,
      userObj?.name,
      combined.name,
      ed?.actorName,
    ),
    pickStr(
      ed?.userEmail,
      ed?.targetEmail,
      ed?.actorEmail,
      e?.actorEmail,
      e?.targetEmail,
      userObj?.email,
      raw?.userEmail,
      combined.email,
      looksLikeEmail(e?.userEmail) ? e.userEmail : '',
    ),
  )
}

function humanEventTypeExtended(t) {
  const key = String(t || '')
  return EVENT_LABELS[key] || humanEventTypeCore(t)
}

function useInterval(callback, ms, enabled) {
  const saved = useRef(callback)
  useEffect(() => {
    saved.current = callback
  }, [callback])
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => saved.current?.(), ms)
    return () => clearInterval(id)
  }, [ms, enabled])
}

async function fetchLmsActivity(filters = {}) {
  const params = new URLSearchParams()
  if (filters.userId) params.set('userId', String(filters.userId))
  if (filters.activityType) params.set('activityType', String(filters.activityType))
  if (filters.dateFrom) params.set('dateFrom', String(filters.dateFrom))
  if (filters.dateTo) params.set('dateTo', String(filters.dateTo))
  params.set('limit', String(filters.limit ?? 50))
  params.set('offset', String(filters.offset ?? 0))

  const res = await fetch(`/api/monitoring/lms-activity?${params.toString()}`, { credentials: 'include' })
  const json = await res.json().catch(() => ({}))
  // LMS activity is PostgreSQL-backed and admin-gated. If it fails, we still want Better Auth
  // audit logs to render (unified page should be resilient).
  if (!res.ok) {
    return {
      events: [],
      total: 0,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
      _lmsError: json?.message || `Could not load LMS activity logs (HTTP ${res.status}).`,
    }
  }
  return json
}

function normalizeLedgerEvent(raw) {
  const ed = raw?.eventData || raw?.details || {}
  const n = normalizeAuditEvent(raw)
  const ledgerType = String(raw?.type || raw?.eventType || ed?.type || '').trim()
  const activityType =
    String(raw?.activityType || ed?.activityType || '').trim() ||
    ledgerTypeToActivityType(ledgerType)
  const eventType = ledgerType || String(raw?.eventType || '').trim()
  return {
    ...n,
    source: 'ledger',
    eventType,
    activityType,
    actorName: ed?.actorName || ed?.performed_by?.name || '',
    actorEmail: ed?.actorEmail || ed?.performed_by?.email || '',
    updatedFields:
      (Array.isArray(ed?.changed_fields) && ed.changed_fields) ||
      (Array.isArray(ed?.updatedFields) && ed.updatedFields) ||
      [],
    detailsObj: ed,
    raw,
  }
}

function normalizeLmsEvent(raw) {
  const details = raw?.details && typeof raw.details === 'object' ? { ...raw.details } : raw?.details ?? null
  if (details && typeof details === 'object') {
    if (raw?.targetName && !details.targetName) details.targetName = raw.targetName
    if (raw?.targetEmail && !details.targetEmail) details.targetEmail = raw.targetEmail
    if (raw?.actorName && !details.actorName) details.actorName = raw.actorName
    if (raw?.actorEmail && !details.actorEmail) details.actorEmail = raw.actorEmail
    if (raw?.actorRole && !details.actorRole) details.actorRole = raw.actorRole
  }
  const updatedFields =
    Array.isArray(raw?.updatedFields) && raw.updatedFields.length
      ? raw.updatedFields.map(String).filter(Boolean)
      : readUpdatedFields(details)
  return {
    source: 'lms',
    id: raw?.id || '',
    time: raw?.timestamp || raw?.time || null,
    userId: raw?.userId || '',
    userEmail: raw?.userEmail || '',
    userRole: raw?.userRole || '',
    activityType: raw?.activityType || '',
    resourceId: raw?.resourceId || '',
    actorName: raw?.actorName || details?.actorName || '',
    actorEmail: raw?.actorEmail || details?.actorEmail || '',
    actorRole: raw?.actorRole || details?.actorRole || '',
    updatedFields,
    detailsObj: details,
    raw,
  }
}

function unifiedActivityLabel(e) {
  const d = profileEventDetails(e)
  if (d?.displayType && !isUserAccountChangedEvent(e)) return String(d.displayType)
  const mapped = getEventLabel(e?.eventType, e?.activityType)
  if (mapped) return mapped
  if (isUserAccountChangedEvent(e)) {
    return EVENT_LABELS.user_account_changed || d?.displayType || 'Profile Updated (Account)'
  }
  if (d?.type) return String(d.type)
  if (d?.displayType) return String(d.displayType)
  if (e?.source === 'auth') return humanEventTypeExtended(e?.eventType)
  const t = String(e?.activityType || '')
  if (t === 'USER_SIGNED_IN') return 'User Signed In'
  if (t === 'USER_ACCOUNT_CHANGED') return 'Profile Updated (Account)'
  if (t === 'USER_PROFILE_UPDATED') return 'Profile updated (account)'
  if (t === 'AUTH_LOCKOUT') return 'Account Locked'
  if (t === 'SUSPICIOUS_INPUT_DETECTED') return 'Security Alert'
  if (t === 'BACKUP_CREATED') return 'Backup Created'
  if (t === 'BACKUP_RESTORED') return 'Data Restored'
  if (t === 'BACKUP_DELETED') return 'Backup Deleted'
  if (t === 'BACKUP_SCHEDULE_UPDATED') return 'Backup Schedule Updated'
  if (t === 'STUDENT_CREATED') return 'Student created'
  if (t === 'STUDENT_UPDATED') return 'Student updated'
  if (t === 'STUDENT_DELETED') return 'Student archived'
  if (t === 'STUDENT_RESTORED') return 'Student restored'
  if (t === 'STUDENT_PERMANENTLY_PURGED') return 'Student permanently purged'
  if (t === 'STUDENT_IMMEDIATELY_PURGED') return 'Student immediately purged'
  if (t === 'FACULTY_CREATED') return 'Faculty created'
  if (t === 'FACULTY_UPDATED') return 'Faculty updated'
  if (t === 'FACULTY_DELETED') return 'Faculty archived'
  if (t === 'FACULTY_RESTORED') return 'Faculty restored'
  if (t === 'FACULTY_PERMANENTLY_PURGED') return 'Faculty permanently purged'
  if (t === 'FACULTY_IMMEDIATELY_PURGED') return 'Faculty immediately purged'
  if (t === 'ARCHIVED_RECORD_ACCESSED') return 'Archived record viewed'
  if (t === 'ACCOUNT_AUTO_PURGED') return 'Account auto-deleted after retention'
  if (t === 'ACCOUNT_AUTO_PURGE_WARNING') return 'Account auto-deletion warning'
  if (t === 'ACCOUNT_AUTO_PURGE_DRY_RUN') return 'Account auto-deletion dry-run'
  if (t === 'PASSWORD_RESET_REQUESTED' || t === 'password_reset_requested') {
    return 'Password reset requested (user)'
  }
  if (t === 'ADMIN_INITIATED_PASSWORD_RESET' || t === 'admin_initiated_password_reset') {
    return 'Admin sent password reset email'
  }
  if (t === 'PASSWORD_RESET_COMPLETED' || t === 'password_reset_completed') {
    return 'Password reset completed'
  }
  if (t === 'GRADE_OVERRIDE') return 'Grade override'
  if (t === 'SCORE_OVERWRITE_REQUESTED') return 'Score overwrite requested'
  if (t === 'SCORE_OVERWRITE_APPROVED') return 'Score overwrite approved'
  if (t === 'SCORE_OVERWRITE_REJECTED') return 'Score overwrite rejected'
  if (t === 'GOOGLE_DRIVE_CONNECTED' || t === 'google_drive_connected') return 'Google Drive Connected'
  if (t === 'GOOGLE_DRIVE_DISCONNECTED' || t === 'google_drive_disconnected') return 'Google Drive Disconnected'
  if (t === 'BACKUP_UPLOADED_TO_GDRIVE' || t === 'backup_uploaded_to_gdrive') return 'Backup Uploaded to Drive'
  if (t === 'LESSON_ACCESSED') return 'Lesson Access'
  if (t === 'FILE_UPLOADED') return 'File Upload'
  if (t === 'GRADE_EXPORTED') return 'Grade Export'
  if (t === 'ASSIGNMENT_SUBMITTED') return 'Assignment Submitted'
  if (t === 'ANNOUNCEMENT_POSTED') return 'Announcement Posted'
  if (t === 'CURRICULUM_CREATED' || t === 'CURRICULUM_UPLOADED') return 'Curriculum uploaded'
  if (t === 'CURRICULUM_UPDATED') return 'Curriculum updated'
  if (t === 'CURRICULUM_DELETED') return 'Curriculum deleted'
  if (t === 'SECTION_CREATED') return 'Section created'
  if (t === 'SECTION_UPDATED') return 'Section updated'
  if (t === 'SECTION_DELETED') return 'Section deleted'
  if (t === 'SUBJECT_CREATED') return 'Subject created'
  if (t === 'SUBJECT_UPDATED') return 'Subject updated'
  if (t === 'SUBJECT_DELETED') return 'Subject deleted'
  if (t === 'ANNOUNCEMENT_CREATED') return 'Announcement created'
  if (t === 'ANNOUNCEMENT_UPDATED') return 'Announcement updated'
  if (t === 'ANNOUNCEMENT_DELETED') return 'Announcement deleted'
  if (t === 'TERMS_ACCEPTED') return 'Terms & Conditions Accepted'
  return t || 'LMS Activity'
}

function unifiedDetails(e) {
  const d = e?.detailsObj || {}
  const authType = String(e?.eventType || d?.eventType || d?.type || '').trim().toLowerCase()
  const activity = String(e?.activityType || '').trim().toUpperCase()
  if (
    authType === 'session_created' ||
    activity === 'USER_SESSION_STARTED' ||
    activity === 'SESSION_CREATED'
  ) {
    const formatted = formatDescription(authType || 'session_created', d?.description, auditEventMetadata(e))
    return formatted || '—'
  }
  if (e?.source === 'auth') {
    return '—'
  }
  const t = String(e?.activityType || '')
  if (t === 'USER_PROFILE_UPDATED') {
    const fields = Array.isArray(d.updatedFields) ? d.updatedFields.join(', ') : ''
    const src = isAdminProfileSource(d.source) ? 'Admin update' : 'Self-service'
    const actor = d.actorEmail && isAdminProfileSource(d.source) ? ` • By ${d.actorEmail}` : ''
    return [src, fields ? `Fields: ${fields}` : '', actor].filter(Boolean).join(' · ') || '—'
  }
  if (t === 'USER_SIGNED_IN') {
    const id = d?.identifier ? `Identifier: ${d.identifier}` : ''
    const method = d?.method ? `Method: ${d.method}` : ''
    return [id, method].filter(Boolean).join(' • ') || 'Signed in.'
  }
  if (t === 'LOGIN_FAILED') {
    const loginId = d?.loginId || d?.identifier
    const accountType = d?.accountType ? `Account: ${d.accountType}` : ''
    const attempts = d?.attempts != null ? `Attempts: ${d.attempts}` : ''
    const portal = loginSecurityPortalLabel(d)
    const suspicious = d?.suspiciousLoginDetected ? 'Suspicious' : ''
    return [
      loginId ? `Login ID: ${loginId}` : '',
      accountType,
      attempts,
      portal,
      suspicious,
      d?.reason,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  }
  if (t === 'AUTH_LOCKOUT') {
    const attempts = d?.attempts != null ? `Attempts: ${d.attempts}` : ''
    const loginId = d?.loginId || d?.identifier
    const username = d?.username ? `Username: ${d.username}` : ''
    const userId = d?.targetUserId ? `User ID: ${d.targetUserId}` : ''
    const accountType = d?.accountType ? `Account: ${d.accountType}` : ''
    const portal = loginSecurityPortalLabel(d)
    const until = d?.lockedUntil ? `Locked until: ${String(d.lockedUntil)}` : ''
    const suspicious = d?.suspiciousLoginDetected ? 'Suspicious' : ''
    return [
      d?.reason,
      attempts,
      loginId ? `Login ID: ${loginId}` : '',
      username,
      userId,
      accountType,
      portal,
      until,
      suspicious,
    ]
      .filter(Boolean)
      .join(' · ') || 'Account locked after failed sign-in attempts.'
  }
  if (t === 'SUSPICIOUS_INPUT_DETECTED') {
    const endpoint = d?.endpoint ? String(d.endpoint) : ''
    return endpoint
      ? `Suspicious input detected on ${endpoint}`
      : 'Suspicious input detected'
  }
  if (t === 'BACKUP_CREATED' || t === 'BACKUP_RESTORED' || t === 'BACKUP_DELETED') {
    const name = d?.backupName || d?.description || ''
    const size = d?.sizeMb != null ? `Size: ${d.sizeMb} MB` : ''
    const tables = d?.tablesCount != null ? `Tables: ${d.tablesCount}` : ''
    return [name, size, tables].filter(Boolean).join(' · ') || d?.description || '—'
  }
  if (t === 'BACKUP_SCHEDULE_UPDATED') {
    const before = d?.before || {}
    const after = d?.after || {}
    const fmt = (s) =>
      ['daily', 'weekly', 'monthly']
        .map((k) => `${k}: ${s?.[k] ? 'on' : 'off'}`)
        .join(', ')
    return [fmt(before) ? `Before: ${fmt(before)}` : '', fmt(after) ? `After: ${fmt(after)}` : '']
      .filter(Boolean)
      .join(' · ') || d?.description || '—'
  }
  if (
    t === 'PASSWORD_RESET_REQUESTED' ||
    t === 'password_reset_requested' ||
    t === 'PASSWORD_RESET_COMPLETED' ||
    t === 'password_reset_completed'
  ) {
    const email = d?.email || ''
    const initiated =
      d?.initiated_by === 'user' || d?.source === 'self'
        ? 'Initiated by: the user themselves'
        : d?.source === 'admin'
          ? 'Initiated by: admin'
          : ''
    return [d?.description, email, initiated].filter(Boolean).join(' · ') || '—'
  }
  if (t === 'ADMIN_INITIATED_PASSWORD_RESET' || t === 'admin_initiated_password_reset') {
    const admin = d?.admin_name || d?.actorName || 'Administrator'
    const target = d?.target_name || d?.record_name || d?.target_email || ''
    return (
      [
        d?.description,
        `Initiated by: Admin ${admin}`,
        target ? `Target: ${target}` : '',
        d?.target_email ? `Email: ${d.target_email}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || '—'
    )
  }
  if (
    t === 'STUDENT_CREATED' ||
    t === 'STUDENT_UPDATED' ||
    t === 'STUDENT_DELETED' ||
    t === 'STUDENT_RESTORED' ||
    t === 'STUDENT_PERMANENTLY_PURGED' ||
    t === 'STUDENT_IMMEDIATELY_PURGED' ||
    t === 'FACULTY_CREATED' ||
    t === 'FACULTY_UPDATED' ||
    t === 'FACULTY_DELETED' ||
    t === 'FACULTY_RESTORED' ||
    t === 'FACULTY_PERMANENTLY_PURGED' ||
    t === 'FACULTY_IMMEDIATELY_PURGED' ||
    t === 'ARCHIVED_RECORD_ACCESSED'
  ) {
    const name = d?.record_name || d?.recordName || ''
    const id = d?.record_id || d?.recordId || ''
    return [d?.description, name, id ? `ID: ${id}` : ''].filter(Boolean).join(' · ') || '—'
  }
  if (t === 'GOOGLE_DRIVE_CONNECTED' || t === 'google_drive_connected') {
    return d?.connectedEmail ? `Connected as ${d.connectedEmail}` : d?.description || 'Google Drive connected'
  }
  if (t === 'GOOGLE_DRIVE_DISCONNECTED' || t === 'google_drive_disconnected') {
    return d?.previousEmail ? `Was ${d.previousEmail}` : d?.description || 'Google Drive disconnected'
  }
  if (t === 'BACKUP_UPLOADED_TO_GDRIVE' || t === 'backup_uploaded_to_gdrive') {
    return d?.link ? `Uploaded · ${d.link}` : d?.description || 'Backup uploaded to Google Drive'
  }
  if (t === 'LESSON_ACCESSED') return `${d.courseId ? `Course: ${d.courseId}` : ''}${d.lessonId ? `${d.courseId ? ' • ' : ''}Lesson: ${d.lessonId}` : ''}` || '—'
  if (t === 'FILE_UPLOADED') return `${d.fileName ? d.fileName : ''}${d.targetCourse ? ` • Course: ${d.targetCourse}` : ''}` || '—'
  if (t === 'GRADE_EXPORTED') return `${d.gradeLevel ? `Grade: ${d.gradeLevel}` : ''}${d.section ? `${d.gradeLevel ? ' • ' : ''}${d.section}` : ''}` || '—'
  if (t === 'ASSIGNMENT_SUBMITTED') return `${d.assignmentId ? `Assignment: ${d.assignmentId}` : ''}${d.plagiarismScore != null ? ` • Plagiarism: ${d.plagiarismScore}` : ''}` || '—'
  if (t === 'ANNOUNCEMENT_POSTED') return `${d.title ? d.title : ''}${d.audience ? ` • Audience: ${d.audience}` : ''}` || '—'
  if (isCurriculumEvent({ activityType: t })) {
    const sub = curriculumEventSubtitle(d)
    return sub || d?.description || '—'
  }
  if (isSectionEvent({ activityType: t })) {
    const sub = sectionEventSubtitle(d)
    return sub || d?.description || '—'
  }
  if (isSubjectEvent({ activityType: t })) {
    const sub = subjectEventSubtitle(d)
    return sub || d?.description || '—'
  }
  if (isAnnouncementInstituteEvent({ activityType: t })) {
    const sub = announcementInstituteEventSubtitle(d)
    return sub || d?.description || '—'
  }
  if (t === 'TERMS_ACCEPTED') {
    const portalLabel =
      d.portal === 'admin'
        ? 'Admin portal'
        : d.portal === 'faculty'
          ? 'Faculty portal'
          : d.portal === 'student'
            ? 'Student portal'
            : d.portal
              ? String(d.portal)
              : ''
    return [d.description, portalLabel].filter(Boolean).join(' · ') || '—'
  }
  return '—'
}

export default function MonitoringRecords() {
  const navigate = useNavigate()
  const { success: notifySuccess } = useNotify()
  // Auth + LMS audit events (unified table).
  const PAGE_SIZE = 50
  const [unifiedType, setUnifiedType] = useState('') // '' | auth:<eventType> | lms:<activityType>
  const [unifiedRows, setUnifiedRows] = useState([])
  const [unifiedTotal, setUnifiedTotal] = useState(0)
  const [unifiedPage, setUnifiedPage] = useState(0)
  const [unifiedPageInput, setUnifiedPageInput] = useState('1')
  const [unifiedErr, setUnifiedErr] = useState('')
  const [unifiedLocalFallback, setUnifiedLocalFallback] = useState(false)
  const [unifiedDateOpen, setUnifiedDateOpen] = useState(false)
  const [unifiedDateFrom, setUnifiedDateFrom] = useState('')
  const [unifiedDateTo, setUnifiedDateTo] = useState('')
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false)
  const [eventDetailsRow, setEventDetailsRow] = useState(null)
  const [eventsSearch, setEventsSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [clearModalOpen, setClearModalOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(eventsSearch.trim()), 350)
    return () => clearTimeout(timer)
  }, [eventsSearch])

  useEffect(() => {
    setUnifiedPage(0)
    setUnifiedPageInput('1')
  }, [unifiedType, unifiedDateFrom, unifiedDateTo, debouncedSearch])

  const openEventDetails = (row) => {
    setEventDetailsRow(row || null)
    setEventDetailsOpen(true)
  }

  const loadUnified = useCallback(async () => {
    const type = String(unifiedType || '')
    const authEventType = type.startsWith('auth:') ? type.slice('auth:'.length) : ''
    const lmsActivityType = type.startsWith('lms:') ? type.slice('lms:'.length) : ''

    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(unifiedPage * PAGE_SIZE))
      if (authEventType) params.set('eventType', authEventType)
      if (lmsActivityType) params.set('activityType', lmsActivityType)
      if (unifiedDateFrom) params.set('dateFrom', unifiedDateFrom)
      if (unifiedDateTo) params.set('dateTo', unifiedDateTo)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/monitoring/unified?${params.toString()}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || `Could not load Events (HTTP ${res.status}).`)

      const events = Array.isArray(json?.events) ? json.events : []
      const normalized = dedupeAuditEvents(
        events.map((ev) => {
          if (ev?.source === 'lms') return normalizeLmsEvent(ev)
          if (ev?.source === 'ledger') return normalizeLedgerEvent(ev)
          return { ...normalizeAuditEvent(ev), source: 'auth' }
        }),
      )

      setUnifiedRows(normalized)
      setUnifiedTotal(Number(json?.total ?? normalized.length ?? 0))
      setUnifiedLocalFallback(json?.localFallback === true || json?.authSource === 'local_fallback')
      setUnifiedErr('')
    } catch (e) {
      setUnifiedRows([])
      setUnifiedTotal(0)
      setUnifiedLocalFallback(false)
      setUnifiedErr(String(e?.message || e || 'Could not load Events.'))
    }
  }, [unifiedType, unifiedDateFrom, unifiedDateTo, unifiedPage, debouncedSearch])

  useEffect(() => {
    loadUnified()
  }, [loadUnified])

  useEffect(() => {
    const onAuditRefresh = () => {
      if (unifiedPage !== 0) {
        setUnifiedPage(0)
        setUnifiedPageInput('1')
      } else {
        loadUnified()
      }
    }
    window.addEventListener(AUDIT_LOGS_REFRESH_EVENT, onAuditRefresh)
    return () => window.removeEventListener(AUDIT_LOGS_REFRESH_EVENT, onAuditRefresh)
  }, [loadUnified, unifiedPage])

  useInterval(loadUnified, 10_000, true)

  const displayedUnifiedRows = unifiedRows

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="shrink-0">
        <BackButton onClick={() => navigate(-1)} />
        <h2 className="mt-1 text-3xl font-bold text-neutral-900">Audit Logs</h2>
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-4" aria-label="Audit events">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="relative min-h-[42px] min-w-0 flex-1 basis-[min(100%,12rem)]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden>
                🔍
              </span>
              <input
                type="search"
                value={eventsSearch}
                onChange={(e) => setEventsSearch(e.target.value)}
                placeholder="Search events, user, or time…"
                className="h-full min-h-[42px] w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-neutral-800 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                aria-label="Search events"
              />
            </div>
            <select
              className="h-[42px] shrink-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800"
              value={unifiedType}
              onChange={(e) => {
                setUnifiedType(e.target.value)
              }}
            >
              {EVENTS_DROPDOWN.map((it) => (
                <option key={it.id || 'all'} value={it.id ? `auth:${it.id}` : ''}>
                  {it.label}
                </option>
              ))}
              {LMS_EVENTS_DROPDOWN.map((it) => (
                <option key={`lms-${it.id}`} value={`lms:${it.id}`}>
                  {it.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setClearModalOpen(true)}
              className="inline-flex h-[42px] shrink-0 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
            >
              <span className="text-base leading-none" aria-hidden>
                🗑
              </span>
              Clear Logs
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setUnifiedDateOpen((v) => !v)}
                className="inline-flex h-[42px] items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
              >
                <span className="text-base leading-none" aria-hidden>
                  📅
                </span>
                Select date range
              </button>
              {unifiedDateOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-[320px] rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                      From
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
                        value={unifiedDateFrom}
                        onChange={(e) => {
                          setUnifiedDateFrom(e.target.value)
                        }}
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                      To
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
                        value={unifiedDateTo}
                        onChange={(e) => {
                          setUnifiedDateTo(e.target.value)
                        }}
                      />
                    </label>
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        className="text-sm font-semibold text-neutral-600 hover:underline"
                        onClick={() => {
                          setUnifiedDateFrom('')
                          setUnifiedDateTo('')
                        }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                        onClick={() => setUnifiedDateOpen(false)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {unifiedLocalFallback ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              Showing cached audit data from the local database. Better Auth Infra is temporarily unavailable.
            </div>
          ) : null}
          {unifiedErr ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{unifiedErr}</div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto max-h-[calc(100dvh-14rem)]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Affected</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right" aria-label="Details" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {unifiedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-neutral-500" colSpan={6}>
                      No events.
                    </td>
                  </tr>
                ) : displayedUnifiedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-neutral-500" colSpan={6}>
                      No events match your search.
                    </td>
                  </tr>
                ) : (
                  displayedUnifiedRows.map((e, idx) => {
                    const t = pickTime(e)
                    const raw = e?.raw || {}
                    const ed = raw?.eventData || e?.detailsObj || {}
                    const isAccountChanged = isUserAccountChangedEvent(e)
                    const isAuditUpdate = isAuditUpdateEvent(e)
                    const accountCtx = isAccountChanged ? accountChangeContext(e) : null
                    const eventTitle = unifiedActivityLabel(e)
                    const isLmsLockout = isAuditLockoutEvent(e)
                    const isSecurityAlert =
                      e?.source === 'lms' && String(e?.activityType) === 'SUSPICIOUS_INPUT_DETECTED'
                    const isProfileAudit = isProfileUpdateEvent(e) && !isAccountChanged
                    const dProfile = isProfileAudit ? profileEventDetails(e) : {}
                    const changedFields = resolveAuditChangedFields(e, {
                      isAccountChanged,
                      accountCtx,
                      isProfileAudit,
                      dProfile,
                    })
                    const fieldsBadgeVariant = resolveFieldsBadgeVariant(e)
                    const targetDisplayName =
                      accountCtx?.targetUser?.name ||
                      accountCtx?.targetUser?.email ||
                      dProfile?.targetName ||
                      dProfile?.targetEmail ||
                      ''
                    const { displayName, displayEmail } = resolveAuditUserDisplay(e, {
                      isSecurityAlert,
                      isLmsLockout,
                      isAccountChanged,
                      isProfileAudit,
                      accountCtx,
                      dProfile,
                    })
                    const isLmsLoginFailed = isAuditLoginFailedEvent(e)
                    const isSuspiciousLogin =
                      isLmsLoginFailed && !isLmsLockout && Boolean(ed?.suspiciousLoginDetected)
                    const eventSub = isLmsLockout
                      ? [
                          ed?.reason,
                          ed?.attempts != null ? `${ed.attempts} failed sign-in attempts` : null,
                          ed?.loginId || ed?.identifier ? `Login ID: ${ed.loginId || ed.identifier}` : null,
                          ed?.username ? `Username: ${ed.username}` : null,
                          ed?.targetUserId ? `User ID: ${ed.targetUserId}` : null,
                          ed?.accountType ? `Account: ${ed.accountType}` : null,
                          loginSecurityPortalLabel(ed) || null,
                          ed?.lockedUntil ? `Locked until ${formatAuditTime(ed.lockedUntil)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : isLmsLoginFailed
                        ? unifiedDetails(e)
                      : isAccountChanged
                        ? targetDisplayName
                          ? `Profile updated for ${targetDisplayName}`
                          : 'Profile updated'
                        : isProfileAudit
                          ? 'Audited for compliance'
                          : isSessionAuditEvent(e)
                            ? formatDescription(
                                String(e?.eventType || ed?.eventType || 'session_created'),
                                ed?.description,
                                auditEventMetadata(e),
                              )
                            : ed?.userName && eventTitle
                              ? `${eventTitle} for ${ed.userName}`
                              : ed?.userEmail
                                ? `${eventTitle} for ${ed.userEmail}`
                                : ''
                    const teacherSub = teacherEventSubline(e)
                    const displayEventSub = teacherSub || eventSub
                    return (
                      <tr
                        key={auditEventReactKey(e, idx)}
                        className={`group hover:bg-neutral-50 ${resolveAuditRowHighlightClass(e)}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-semibold text-neutral-900">
                            <span className="flex shrink-0 items-center justify-center" aria-hidden>
                              <AuditEventGlyph e={e} />
                            </span>
                            <span>{eventTitle || '—'}</span>
                            {isLmsLockout ? (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-800">
                                Locked
                              </span>
                            ) : isSuspiciousLogin ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Suspicious
                              </span>
                            ) : null}
                          </div>
                          {displayEventSub ? (
                            <div className="text-xs font-medium text-neutral-500">{displayEventSub}</div>
                          ) : null}
                          {isAuditUpdate && changedFields.length ? (
                            <>
                              <div className="mt-1.5 text-xs font-medium text-neutral-500">Fields changed</div>
                              <UpdatedFieldsBadges fields={changedFields} variant={fieldsBadgeVariant} showFieldLabel />
                            </>
                          ) : isProfileAudit ? (
                            <UpdatedFieldsBadges fields={changedFields} variant={fieldsBadgeVariant} />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-medium text-neutral-700">{auditRowModuleLabel(e)}</td>
                        <td className="px-4 py-3 font-medium text-neutral-700">{auditRowAffectedLabel(e)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">{displayName || '—'}</div>
                          {displayEmail ? (
                            <div className="text-xs font-medium text-neutral-500">{displayEmail}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-neutral-900">{fmtRelative(t) || formatAuditTime(t)}</div>
                          <div className="text-xs font-medium text-neutral-500">{formatAuditTime(t)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEventDetails(e)}
                            className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white p-2 text-neutral-700 opacity-0 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
                            aria-label="View details"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M2.1 12.1C3.6 7.7 7.4 5 12 5c4.6 0 8.4 2.7 9.9 7.1-1.5 4.4-5.3 7.1-9.9 7.1-4.6 0-8.4-2.7-9.9-7.1Z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                              />
                              <path
                                d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-sm font-semibold text-neutral-700">
              Page <b>{unifiedPage + 1}</b> of <b>{Math.max(1, Math.ceil(unifiedTotal / PAGE_SIZE))}</b> • Total <b>{unifiedTotal}</b>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3].map((p) => {
                const pageCount = Math.max(1, Math.ceil(unifiedTotal / PAGE_SIZE))
                if (p >= pageCount) return null
                const active = p === unifiedPage
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setUnifiedPage(p)
                      setUnifiedPageInput(String(p + 1))
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      active ? 'bg-[#1e4fa3] text-white' : 'border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              })}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-600">Go to</span>
                <input
                  value={unifiedPageInput}
                  onChange={(e) => setUnifiedPageInput(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-20 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                  onClick={() => {
                    const pageCount = Math.max(1, Math.ceil(unifiedTotal / PAGE_SIZE))
                    const n = Math.max(1, Math.min(pageCount, Number(unifiedPageInput || '1')))
                    setUnifiedPage(n - 1)
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          </div>

          {eventDetailsOpen ? (() => {
            const e = eventDetailsRow || {}
            const raw = e?.raw || {}
            const ed = raw?.eventData || e?.detailsObj || {}
            const t = pickTime(e)
            const eventTitle = unifiedActivityLabel(e)
            const isLmsLockoutModal = isAuditLockoutEvent(e)
            const isAccountChangedModal = isUserAccountChangedEvent(e)
            const accountModalCtx = isAccountChangedModal ? accountChangeContext(e) : null
            const isProfileModal = isProfileUpdateEvent(e) && !isAccountChangedModal
            const dModal = isProfileModal ? profileEventDetails(e) : {}
            const modalChangedFields = resolveAuditChangedFields(e, {
              isAccountChanged: isAccountChangedModal,
              accountCtx: accountModalCtx,
              isProfileAudit: isProfileModal,
              dProfile: dModal,
            })
            const modalTargetName =
              accountModalCtx?.targetUser?.name || accountModalCtx?.targetUser?.email || ''
            const { displayName: modalDisplayName, displayEmail: modalDisplayEmail } = resolveAuditUserDisplay(e, {
              isLmsLockout: isLmsLockoutModal,
              isAccountChanged: isAccountChangedModal,
              isProfileAudit: isProfileModal,
              accountCtx: accountModalCtx,
              dProfile: dModal,
            })
            const isSessionModal = isSessionAuditEvent(e)
            const isLmsLoginFailedModal = isAuditLoginFailedEvent(e)
            const subtitle = isLmsLockoutModal
              ? [
                  ed?.reason,
                  ed?.attempts != null ? `${ed.attempts} failed attempts` : null,
                  ed?.loginId || ed?.identifier ? `Login ID: ${ed.loginId || ed.identifier}` : null,
                  ed?.username ? `Username: ${ed.username}` : null,
                  ed?.targetUserId ? `User ID: ${ed.targetUserId}` : null,
                  ed?.accountType ? `Account: ${ed.accountType}` : null,
                  loginSecurityPortalLabel(ed) || null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : isLmsLoginFailedModal
                ? unifiedDetails(e)
              : isAccountChangedModal
                ? modalTargetName
                  ? `Profile updated for ${modalTargetName}`
                  : 'Profile updated'
                : isProfileModal
                  ? isAdminProfileSource(dModal.source)
                    ? `Updated by admin (${dModal.actorEmail || e?.actorEmail || 'unknown'})`
                    : 'Self-service account update'
                  : isSessionModal
                    ? formatDescription(
                        String(e?.eventType || ed?.eventType || 'session_created'),
                        ed?.description,
                        auditEventMetadata(e),
                      )
                    : ed?.userName
                      ? `Session created for ${ed.userName}`
                      : ed?.userEmail
                        ? `Session created for ${ed.userEmail}`
                        : ''
            const eventDataJson = formatAuditModalEventDataJson(e, eventTitle)

            return (
              <div
                className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 md:items-center"
                role="dialog"
                aria-modal="true"
                onMouseDown={(ev) => {
                  if (ev.target === ev.currentTarget) setEventDetailsOpen(false)
                }}
              >
                <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-[#0a0a0a] text-white shadow-2xl ring-1 ring-white/10">
                  <div className="relative px-6 pb-2 pt-6">
                    <button
                      type="button"
                      className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#0a0a0a] text-white/80 hover:bg-white/5 hover:text-white"
                      onClick={() => setEventDetailsOpen(false)}
                      aria-label="Close"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>

                    <div className="flex items-start gap-3 pr-10">
                      <span className="mt-1 flex shrink-0 text-white/90" aria-hidden>
                        <AuditEventGlyph e={e} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-2xl font-bold leading-tight">{eventTitle || 'Event Details'}</div>
                        {subtitle ? <div className="mt-1 text-sm font-semibold text-white/60">{subtitle}</div> : null}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 pb-6">
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <div className="divide-y divide-white/10">
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="text-sm font-semibold text-white/60">Time</div>
                          <div className="flex items-baseline gap-3 text-right">
                            <div className="text-sm font-bold text-white">{fmtRelative(t) || formatAuditTime(t)}</div>
                            <div className="text-sm font-semibold text-white/60">{formatAuditTime(t)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="text-sm font-semibold text-white/60">User</div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-white">{modalDisplayName || '—'}</div>
                            {modalDisplayEmail ? (
                              <div className="text-sm font-semibold text-white/60">{modalDisplayEmail}</div>
                            ) : null}
                          </div>
                        </div>
                        {isProfileModal || isAccountChangedModal ? (
                          <div className="px-5 py-4">
                            <div className="text-sm font-semibold text-white/60">Fields changed</div>
                            <UpdatedFieldsBadges
                              fields={modalChangedFields}
                              variant={isStudentProfileUpdateEvent(e) ? 'student' : 'neutral'}
                              showFieldLabel={isAccountChangedModal}
                              className="[&_span]:border-blue-400/40 [&_span]:bg-blue-500/20 [&_span]:text-blue-100"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="text-xs font-bold uppercase tracking-wider text-white/50">Event Data</div>
                      <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-white/10 bg-[#0f0f10] p-5 text-xs leading-relaxed text-white/90">
                        {eventDataJson || '{}'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )
          })() : null}
        </div>
      </section>

      <ClearAuditLogsModal
        open={clearModalOpen}
        totalInList={unifiedTotal}
        onClose={() => setClearModalOpen(false)}
        onCleared={(result) => {
          const deleted = Number(result?.deleted ?? 0)
          notifySuccess(
            result?.message ||
              `${deleted} log ${deleted === 1 ? 'entry' : 'entries'} deleted successfully.`,
          )
          dispatchAuditLogsRefresh({ reason: 'audit_logs_cleared' })
          setUnifiedPage(0)
          setUnifiedPageInput('1')
        }}
      />
    </div>
  )
}

