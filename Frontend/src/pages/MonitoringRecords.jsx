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
import { AUDIT_LOGS_REFRESH_EVENT } from '../lib/auditLogRefresh.js'
import { formatAuditModalEventDataJson } from '../lib/formatAuditModalEventData.js'
import { auditEventReactKey, dedupeAuditEvents } from '../lib/dedupeById.js'
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
  { id: 'session_created', label: 'New session created' },
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
  'ANNOUNCEMENT_POSTED',
  'CURRICULUM_UPLOADED',
]

/** LMS-backed rows merged into Events (filter with unifiedType `lms:…`). */
const LMS_EVENTS_DROPDOWN = [
  { id: 'USER_ACCOUNT_CHANGED', label: 'Profile Updated (Account)' },
  { id: 'USER_PROFILE_UPDATED', label: 'Profile updated (account)' },
]

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

function isUserAccountChangedEvent(e) {
  const d = profileEventDetails(e)
  const t = String(d?.type || d?.eventType || e?.eventType || e?.activityType || '').toLowerCase()
  if (t === 'user_account_changed') return true
  if (String(e?.activityType || '').toUpperCase() === 'USER_ACCOUNT_CHANGED') return true
  if (e?.source === 'ledger' && String(e?.eventType || '').toLowerCase() === 'user_account_changed') return true
  return (
    String(d?.displayType || '').trim() === 'Profile Updated (Account)' ||
    String(d?.displayType || '').trim() === 'User Account Updated / Changed'
  )
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

/** UI label for RBAC bucket (Admin / Faculty / Student). */
function mapRoleToRbacLabel(roleRaw) {
  const r = String(roleRaw || '').trim().toLowerCase()
  if (r === 'admin') return 'Administrator'
  if (r === 'teacher' || r === 'user') return 'Faculty'
  if (r === 'student') return 'Student'
  if (r) return r.charAt(0).toUpperCase() + r.slice(1)
  return ''
}

/** Long random auth/user ids (cuid, nanoid, UUID) — not shown as "Sign-in ID" in the audit UI. */
function isOpaqueInternalUserId(code) {
  const s = String(code || '').trim()
  if (s.length < 16) return false
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ) {
    return true
  }
  if (s.length >= 20 && /^[A-Za-z0-9_-]+$/.test(s)) return true
  return false
}

/**
 * Resolve role + sign-in / faculty / student identifier for Audit Logs (auth Infra + LMS rows).
 */
function resolveAuditActorContext(e) {
  const raw = e?.raw || {}
  const ed = raw?.eventData || e?.detailsObj || {}
  const userObj = raw?.user ?? raw?.actor ?? raw?.account ?? raw?.principal ?? null

  if (e?.source === 'lms') {
    const roleRaw = pickStr(e.userRole, ed.userRole, ed.targetRole, ed.actorRole)
    const roleLabel = mapRoleToRbacLabel(roleRaw)
    const codeId = pickStr(
      ed.username && !looksLikeEmail(ed.username) ? ed.username : '',
      ed.targetUsername && !looksLikeEmail(ed.targetUsername) ? ed.targetUsername : '',
      ed.facultyCode,
      ed.facultyUsername,
      ed.studentCode,
      ed.studentId,
      ed.loginId,
      ed.identifier && !looksLikeEmail(ed.identifier) ? ed.identifier : '',
      e.resourceId,
      !isOpaqueInternalUserId(String(e.userId || '')) ? e.userId : '',
    )
    return { roleRaw, roleLabel, codeId }
  }

  const roleRaw = pickStr(ed.role, ed.userRole, userObj?.role, raw.role, raw.userRole, raw?.user?.role)
  const roleLabel = mapRoleToRbacLabel(roleRaw)
  const idFromEd = pickStr(ed.username, ed.userUsername, userObj?.username, raw.username)
  const idNonEmail =
    pickStr(
      ed.identifier && !looksLikeEmail(ed.identifier) ? ed.identifier : '',
      ed.facultyCode,
      ed.facultyUsername,
      ed.studentCode,
      ed.studentId,
      ed.loginId,
    ) || (!looksLikeEmail(idFromEd) ? idFromEd : '')
  const uid = pickStr(e.userId, raw.userId, userObj?.id, ed.userId)
  const uidHuman = uid && !isOpaqueInternalUserId(uid) ? uid : ''
  const codeId =
    idNonEmail ||
    (idFromEd && !looksLikeEmail(idFromEd) ? idFromEd : '') ||
    uidHuman
  return { roleRaw, roleLabel, codeId }
}

