import { getPgPool, isPgConfigured } from '../pgPool.js'
import { fetchAuthUsersByIds, queryLmsAuditLogsWithTargets } from '../api/logs.js'
import { hasRecentUserAccountChangedLog } from '../lib/auditLogsLedger.js'
import {
  ADMIN_PORTAL_MODULES,
  STUDENT_PORTAL_MODULES,
  TEACHER_PORTAL_MODULES,
  dashboardModuleForRole,
  resolveInstituteActivityModule,
} from '../../shared/auditPortalModules.js'
import {
  AUTH_PROFILE_UPDATE_DISPLAY_TYPE,
  PROFILE_UPDATE_DISPLAY_TYPE,
  USER_ACCOUNT_CHANGED_DISPLAY,
  USER_ACCOUNT_CHANGED_EVENT_TYPE,
} from '../lib/profileAudit.js'

/** PostgreSQL DDL (also applied at runtime via `init()`). CamelCase columns match prior schema mirror. */
export const LMS_ACTIVITY_LOGS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS lms_activity_logs (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  "userId" VARCHAR(128) NOT NULL,
  "userEmail" VARCHAR(512) NULL,
  "userRole" VARCHAR(64) NULL,
  "activityType" VARCHAR(128) NOT NULL,
  "resourceId" VARCHAR(512) NULL,
  details JSONB NULL,
  "timestamp" VARCHAR(64) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lms_activity_timestamp ON lms_activity_logs ("timestamp");
CREATE INDEX IF NOT EXISTS idx_lms_activity_userId ON lms_activity_logs ("userId");
CREATE INDEX IF NOT EXISTS idx_lms_activity_activityType ON lms_activity_logs ("activityType");
`

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function safeJson(v) {
  try {
    return JSON.stringify(v ?? {})
  } catch {
    return JSON.stringify({ _error: 'details_unserializable' })
  }
}

/**
 * Custom LMS activity logger (PostgreSQL, same database as app_state / Better Auth).
 *
 * Merges with Better Auth Infra audit logs in Monitoring Records.
 */
export class CustomActivityLogger {
  /**
   * @param {{
   *  getUserContext?: (userId: string) => Promise<{ email?: string, role?: string } | null> | { email?: string, role?: string } | null
   * }} [opts]
   */
  constructor(opts = {}) {
    this.getUserContext = opts.getUserContext || null
    this._inited = false
    /** When true, Postgres is missing or unreachable; logging becomes a no-op. */
    this._activityUnavailable = false
  }

  async init() {
    if (this._inited || this._activityUnavailable) return
    if (!isPgConfigured()) {
      this._activityUnavailable = true
      return
    }
    const pool = getPgPool()
    if (!pool) {
      this._activityUnavailable = true
      return
    }
    try {
      await pool.query(LMS_ACTIVITY_LOGS_SCHEMA_SQL)
      this._inited = true
    } catch (e) {
      const code = e?.code
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        console.warn(
          '[lms-activity] PostgreSQL not reachable (%s); activity logging disabled. Start Postgres or fix DATABASE_URL.',
          code || e?.message || e,
        )
        this._activityUnavailable = true
        return
      }
      console.error(
        '[lms-activity] PostgreSQL Error (init schema):',
        e?.message || e,
        e?.code != null ? `code=${e.code}` : '',
      )
      throw e
    }
  }

  close() {
    this._inited = false
    this._activityUnavailable = false
  }

  async _log({ userId, activityType, resourceId = null, details = {}, userEmail = null, userRole = null }) {
    if (!userId) throw new Error('userId is required')
    if (!activityType) throw new Error('activityType is required')
    await this.init()
    if (this._activityUnavailable) return { ok: true, skipped: true }

    if ((!userEmail || !userRole) && this.getUserContext) {
      try {
        const ctx = await this.getUserContext(String(userId))
        if (ctx?.email && !userEmail) userEmail = ctx.email
        if (ctx?.role && !userRole) userRole = ctx.role
      } catch {
        /* ignore */
      }
    }

    const pool = getPgPool()
    if (!pool || this._activityUnavailable) return { ok: true, skipped: true }
    const nowIso = new Date().toISOString()
    const id = randomId()
    const detailsJson = safeJson(details)

    try {
      await pool.query(
        `
        INSERT INTO lms_activity_logs (
          id, "userId", "userEmail", "userRole",
          "activityType", "resourceId", details,
          "timestamp"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
        [
          id,
          String(userId),
          userEmail ? String(userEmail) : null,
          userRole ? String(userRole) : null,
          String(activityType),
          resourceId != null ? String(resourceId) : null,
          detailsJson,
          nowIso,
        ],
      )
    } catch (e) {
      console.error(
        '[lms-activity] PostgreSQL Error (insert):',
        e?.message || e,
        e?.code != null ? `code=${e.code}` : '',
      )
      return { ok: true, skipped: true }
    }
    return { ok: true }
  }

  async queryLogs(filters = {}) {
    await this.init()
    const limit = Math.max(1, Math.min(500, Number(filters.limit || 50)))
    const offset = Math.max(0, Number(filters.offset || 0))

    if (this._activityUnavailable || !getPgPool()) {
      return { events: [], total: 0, limit, offset }
    }

    try {
      return await queryLmsAuditLogsWithTargets({ ...filters, limit, offset })
    } catch (e) {
      console.error(
        '[lms-activity] PostgreSQL Error (queryLogs):',
        e?.message || e,
        e?.code != null ? `code=${e.code}` : '',
      )
      throw e
    }
  }

  async logLessonAccess(userId, lessonId, courseId, ctx = {}) {
    return this._log({
      userId,
      activityType: 'LESSON_ACCESSED',
      resourceId: String(lessonId || ''),
      details: { lessonId, courseId },
      ...ctx,
    })
  }

  async logFileUpload(userId, fileName, fileType, targetCourse, ctx = {}) {
    return this._log({
      userId,
      activityType: 'FILE_UPLOADED',
      resourceId: String(fileName || ''),
      details: { fileName, fileType, targetCourse },
      ...ctx,
    })
  }

  async logGradeExport(userId, gradeLevel, section, ctx = {}) {
    return this._log({
      userId,
      activityType: 'GRADE_EXPORTED',
      resourceId: String(section || gradeLevel || ''),
      details: { gradeLevel, section },
      ...ctx,
    })
  }

  async logAssignmentSubmit(userId, assignmentId, plagiarismScore, ctx = {}) {
    const { details: ctxDetails, ...rest } = ctx
    const assignmentTitle = String(ctxDetails?.assignmentTitle || ctx?.assignmentTitle || '').trim()
    const targetLabel = assignmentTitle || (assignmentId ? `Assignment ${assignmentId}` : null)
    return this._log({
      userId,
      activityType: 'ASSIGNMENT_SUBMITTED',
      resourceId: String(assignmentId || ''),
      details: {
        assignmentId,
        plagiarismScore,
        assignmentTitle: assignmentTitle || null,
        target_label: targetLabel,
        module: STUDENT_PORTAL_MODULES.ASSIGNMENTS,
        ...(ctxDetails || {}),
      },
      ...rest,
    })
  }

  async logActivitySubmit(userId, activityId, ctx = {}) {
    const { details: ctxDetails, ...rest } = ctx
    const activityTitle = String(ctxDetails?.activityTitle || ctx?.activityTitle || '').trim()
    const targetLabel = activityTitle || (activityId ? `Activity ${activityId}` : null)
    return this._log({
      userId,
      activityType: 'ACTIVITY_SUBMITTED',
      resourceId: String(activityId || ''),
      details: {
        activityId,
        activityTitle: activityTitle || null,
        target_label: targetLabel,
        module: STUDENT_PORTAL_MODULES.ACTIVITIES,
        ...(ctxDetails || {}),
      },
      ...rest,
    })
  }

  async logQuizSubmitted(
    userId,
    { quizId, quizTitle, score, totalPoints, timeSpent } = {},
    ctx = {},
  ) {
    const { details: ctxDetails, ...rest } = ctx
    const title = String(quizTitle || ctxDetails?.quizTitle || '').trim()
    const targetLabel = title || (quizId ? `Quiz ${quizId}` : null)
    return this._log({
      userId,
      activityType: 'QUIZ_SUBMITTED',
      resourceId: String(quizId || ''),
      details: {
        quizId,
        quizTitle: title || null,
        score,
        totalPoints,
        timeSpent,
        target_label: targetLabel,
        module: STUDENT_PORTAL_MODULES.QUIZZES,
        description: `Student submitted quiz: ${title || quizId || 'quiz'}`,
        ...(ctxDetails || {}),
      },
      ...rest,
    })
  }

  /** @deprecated No longer logged — quiz views are not audited (too noisy). */
  async logQuizViewed() {
    return { ok: true, skipped: true }
  }

  async logQuizCreated(userId, { quizId, quizTitle } = {}, ctx = {}) {
    return this._log({
      userId,
      activityType: 'QUIZ_CREATED',
      resourceId: String(quizId || ''),
      details: { quizId, quizTitle },
      ...ctx,
    })
  }

  /** @deprecated No longer logged — file downloads are not audited (too noisy). */
  async logMaterialDownloaded() {
    return { ok: true, skipped: true }
  }

  /** @deprecated No longer logged — student roster/detail views are not audited (too noisy). */
  async logStudentDataViewed() {
    return { ok: true, skipped: true }
  }

  async logPasswordChanged(userId, { targetUserId, source } = {}, ctx = {}) {
    return this._log({
      userId,
      activityType: 'PASSWORD_CHANGED',
      resourceId: String(targetUserId || userId || ''),
      details: { targetUserId, source },
      ...ctx,
    })
  }

  async logPasswordResetRequested(
    userId,
    { email, source, ipAddress, initiatedByAdminId } = {},
    ctx = {},
  ) {
    const normalizedSource = String(source || 'self').trim() || 'self'
    const description =
      normalizedSource === 'self'
        ? 'User requested their own password reset'
        : `Password reset requested for ${String(email || '').trim().toLowerCase()}`
    return this._log({
      userId,
      activityType: 'PASSWORD_RESET_REQUESTED',
      resourceId: String(userId || ''),
      details: {
        type: 'password_reset_requested',
        eventType: 'password_reset_requested',
        activityType: 'PASSWORD_RESET_REQUESTED',
        description,
        initiated_by: normalizedSource === 'self' ? 'user' : 'admin',
        email: String(email || '').trim().toLowerCase(),
        source: normalizedSource,
        ipAddress: ipAddress || undefined,
        initiatedByAdminId: initiatedByAdminId || undefined,
      },
      ...ctx,
    })
  }

  async logAdminInitiatedPasswordReset(
    adminUserId,
    targetUserId,
    {
      adminName,
      adminEmail,
      targetName,
      targetEmail,
      targetRole,
      ipAddress,
    } = {},
    ctx = {},
  ) {
    const adminLabel = String(adminName || '').trim() || 'Administrator'
    const targetLabel = String(targetName || '').trim() || String(targetEmail || '').trim() || 'User'
    const description = `Admin ${adminLabel} sent a password reset email to ${targetLabel}`
    return this._log({
      userId: String(adminUserId || 'system'),
      activityType: 'ADMIN_INITIATED_PASSWORD_RESET',
      resourceId: String(targetUserId || ''),
      details: {
        type: 'admin_initiated_password_reset',
        eventType: 'admin_initiated_password_reset',
        activityType: 'ADMIN_INITIATED_PASSWORD_RESET',
        description,
        initiated_by: 'admin',
        admin_id: String(adminUserId || ''),
        admin_name: adminLabel,
        admin_email: String(adminEmail || '').trim().toLowerCase() || undefined,
        target_user_id: String(targetUserId || ''),
        target_name: targetLabel,
        target_email: String(targetEmail || '').trim().toLowerCase() || undefined,
        target_role: targetRole ? String(targetRole) : undefined,
        record_name: targetLabel,
        record_id: String(targetUserId || ''),
        ipAddress: ipAddress || undefined,
      },
      userEmail: String(adminEmail || '').trim().toLowerCase() || undefined,
      userRole: 'admin',
      ...ctx,
    })
  }

  async logPasswordResetCompleted(userId, { email, source, ipAddress } = {}, ctx = {}) {
    const normalizedSource = String(source || 'self').trim() || 'self'
    const description =
      normalizedSource === 'self'
        ? 'User completed their own password reset'
        : 'User completed password reset via emailed link'
    return this._log({
      userId,
      activityType: 'PASSWORD_RESET_COMPLETED',
      resourceId: String(userId || ''),
      details: {
        type: 'password_reset_completed',
        eventType: 'password_reset_completed',
        activityType: 'PASSWORD_RESET_COMPLETED',
        description,
        initiated_by: normalizedSource === 'self' ? 'user' : 'admin',
        email: String(email || '').trim().toLowerCase(),
        source: normalizedSource,
        ipAddress: ipAddress || undefined,
      },
      ...ctx,
    })
  }

  async logTermsAccepted(userId, { portal, acceptedAt, userName, userEmail } = {}, ctx = {}) {
    const name = String(userName || '').trim() || 'User'
    const email = String(userEmail || ctx.userEmail || '').trim().toLowerCase()
    const description = `${name} has accepted the Terms & Conditions`
    const portalKey = String(portal || ctx.userRole || '').trim().toLowerCase()
    const dashboardModule = dashboardModuleForRole(portalKey || ctx.userRole)
    return this._log({
      userId,
      activityType: 'TERMS_ACCEPTED',
      resourceId: String(portal || 'portal'),
      details: {
        type: 'terms_accepted',
        eventType: 'terms_accepted',
        activityType: 'TERMS_ACCEPTED',
        portal,
        acceptedAt,
        userName: name,
        userEmail: email,
        displayType: 'Terms & Conditions Accepted',
        description,
        module: dashboardModule,
      },
      userEmail: email,
      userRole: ctx.userRole,
      ...ctx,
    })
  }

  async logAssignmentGraded(userId, assignmentId, submissionId, ctx = {}) {
    return this._log({
      userId,
      activityType: 'ASSIGNMENT_GRADED',
      resourceId: String(submissionId || assignmentId || ''),
      details: { assignmentId, submissionId },
      ...ctx,
    })
  }

  async logActivityGraded(userId, activityId, submissionId, ctx = {}) {
    return this._log({
      userId,
      activityType: 'ACTIVITY_GRADED',
      resourceId: String(submissionId || activityId || ''),
      details: { activityId, submissionId },
      ...ctx,
    })
  }

  async logAnnouncementPost(adminId, title, audience, ctx = {}) {
    return this._log({
      userId: adminId,
      activityType: 'ANNOUNCEMENT_POSTED',
      resourceId: String(title || ''),
      details: { title, audience },
      ...ctx,
    })
  }

  async logCurriculumUpload(adminId, gradeLevel, fileName, ctx = {}) {
    return this._log({
      userId: adminId,
      activityType: 'CURRICULUM_UPLOADED',
      resourceId: String(fileName || ''),
      details: { gradeLevel, fileName },
      ...ctx,
    })
  }

  /**
   * Security probe detected by sanitizeInput middleware (SQL injection patterns).
   */
  /**
   * Institute roster / content CRUD (Monitoring Records + audit matrix).
   */
  async logInstituteRecordEvent(
    actorUserId,
    activityType,
    {
      actorName = '',
      actorEmail = '',
      actorRole = 'admin',
      recordType = '',
      recordId = '',
      description = '',
      details = {},
    } = {},
  ) {
    const type = String(activityType || 'INSTITUTE_RECORD').toUpperCase()
    const uid = String(actorUserId || 'system').trim() || 'system'
    const module = resolveInstituteActivityModule(type) || ADMIN_PORTAL_MODULES.DASHBOARD
    return this._log({
      userId: uid,
      activityType: type,
      resourceId: recordId ? String(recordId) : null,
      details: {
        type: type.toLowerCase(),
        eventType: type.toLowerCase(),
        displayType: description || type.replace(/_/g, ' '),
        description: description || type.replace(/_/g, ' '),
        recordType: recordType ? String(recordType) : null,
        recordId: recordId ? String(recordId) : null,
        actorName: actorName ? String(actorName) : 'Administrator',
        actorEmail: actorEmail ? String(actorEmail) : null,
        actorRole: actorRole ? String(actorRole) : 'admin',
        module,
        target_label: details?.record_name || details?.recordName || description || null,
        ...details,
      },
      userEmail: actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : 'admin',
    })
  }

  async logLoginFailed({
    identifier = '',
    ipAddress = '',
    userAgent = '',
    reason = 'Invalid credentials',
    targetUserId = '',
    username = '',
    userName = '',
    userEmail = '',
    userRole = '',
    portal = null,
    accountType = '',
    attempts = null,
    suspiciousLoginDetected = false,
  } = {}) {
    const loginId = String(identifier || username || '').trim()
    const accountLabel = accountType ? String(accountType) : ''
    const description = targetUserId
      ? `Failed login attempt for ${accountLabel || 'account'} (${loginId || username || userEmail})`
      : loginId
        ? `Failed login attempt for unknown account (${loginId})`
        : 'Failed login attempt'

    return this._log({
      userId: targetUserId ? String(targetUserId) : 'system',
      activityType: 'LOGIN_FAILED',
      resourceId: loginId ? loginId.slice(0, 512) : null,
      details: {
        type: 'login_failed',
        eventType: 'login_failed',
        displayType: 'Sign In Failed',
        description,
        identifier: loginId,
        loginId,
        targetUserId: targetUserId ? String(targetUserId) : null,
        username: username ? String(username) : null,
        userName: userName ? String(userName) : null,
        userEmail: userEmail ? String(userEmail) : null,
        userRole: userRole ? String(userRole) : null,
        accountType: accountLabel || null,
        portal: portal ? String(portal) : null,
        attempts: attempts != null ? Number(attempts) : null,
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
        reason: String(reason || ''),
        suspiciousLoginDetected: Boolean(suspiciousLoginDetected),
        actorName: 'System',
      },
      userEmail: userEmail ? String(userEmail) : null,
      userRole: userRole ? String(userRole) : 'system',
    })
  }

  async logUserSignedOut(
    userId,
    { userName = '', userEmail = '', userRole = '', ipAddress = '', userAgent = '' } = {},
  ) {
    const dashboardModule = dashboardModuleForRole(userRole)
    return this._log({
      userId: String(userId || 'unknown'),
      activityType: 'USER_SIGNED_OUT',
      resourceId: userEmail ? String(userEmail) : null,
      details: {
        type: 'user_signed_out',
        eventType: 'user_signed_out',
        displayType: 'Signed Out',
        userName: String(userName || ''),
        userEmail: String(userEmail || ''),
        userRole: userRole ? String(userRole) : null,
        module: dashboardModule,
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
      },
      userEmail: userEmail ? String(userEmail) : null,
      userRole: userRole ? String(userRole) : null,
    })
  }

  async logUserSessionStarted(
    userId,
    {
      sessionId = '',
      userName = '',
      userEmail = '',
      userRole = '',
      method = '',
      userAgent = '',
      signedInAt = '',
    } = {},
  ) {
    const name = String(userName || '').trim()
    const email = String(userEmail || '').trim().toLowerCase()
    const role = String(userRole || '').trim().toLowerCase()
    const loginMethod = String(method || '').trim() || 'credentials'
    const roleLabel =
      role === 'admin' ? 'Admin' : role === 'teacher' || role === 'faculty' ? 'Faculty' : role === 'student' ? 'Student' : role
    const displayType = roleLabel ? `${roleLabel} Session Started` : 'Session Started'
    const signedInIso = signedInAt ? String(signedInAt) : new Date().toISOString()
    const ua = String(userAgent || '').trim().slice(0, 512) || 'unknown'
    const description = name
      ? `${name} signed in via ${loginMethod}`
      : `User signed in via ${loginMethod}`

    return this._log({
      userId: String(userId || 'unknown'),
      activityType: 'USER_SESSION_STARTED',
      resourceId: sessionId ? String(sessionId) : null,
      details: {
        type: 'session_created',
        eventType: 'session_created',
        displayType,
        description,
        name,
        userName: name,
        email,
        userEmail: email,
        role: userRole ? String(userRole) : null,
        userRole: userRole ? String(userRole) : null,
        login_method: loginMethod,
        method: loginMethod,
        user_agent: ua,
        signed_in_at: signedInIso,
        sessionId: sessionId ? String(sessionId) : null,
        module: dashboardModuleForRole(role || userRole),
      },
      userEmail: email || null,
      userRole: userRole ? String(userRole) : null,
    })
  }

  /** @deprecated Prefer logUserSessionStarted — kept for backward compatibility. */
  async logSessionCreated(userId, payload = {}) {
    return this.logUserSessionStarted(userId, payload)
  }

  async logSessionRevoked(
    actorUserId,
    { targetUserId = '', sessionId = '', actorName = '', actorEmail = '', actorRole = 'admin' } = {},
  ) {
    return this._log({
      userId: String(actorUserId || 'system'),
      activityType: 'SESSION_REVOKED',
      resourceId: sessionId ? String(sessionId) : null,
      details: {
        type: 'session_revoked',
        eventType: 'session_revoked',
        displayType: 'Session Revoked',
        targetUserId: targetUserId ? String(targetUserId) : null,
        sessionId: sessionId ? String(sessionId) : null,
        actorName: actorName ? String(actorName) : null,
        actorEmail: actorEmail ? String(actorEmail) : null,
        actorRole: actorRole ? String(actorRole) : 'admin',
      },
      userEmail: actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : 'admin',
    })
  }

  async logUserCreated(
    actorUserId,
    {
      targetUserId = '',
      targetEmail = '',
      targetName = '',
      targetRole = '',
      actorName = '',
      actorEmail = '',
      actorRole = 'admin',
      source = 'admin',
    } = {},
  ) {
    return this._log({
      userId: String(actorUserId || 'system'),
      activityType: 'USER_CREATED',
      resourceId: targetUserId ? String(targetUserId) : null,
      details: {
        type: 'user_created',
        eventType: 'user_created',
        displayType: 'User Created',
        targetUserId: targetUserId ? String(targetUserId) : null,
        targetEmail: targetEmail ? String(targetEmail) : null,
        targetName: targetName ? String(targetName) : null,
        targetRole: targetRole ? String(targetRole) : null,
        actorName: actorName ? String(actorName) : null,
        actorEmail: actorEmail ? String(actorEmail) : null,
        actorRole: actorRole ? String(actorRole) : 'admin',
        source: String(source || 'admin'),
      },
      userEmail: actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : 'admin',
    })
  }

  async logUnauthorizedAccess({
    endpoint = '',
    method = '',
    ipAddress = '',
    userAgent = '',
    reason = '',
    requiredRole = '',
  } = {}) {
    return this._log({
      userId: 'system',
      activityType: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      resourceId: endpoint ? String(endpoint).slice(0, 512) : null,
      details: {
        type: 'unauthorized_access_attempt',
        eventType: 'unauthorized_access_attempt',
        displayType: 'Unauthorized Access',
        endpoint: String(endpoint || ''),
        method: String(method || ''),
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
        reason: String(reason || ''),
        requiredRole: String(requiredRole || ''),
        actorName: 'System',
      },
      userEmail: null,
      userRole: 'system',
    })
  }

  async logAuditLogDeleted(actorUserId, { auditLogId = '', actorName = '', actorEmail = '' } = {}) {
    return this._log({
      userId: String(actorUserId || 'system'),
      activityType: 'AUDIT_LOG_DELETED',
      resourceId: auditLogId ? String(auditLogId) : null,
      details: {
        type: 'audit_log_deleted',
        eventType: 'audit_log_deleted',
        displayType: 'Audit Log Deleted',
        auditLogId: auditLogId ? String(auditLogId) : null,
        actorName: actorName ? String(actorName) : null,
        actorEmail: actorEmail ? String(actorEmail) : null,
        module: ADMIN_PORTAL_MODULES.AUDIT_LOGS,
      },
      userEmail: actorEmail ? String(actorEmail) : null,
      userRole: 'admin',
    })
  }

  async logSuspiciousInput({
    endpoint = '',
    method = '',
    ipAddress = '',
    sample = '',
  } = {}) {
    return this._log({
      userId: 'system',
      activityType: 'SUSPICIOUS_INPUT_DETECTED',
      resourceId: String(endpoint || '').slice(0, 512) || null,
      details: {
        type: 'suspicious_input_detected',
        displayType: 'Security Alert',
        description: 'Possible SQL injection attempt detected',
        endpoint: String(endpoint || ''),
        method: String(method || ''),
        ipAddress: String(ipAddress || ''),
        actorName: 'System',
        sample: String(sample || '').slice(0, 200),
      },
      userEmail: null,
      userRole: 'system',
    })
  }

  async logBackupEvent(
    actorUserId,
    activityType,
    {
      actorName = '',
      actorEmail = '',
      actorRole = 'admin',
      backupId = '',
      backupName = '',
      description = '',
      displayType = '',
      details = {},
    } = {},
  ) {
    const uid = String(actorUserId || 'system').trim() || 'system'
    const type = String(activityType || 'BACKUP_CREATED').toUpperCase()
    const label =
      displayType ||
      (type === 'BACKUP_CREATED'
        ? 'Backup Created'
        : type === 'BACKUP_RESTORED'
          ? 'Data Restored'
          : type === 'BACKUP_DELETED'
            ? 'Backup Deleted'
            : type === 'GOOGLE_DRIVE_CONNECTED'
              ? 'Google Drive Connected'
              : type === 'GOOGLE_DRIVE_DISCONNECTED'
                ? 'Google Drive Disconnected'
                : type === 'BACKUP_UPLOADED_TO_GDRIVE'
                  ? 'Backup Uploaded to Drive'
                  : type === 'BACKUP_SCHEDULE_UPDATED'
                    ? 'Backup Schedule Updated'
                    : 'Backup')
    return this._log({
      userId: uid,
      activityType: type,
      resourceId: backupId ? String(backupId) : null,
      details: {
        type: type.toLowerCase(),
        eventType: type.toLowerCase(),
        displayType: label,
        description: description || label,
        backupId: backupId ? String(backupId) : null,
        backupName: backupName ? String(backupName) : null,
        actorName: actorName ? String(actorName) : 'System',
        actorEmail: actorEmail ? String(actorEmail) : null,
        actorRole: actorRole ? String(actorRole) : 'admin',
        module: ADMIN_PORTAL_MODULES.DATA_BACKUP,
        target_label: backupName ? String(backupName) : null,
        performed_by: {
          id: uid,
          name: actorName ? String(actorName) : 'Administrator',
          email: actorEmail ? String(actorEmail) : null,
        },
        ...details,
      },
      userEmail: actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : 'admin',
    })
  }

  async logAuthLockout(
    userId,
    {
      identifier = '',
      loginId = '',
      userName = '',
      userEmail = '',
      attempts = 0,
      maxAttempts = 5,
      lockedUntil = null,
      cooldownMs = null,
      reason = '',
      userRole = '',
      username = '',
      targetUserId = '',
      accountType = '',
      portal = null,
      portalLabel = '',
      description = '',
      ipAddress = '',
      userAgent = '',
      suspiciousLoginDetected = true,
    } = {},
    ctx = {},
  ) {
    const resolvedLoginId = String(loginId || identifier || username || '').trim()
    const resolvedTargetId = String(targetUserId || userId || '').trim()
    const lockReason = reason || 'Account locked after repeated failed sign-in attempts'

    return this._log({
      userId: resolvedTargetId || String(userId || 'system'),
      activityType: 'AUTH_LOCKOUT',
      resourceId: resolvedLoginId || null,
      details: {
        type: 'auth_lockout',
        eventType: 'auth_lockout',
        displayType: 'Account Lockout',
        description:
          description ||
          (accountType
            ? `Suspicious sign-in: ${attempts} failed password attempts for ${accountType} account`
            : 'Account locked after repeated failed sign-in attempts'),
        identifier: resolvedLoginId || null,
        loginId: resolvedLoginId || null,
        targetUserId: resolvedTargetId || null,
        username: username ? String(username) : null,
        userName: userName ? String(userName) : null,
        userEmail: userEmail ? String(userEmail) : null,
        userRole: userRole ? String(userRole) : null,
        accountType: accountType ? String(accountType) : null,
        portal: portal ? String(portal) : null,
        portalLabel: portalLabel ? String(portalLabel) : null,
        attempts,
        maxAttempts,
        lockedUntil,
        cooldownMs: cooldownMs != null ? Number(cooldownMs) : null,
        reason: lockReason,
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
        suspiciousLoginDetected: Boolean(suspiciousLoginDetected),
      },
      userEmail: userEmail || ctx.userEmail || null,
      userRole: userRole || ctx.userRole || null,
    })
  }

  async logLockedAccountSignInAttempt(
    userId,
    {
      identifier = '',
      loginId = '',
      userName = '',
      userEmail = '',
      username = '',
      userRole = '',
      accountType = '',
      portal = null,
      portalLabel = '',
      lockedUntil = null,
      reason = '',
      ipAddress = '',
      userAgent = '',
    } = {},
    ctx = {},
  ) {
    const resolvedLoginId = String(loginId || identifier || username || '').trim()
    const lockReason = reason || 'Sign-in blocked: account is in lockout cooldown'

    return this._log({
      userId: String(userId || 'unknown'),
      activityType: 'LOGIN_FAILED',
      resourceId: resolvedLoginId || null,
      details: {
        type: 'login_failed',
        eventType: 'login_failed',
        displayType: 'Sign In Failed (Locked Account)',
        description: resolvedLoginId
          ? `Suspicious sign-in during lockout for ${accountType || 'account'} (${resolvedLoginId})`
          : 'Suspicious sign-in during account lockout cooldown',
        identifier: resolvedLoginId || null,
        loginId: resolvedLoginId || null,
        targetUserId: String(userId || ''),
        username: username ? String(username) : null,
        userName: userName ? String(userName) : null,
        userEmail: userEmail ? String(userEmail) : null,
        userRole: userRole ? String(userRole) : null,
        accountType: accountType ? String(accountType) : null,
        portal: portal ? String(portal) : null,
        portalLabel: portalLabel ? String(portalLabel) : null,
        lockedUntil: lockedUntil ? String(lockedUntil) : null,
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
        reason: lockReason,
        suspiciousLoginDetected: true,
        duringLockout: true,
      },
      userEmail: userEmail || ctx.userEmail || null,
      userRole: userRole || ctx.userRole || null,
    })
  }

  async logUserSignedIn(
    userId,
    { identifier = '', userName = '', userEmail = '', method = '', userRole = '', username = '' } = {},
    ctx = {},
  ) {
    return this._log({
      userId,
      activityType: 'USER_SIGNED_IN',
      resourceId: identifier ? String(identifier) : null,
      details: {
        identifier,
        userName,
        userEmail,
        method,
        userRole: userRole ? String(userRole) : null,
        username: username ? String(username) : null,
      },
      userEmail: userEmail || ctx.userEmail || null,
      userRole: userRole || ctx.userRole || null,
    })
  }

  /**
   * Custom `user_account_changed` event with explicit old/new field diffs.
   */
  async logUserAccountChanged(
    subjectUserId,
    {
      actorUserId = '',
      actorName = '',
      actorEmail = '',
      actorRole = '',
      triggerContext = '',
      userName = '',
      userEmail = '',
      targetRole = '',
      updatedFields = [],
      detailedDiffs = {},
      source = 'admin',
      studentRecordId = null,
    } = {},
  ) {
    const sid = String(subjectUserId || '').trim()
    if (!sid) throw new Error('subjectUserId is required')

    const diffs =
      detailedDiffs && typeof detailedDiffs === 'object' && !Array.isArray(detailedDiffs)
        ? detailedDiffs
        : {}
    const fieldKeys = Array.isArray(updatedFields)
      ? updatedFields.map(String).filter(Boolean)
      : Object.keys(diffs)

    if (!fieldKeys.length) return { ok: true, skipped: true }

    const sourceToken = source === 'admin' ? 'admin' : 'user'
    const actorId = String(actorUserId || '').trim() || null
    let actorNameStr = actorName ? String(actorName).trim() : ''
    let actorEmailStr = actorEmail ? String(actorEmail).trim() : ''
    if (actorId && (!actorNameStr || !actorEmailStr)) {
      try {
        const usersById = await fetchAuthUsersByIds([actorId])
        const actorProfile = usersById.get(actorId)
        if (actorProfile) {
          if (!actorNameStr) actorNameStr = String(actorProfile.name || '').trim()
          if (!actorEmailStr) actorEmailStr = String(actorProfile.email || '').trim()
        }
      } catch {
        /* ignore lookup errors */
      }
    }
    const performedByName = actorNameStr || 'Administrator'
    const targetNameStr = userName ? String(userName).trim() : ''
    const targetEmailStr = userEmail ? String(userEmail).trim() : ''
    const targetRoleStr = targetRole ? String(targetRole).trim() : studentRecordId != null ? 'student' : ''

    const payload = {
      userId: sid,
      userName: targetNameStr || null,
      userEmail: targetEmailStr || null,
      triggeredBy: actorId,
      triggerContext: String(triggerContext || actorRole || sourceToken).trim() || sourceToken,
      updatedFields: fieldKeys,
      changed_fields: fieldKeys,
      detailedDiffs: diffs,
      source: sourceToken,
      actorUserId: actorId,
      actorName: performedByName,
      actorEmail: actorEmailStr || null,
      actorRole: actorRole ? String(actorRole) : sourceToken === 'admin' ? 'admin' : null,
      targetUserId: sid,
      targetEmail: targetEmailStr || null,
      targetName: targetNameStr || null,
      targetRole: targetRoleStr || null,
      performed_by: {
        id: actorId,
        name: performedByName,
        email: actorEmailStr || null,
      },
      target_user: {
        id: sid,
        name: targetNameStr || null,
        email: targetEmailStr || null,
        role: targetRoleStr || null,
      },
      ...(studentRecordId != null ? { studentRecordId: Number(studentRecordId) } : {}),
    }

    if (await hasRecentUserAccountChangedLog(sid)) {
      return { ok: true, skipped: true, reason: 'duplicate_within_window' }
    }

    return this._log({
      userId: sid,
      activityType: 'USER_ACCOUNT_CHANGED',
      resourceId: studentRecordId != null ? `student:${studentRecordId}` : sid,
      details: {
        type: USER_ACCOUNT_CHANGED_EVENT_TYPE,
        eventType: USER_ACCOUNT_CHANGED_EVENT_TYPE,
        displayType: USER_ACCOUNT_CHANGED_DISPLAY,
        payload,
        updatedFields: fieldKeys,
        detailedDiffs: diffs,
        source: sourceToken,
        actorUserId: payload.actorUserId,
        actorName: payload.actorName,
        actorEmail: payload.actorEmail,
        actorRole: payload.actorRole,
        targetUserId: sid,
        targetEmail: payload.targetEmail,
        targetName: payload.targetName,
        targetRole: payload.targetRole,
        performed_by: payload.performed_by,
        target_user: payload.target_user,
        changed_fields: fieldKeys,
        ...(studentRecordId != null ? { studentRecordId: Number(studentRecordId) } : {}),
      },
      userEmail: userEmail ? String(userEmail) : actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : null,
    })
  }

  async logUserProfileUpdated(
    subjectUserId,
    {
      actorUserId = '',
      actorEmail = '',
      actorRole = '',
      updatedFields = [],
      source = 'self',
      targetEmail = '',
      targetName = '',
      displayType = '',
      studentRecordId = null,
    } = {},
  ) {
    const sid = String(subjectUserId || '').trim()
    if (!sid) throw new Error('subjectUserId is required')
    const fields = Array.isArray(updatedFields) ? updatedFields.map(String).filter(Boolean) : []
    const sourceToken = source === 'admin' ? 'admin' : 'user'
    const typeLabel =
      String(displayType || '').trim() ||
      (sourceToken === 'admin' && studentRecordId != null
        ? AUTH_PROFILE_UPDATE_DISPLAY_TYPE
        : PROFILE_UPDATE_DISPLAY_TYPE)
    return this._log({
      userId: sid,
      activityType: 'USER_PROFILE_UPDATED',
      resourceId: studentRecordId != null ? `student:${studentRecordId}` : sid,
      details: {
        type: typeLabel,
        eventType: 'USER_PROFILE_UPDATED',
        updatedFields: fields,
        source: sourceToken,
        actorUserId: String(actorUserId || '').trim() || sid,
        actorEmail: actorEmail ? String(actorEmail) : null,
        actorRole: actorRole ? String(actorRole) : sourceToken === 'admin' ? 'admin' : null,
        targetUserId: sid,
        targetEmail: targetEmail ? String(targetEmail) : null,
        targetName: targetName ? String(targetName) : null,
        ...(studentRecordId != null ? { studentRecordId: Number(studentRecordId) } : {}),
      },
      userEmail: targetEmail ? String(targetEmail) : actorEmail ? String(actorEmail) : null,
      userRole: actorRole ? String(actorRole) : null,
    })
  }
}

export const customActivityLogger = new CustomActivityLogger()
