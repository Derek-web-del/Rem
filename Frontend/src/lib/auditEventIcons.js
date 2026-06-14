function normalizeEventTokens(e) {
  const raw = e?.raw || {}
  const ed = e?.detailsObj || raw?.eventData || raw?.details || {}
  const activity = String(e?.activityType || ed?.activityType || '').trim()
  const authType = String(e?.eventType || ed?.eventType || ed?.type || raw?.eventType || raw?.type || '').trim()
  return {
    activityUpper: activity.toUpperCase(),
    activityLower: activity.toLowerCase(),
    authLower: authType.toLowerCase(),
  }
}

/**
 * Map any audit row (auth, LMS, ledger) to a canonical icon key.
 * @param {Record<string, unknown>} e
 * @returns {string}
 */
export function resolveAuditEventIconKey(e) {
  const { activityUpper, activityLower, authLower } = normalizeEventTokens(e)
  const token = activityUpper || authLower

  if (
    token === 'USER_SESSION_STARTED' ||
    token === 'SESSION_CREATED' ||
    authLower.includes('session_created') ||
    activityLower === 'session_created'
  ) {
    return 'session_started'
  }
  if (token === 'USER_SIGNED_OUT' || authLower.includes('signed_out')) return 'signed_out'
  if (token === 'USER_SIGNED_IN' || authLower.includes('signed_in')) return 'signed_in'
  if (token === 'AUTH_LOCKOUT' || authLower === 'auth_lockout') return 'account_locked'
  if (authLower.includes('sign_in_failed') || authLower === 'login_failed' || token === 'LOGIN_FAILED') {
    return 'sign_in_failed'
  }
  if (token === 'SESSION_REVOKED' || authLower.includes('session_revoked')) return 'session_revoked'
  if (token === 'TERMS_ACCEPTED') return 'terms_accepted'
  if (token === 'QUIZ_SUBMITTED') return 'quiz_submitted'
  if (token === 'QUIZ_CREATED') return 'quiz_created'
  if (
    token === 'PASSWORD_CHANGED' ||
    authLower.includes('password_changed') ||
    authLower.includes('password_reset')
  ) {
    return 'password_changed'
  }
  if (token === 'USER_ACCOUNT_CHANGED' || authLower.includes('user_account_changed')) return 'account_changed'
  if (
    token === 'USER_PROFILE_UPDATED' ||
    authLower.includes('profile_updated') ||
    authLower.includes('user_profile_updated')
  ) {
    return 'profile_updated'
  }
  if (
    token === 'USER_CREATED' ||
    authLower.includes('user_created') ||
    authLower.includes('user_signed_up')
  ) {
    return 'user_created'
  }
  if (token === 'ASSIGNMENT_SUBMITTED') return 'assignment_submitted'
  if (token === 'GRADE_OVERRIDE') return 'grade_override'
  if (token === 'ARCHIVED_RECORD_ACCESSED') return 'profile_updated'
  if (
    token === 'STUDENT_CREATED' ||
    token === 'FACULTY_CREATED' ||
    token === 'STUDENT_RESTORED' ||
    token === 'FACULTY_RESTORED'
  ) {
    return 'user_created'
  }
  if (
    token === 'STUDENT_DELETED' ||
    token === 'FACULTY_DELETED' ||
    token === 'STUDENT_PERMANENTLY_PURGED' ||
    token === 'FACULTY_PERMANENTLY_PURGED' ||
    token === 'STUDENT_IMMEDIATELY_PURGED' ||
    token === 'FACULTY_IMMEDIATELY_PURGED'
  ) {
    return 'user_blocked'
  }
  if (token === 'STUDENT_UPDATED' || token === 'FACULTY_UPDATED') return 'profile_updated'
  if (
    token === 'CURRICULUM_CREATED' ||
    token === 'CURRICULUM_UPLOADED' ||
    token === 'CURRICULUM_UPDATED' ||
    token === 'CURRICULUM_DELETED'
  ) {
    return 'file'
  }
  if (token === 'SECTION_CREATED' || token === 'SECTION_UPDATED' || token === 'SECTION_DELETED') {
    return 'organization'
  }
  if (token === 'SUBJECT_CREATED' || token === 'SUBJECT_UPDATED' || token === 'SUBJECT_DELETED') {
    return 'organization'
  }
  if (
    token === 'ANNOUNCEMENT_CREATED' ||
    token === 'ANNOUNCEMENT_UPDATED' ||
    token === 'ANNOUNCEMENT_DELETED' ||
    token === 'ANNOUNCEMENT_POSTED' ||
    token === 'CURRICULUM_UPLOADED'
  ) {
    return 'announcement'
  }
  if (token.startsWith('BACKUP_')) return 'backup'
  if (
    token === 'SUSPICIOUS_INPUT_DETECTED' ||
    token === 'UNAUTHORIZED_ACCESS_ATTEMPT' ||
    authLower.startsWith('security_')
  ) {
    return 'security'
  }
  if (token === 'FILE_UPLOADED' || token === 'GRADE_EXPORTED' || token === 'LESSON_ACCESSED') return 'file'
  if (authLower.includes('two_factor')) return 'two_factor'
  if (
    authLower.includes('email_verification') ||
    authLower.includes('email_verified') ||
    authLower === 'email_sent' ||
    authLower === 'sms_sent'
  ) {
    return 'email'
  }
  if (authLower.includes('user_banned') || authLower.includes('user_deleted')) return 'user_blocked'
  if (authLower.includes('organization_')) return 'organization'
  if (authLower.includes('profile_image')) return 'profile_updated'
  return 'default'
}

export { normalizeEventTokens }