/** Label for the identifier column (Faculty Code ID, Student Code ID, or admin sign-in). */
function credentialFieldLabel(ctx) {
  const r = String(ctx?.roleRaw || '').trim().toLowerCase()
  const lbl = String(ctx?.roleLabel || '').trim()
  if (r === 'student' || lbl === 'Student') return 'Student Code ID'
  if (r === 'teacher' || r === 'user' || lbl === 'Faculty') return 'Faculty Code ID'
  if (r === 'admin' || lbl === 'Administrator') return 'Sign-in ID'
  return 'Sign-in ID'
}

const ADMIN_SIGNIN_AUDIT_NOISE = 'Administrator · Sign-in ID: admin'

function formatRbacCodeLine(ctx) {
  const role = String(ctx?.roleLabel || '').trim()
  const code = String(ctx?.codeId || '').trim()
  const field = credentialFieldLabel(ctx)
  if (field === 'Sign-in ID' && isOpaqueInternalUserId(code)) {
    return ''
  }
  // Default institute admin (username admin) — omit redundant sign-in label from audit UI/payload.
  if (role === 'Administrator' && code.toLowerCase() === 'admin') {
    return ''
  }
  let line = ''
  if (role && code) line = `${role} · ${field}: ${code}`
  else if (role) line = `${role} · ${field}: —`
  else if (code) line = `${field}: ${code}`
  if (!line || line === ADMIN_SIGNIN_AUDIT_NOISE || line.includes(ADMIN_SIGNIN_AUDIT_NOISE)) {
    return ''
  }
  return line
}

function SvgGlyph({ className, children }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {children}
    </svg>
  )
}

/** Distinct icons per event type (replaces emoji). */
function AuditEventGlyph({ e }) {
  const cn = 'h-5 w-5 shrink-0 text-neutral-600'
  const isLms = e?.source === 'lms'
  if (isLms) {
    const t = String(e?.activityType || '').toUpperCase()
    if (t === 'AUTH_LOCKOUT') {
      return (
        <SvgGlyph className={cn}>
          <circle cx="12" cy="12" r="10" />
          <path d="M4.9 4.9l14.2 14.2M16 8v4M8 8v8" strokeLinecap="round" />
        </SvgGlyph>
      )
    }
    if (t === 'USER_ACCOUNT_CHANGED') {
      return (
        <SvgGlyph className={`${cn} text-amber-800`}>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    }
    if (t === 'USER_PROFILE_UPDATED') {
      return (
        <SvgGlyph className={cn}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19 21v-1a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v1M12 11V3M9 6h6" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    }
    if (t === 'USER_SIGNED_IN') {
      return (
        <SvgGlyph className={cn}>
          <path d="M15 3h4v4M10 14 21 3M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h7" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    }
    if (t === 'LESSON_ACCESSED') {
      return (
        <SvgGlyph className={cn}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" strokeLinejoin="round" />
          <path d="M8 7h8M8 11h8" strokeLinecap="round" />
        </SvgGlyph>
      )
    }
    if (t === 'FILE_UPLOADED' || t === 'GRADE_EXPORTED') {
      return (
        <SvgGlyph className={cn}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
          <path d="M14 2v6h6M12 18v-6M9 15h6" strokeLinecap="round" />
        </SvgGlyph>
      )
    }
    if (t === 'ASSIGNMENT_SUBMITTED') {
      return (
        <SvgGlyph className={cn}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    }
    if (t === 'ANNOUNCEMENT_POSTED' || t === 'CURRICULUM_UPLOADED') {
      return (
        <SvgGlyph className={cn}>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    }
    if (t === 'BACKUP_CREATED' || t === 'BACKUP_RESTORED' || t === 'BACKUP_DELETED') {
      return (
        <SvgGlyph className={`${cn} text-sky-800`}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
          {t === 'BACKUP_RESTORED' ? (
            <path d="M12 11v6M9 14l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          ) : t === 'BACKUP_DELETED' ? (
            <path d="M9 14h6" strokeLinecap="round" />
          ) : (
            <path d="M12 11v5M9 14h6" strokeLinecap="round" />
          )}
        </SvgGlyph>
      )
    }
    if (t === 'SUSPICIOUS_INPUT_DETECTED') {
      return (
        <SvgGlyph className={`${cn} text-amber-700`}>
          <path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z" strokeLinejoin="round" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </SvgGlyph>
      )
    }
    return (
      <SvgGlyph className={cn}>
        <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" />
      </SvgGlyph>
    )
  }

  const t = String(e?.eventType || '').toLowerCase()
  if (t.startsWith('security_')) {
    return (
      <SvgGlyph className={`${cn} text-amber-700`}>
        <path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z" strokeLinejoin="round" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('sign_in_failed') || t === 'user_sign_in_failed') {
    return (
      <SvgGlyph className={`${cn} text-red-600`}>
        <path d="M10.3 3.6h3.4L21 20H3L10.3 3.6Z" strokeLinejoin="round" />
        <path d="M12 9v4M12 16h.01" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('signed_in') || t === 'user_signed_in') {
    return (
      <SvgGlyph className={`${cn} text-emerald-700`}>
        <path d="M15 3h4v4M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h7" strokeLinecap="round" strokeLinejoin="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('signed_out') || t === 'user_signed_out') {
    return (
      <SvgGlyph className={cn}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('session_created')) {
    return (
      <SvgGlyph className={`${cn} text-blue-700`}>
        <rect x="3" y="11" width="18" height="10" rx="2" strokeLinejoin="round" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4M12 15v2" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('session_revoked')) {
    return (
      <SvgGlyph className={cn}>
        <rect x="3" y="11" width="18" height="10" rx="2" strokeLinejoin="round" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1M17 14l-5 5M12 19l5-5" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('password_reset') || t.includes('password_changed')) {
    return (
      <SvgGlyph className={cn}>
        <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Z" strokeLinejoin="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
      </SvgGlyph>
    )
  }
  if (t.includes('two_factor')) {
    return (
      <SvgGlyph className={cn}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M12 15v2M9 11V7a3 3 0 0 1 6 0v4" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('email_verification') || t.includes('email_verified') || t === 'email_sent') {
    return (
      <SvgGlyph className={cn}>
        <path d="M4 6h16v12H4V6Z" strokeLinejoin="round" />
        <path d="m22 7-10 7L2 7" strokeLinecap="round" strokeLinejoin="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('user_account_changed')) {
    return (
      <SvgGlyph className={`${cn} text-amber-800`}>
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('user_created')) {
    return (
      <SvgGlyph className={cn}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" strokeLinecap="round" />
        <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('user_banned') || t.includes('user_deleted')) {
    return (
      <SvgGlyph className={`${cn} text-red-600`}>
        <circle cx="12" cy="12" r="10" />
        <path d="M4.9 4.9l14.2 14.2" strokeLinecap="round" />
      </SvgGlyph>
    )
  }
  if (t.includes('organization_')) {
    return (
      <SvgGlyph className={cn}>
        <path d="M3 21h18M6 21V10l6-4 6 4v11M9 21v-4h6v4" strokeLinecap="round" strokeLinejoin="round" />
      </SvgGlyph>
    )
  }
  return (
    <SvgGlyph className={cn}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </SvgGlyph>
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
  return {
    ...n,
    source: 'ledger',
    eventType: raw?.eventType || raw?.type || 'user_account_changed',
    activityType: 'USER_ACCOUNT_CHANGED',
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
  if (t === 'LESSON_ACCESSED') return 'Lesson Access'
  if (t === 'FILE_UPLOADED') return 'File Upload'
  if (t === 'GRADE_EXPORTED') return 'Grade Export'
  if (t === 'ASSIGNMENT_SUBMITTED') return 'Assignment Submitted'
  if (t === 'ANNOUNCEMENT_POSTED') return 'Announcement Posted'
  if (t === 'CURRICULUM_UPLOADED') return 'Curriculum Upload'
  return t || 'LMS Activity'
}

function unifiedDetails(e) {
  if (e?.source === 'auth') {
    return '—'
  }
  const d = e?.detailsObj || {}
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
  if (t === 'AUTH_LOCKOUT') {
    const attempts = d?.attempts != null ? `Attempts: ${d.attempts}` : ''
    const id = d?.identifier ? `Identifier: ${d.identifier}` : ''
    const until = d?.lockedUntil ? `Locked until: ${String(d.lockedUntil)}` : ''
    return [attempts, id, until].filter(Boolean).join(' • ') || 'Account locked after failed sign-in attempts.'
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
  if (t === 'LESSON_ACCESSED') return `${d.courseId ? `Course: ${d.courseId}` : ''}${d.lessonId ? `${d.courseId ? ' • ' : ''}Lesson: ${d.lessonId}` : ''}` || '—'
  if (t === 'FILE_UPLOADED') return `${d.fileName ? d.fileName : ''}${d.targetCourse ? ` • Course: ${d.targetCourse}` : ''}` || '—'
  if (t === 'GRADE_EXPORTED') return `${d.gradeLevel ? `Grade: ${d.gradeLevel}` : ''}${d.section ? `${d.gradeLevel ? ' • ' : ''}${d.section}` : ''}` || '—'
  if (t === 'ASSIGNMENT_SUBMITTED') return `${d.assignmentId ? `Assignment: ${d.assignmentId}` : ''}${d.plagiarismScore != null ? ` • Plagiarism: ${d.plagiarismScore}` : ''}` || '—'
  if (t === 'ANNOUNCEMENT_POSTED') return `${d.title ? d.title : ''}${d.audience ? ` • Audience: ${d.audience}` : ''}` || '—'
  if (t === 'CURRICULUM_UPLOADED') return `${d.gradeLevel ? `Grade: ${d.gradeLevel}` : ''}${d.fileName ? `${d.gradeLevel ? ' • ' : ''}${d.fileName}` : ''}` || '—'
  return '—'
}

export default function MonitoringRecords() {
  const navigate = useNavigate()
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
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right" aria-label="Details" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {unifiedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-neutral-500" colSpan={4}>
                      No events.
                    </td>
                  </tr>
                ) : displayedUnifiedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-neutral-500" colSpan={4}>
                      No events match your search.
                    </td>
                  </tr>
                ) : (
                  displayedUnifiedRows.map((e, idx) => {
                    const t = pickTime(e)
                    const raw = e?.raw || {}
                    const ed = raw?.eventData || e?.detailsObj || {}
                    const isAccountChanged = isUserAccountChangedEvent(e)
                    const accountCtx = isAccountChanged ? accountChangeContext(e) : null
                    const eventTitle = unifiedActivityLabel(e)
                    const isLmsLockout = e?.source === 'lms' && String(e?.activityType) === 'AUTH_LOCKOUT'
                    const isSecurityAlert =
                      e?.source === 'lms' && String(e?.activityType) === 'SUSPICIOUS_INPUT_DETECTED'
                    const isProfileAudit = isProfileUpdateEvent(e) && !isAccountChanged
                    const dProfile = isProfileAudit ? profileEventDetails(e) : {}
                    const changedFields = isAccountChanged
                      ? accountCtx?.changedFields || []
                      : (Array.isArray(e?.updatedFields) && e.updatedFields.length
                          ? e.updatedFields
                          : readUpdatedFields(dProfile)) || []
                    const targetDisplayName =
                      accountCtx?.targetUser?.name ||
                      accountCtx?.targetUser?.email ||
                      dProfile?.targetName ||
                      dProfile?.targetEmail ||
                      ''
                    const by = isSecurityAlert
                      ? pickStr(ed?.actorName, e?.actorName, 'System')
                      : isLmsLockout
                      ? ed?.userName || ed?.identifier || (e?.userEmail || '').split(' (')[0] || e?.userEmail || '—'
                      : isAccountChanged
                        ? pickStr(
                            accountCtx?.performedBy?.name,
                            e?.actorName,
                            ed?.actorName,
                            ed?.performed_by?.name,
                          ) || '—'
                        : isProfileAudit
                          ? dProfile.targetName ||
                            dProfile.targetEmail ||
                            (e?.userEmail || '').split(' (')[0] ||
                            e?.userEmail ||
                            '—'
                          : pickStr(ed?.userName, e?.actorNamePlain, (e?.userEmail || '').split(' (')[0], e?.userEmail) ||
                            '—'
                    const bySub = isLmsLockout
                      ? ed?.userEmail || e?.userEmail || ''
                      : isAccountChanged
                        ? pickStr(
                            accountCtx?.performedBy?.email,
                            e?.actorEmail,
                            ed?.actorEmail,
                            ed?.performed_by?.email,
                          )
                        : isProfileAudit
                          ? [
                              dProfile.targetEmail && dProfile.targetName !== dProfile.targetEmail
                                ? dProfile.targetEmail
                                : '',
                              isAdminProfileSource(dProfile.source) &&
                              (dProfile.actorEmail || e?.actorEmail)
                                ? `Updated by admin (${dProfile.actorEmail || e.actorEmail})`
                                : 'Self-service (teacher / faculty)',
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : pickStr(ed?.userEmail, e?.actorEmailPlain, e?.userEmail?.includes('(') ? e.userEmail : '')
                    const rbacCtx = isAccountChanged ? null : resolveAuditActorContext(e)
                    const rbacLine = rbacCtx ? formatRbacCodeLine(rbacCtx) : ''
                    const eventSub = isLmsLockout
                      ? [
                          ed?.reason,
                          ed?.attempts != null ? `${ed.attempts} failed sign-in attempts` : null,
                          ed?.identifier ? `Login: ${ed.identifier}` : null,
                          ed?.lockedUntil ? `Locked until ${formatAuditTime(ed.lockedUntil)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : isAccountChanged
                        ? targetDisplayName
                          ? `Profile updated for ${targetDisplayName}`
                          : 'Profile updated'
                        : isProfileAudit
                          ? 'Audited for compliance'
                          : ed?.userName && eventTitle
                            ? `${eventTitle} for ${ed.userName}`
                            : ed?.userEmail
                              ? `${eventTitle} for ${ed.userEmail}`
                              : ''
                    return (
                      <tr
                        key={auditEventReactKey(e, idx)}
                        className={`group hover:bg-neutral-50 ${isProfileAudit || isAccountChanged ? 'bg-amber-50/70 ring-1 ring-inset ring-amber-200/90' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-semibold text-neutral-900">
                            <span className="flex shrink-0 items-center justify-center" aria-hidden>
                              <AuditEventGlyph e={e} />
                            </span>
                            <span>{eventTitle || '—'}</span>
                          </div>
                          {eventSub ? <div className="text-xs font-medium text-neutral-500">{eventSub}</div> : null}
                          {isAccountChanged && changedFields.length ? (
                            <>
                              <div className="mt-1.5 text-xs font-medium text-neutral-500">Fields changed</div>
                              <UpdatedFieldsBadges
                                fields={changedFields}
                                variant={isStudentProfileUpdateEvent(e) ? 'student' : 'neutral'}
                                showFieldLabel
                              />
                            </>
                          ) : isProfileAudit ? (
                            <UpdatedFieldsBadges
                              fields={changedFields}
                              variant={isStudentProfileUpdateEvent(e) ? 'student' : 'neutral'}
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">{by || '—'}</div>
                          {bySub ? <div className="text-xs font-medium text-neutral-500">{bySub}</div> : null}
                          {rbacLine ? (
                            <div className="mt-1 text-xs font-semibold tracking-tight text-neutral-700">{rbacLine}</div>
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
            const isLmsLockoutModal = e?.source === 'lms' && String(e?.activityType) === 'AUTH_LOCKOUT'
            const isAccountChangedModal = isUserAccountChangedEvent(e)
            const accountModalCtx = isAccountChangedModal ? accountChangeContext(e) : null
            const isProfileModal = isProfileUpdateEvent(e) && !isAccountChangedModal
            const dModal = isProfileModal ? profileEventDetails(e) : {}
            const modalChangedFields = isAccountChangedModal
              ? accountModalCtx?.changedFields || []
              : (Array.isArray(e?.updatedFields) && e.updatedFields.length
                  ? e.updatedFields
                  : readUpdatedFields(dModal)) || []
            const modalTargetName =
              accountModalCtx?.targetUser?.name || accountModalCtx?.targetUser?.email || ''
            const by = isLmsLockoutModal
              ? ed?.userName || ed?.identifier || (e?.userEmail || '').split(' (')[0] || e?.userEmail || '—'
              : isAccountChangedModal
                ? pickStr(accountModalCtx?.performedBy?.name, e?.actorName, ed?.actorName) || '—'
                : isProfileModal
                  ? dModal.targetName || dModal.targetEmail || (e?.userEmail || '').split(' (')[0] || e?.userEmail || '—'
                  : pickStr(ed?.userName, e?.actorNamePlain, (e?.userEmail || '').split(' (')[0], e?.userEmail) || '—'
            const rbacModal = isAccountChangedModal ? null : resolveAuditActorContext(e)
            const subtitle = isLmsLockoutModal
              ? [
                  ed?.reason,
                  ed?.attempts != null ? `${ed.attempts} failed attempts` : null,
                  ed?.identifier ? `Login: ${ed.identifier}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : isAccountChangedModal
                ? modalTargetName
                  ? `Profile updated for ${modalTargetName}`
                  : 'Profile updated'
                : isProfileModal
                  ? isAdminProfileSource(dModal.source)
                    ? `Updated by admin (${dModal.actorEmail || e?.actorEmail || 'unknown'})`
                    : 'Self-service account update'
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
                        {rbacModal && formatRbacCodeLine(rbacModal) ? (
                          <div className="mt-2 text-sm font-semibold text-white/75">{formatRbacCodeLine(rbacModal)}</div>
                        ) : null}
                        {isAccountChangedModal && accountModalCtx?.performedBy?.email ? (
                          <div className="mt-1 text-sm font-semibold text-white/60">{accountModalCtx.performedBy.email}</div>
                        ) : null}
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
                          <div className="text-sm font-bold text-white">{by}</div>
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
    </div>
  )
}

