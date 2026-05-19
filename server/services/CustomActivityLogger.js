import { getPgPool, isPgConfigured } from '../pgPool.js'
import { fetchAuthUsersByIds, queryLmsAuditLogsWithTargets } from '../api/logs.js'
import { hasRecentUserAccountChangedLog } from '../lib/auditLogsLedger.js'
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
    return this._log({
      userId,
      activityType: 'ASSIGNMENT_SUBMITTED',
      resourceId: String(assignmentId || ''),
      details: { assignmentId, plagiarismScore },
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
  } = {}) {
    return this._log({
      userId: 'system',
      activityType: 'LOGIN_FAILED',
      resourceId: identifier ? String(identifier).slice(0, 512) : null,
      details: {
        type: 'login_failed',
        eventType: 'login_failed',
        displayType: 'Sign In Failed',
        description: identifier
          ? `Failed login attempt for ${identifier}`
          : 'Failed login attempt',
        identifier: String(identifier || ''),
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
        reason: String(reason || ''),
        actorName: 'System',
      },
      userEmail: null,
      userRole: 'system',
    })
  }

  async logUserSignedOut(
    userId,
    { userName = '', userEmail = '', userRole = '', ipAddress = '', userAgent = '' } = {},
  ) {
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
        ipAddress: String(ipAddress || ''),
        userAgent: String(userAgent || '').slice(0, 512),
      },
      userEmail: userEmail ? String(userEmail) : null,
      userRole: userRole ? String(userRole) : null,
    })
  }

  async logSessionCreated(
    userId,
    { sessionId = '', userEmail = '', userRole = '', method = '' } = {},
  ) {
    return this._log({
      userId: String(userId || 'unknown'),
      activityType: 'SESSION_CREATED',
      resourceId: sessionId ? String(sessionId) : null,
      details: {
        type: 'session_created',
        eventType: 'session_created',
        displayType: 'Session Created',
        sessionId: sessionId ? String(sessionId) : null,
        userEmail: String(userEmail || ''),
        userRole: userRole ? String(userRole) : null,
        method: String(method || ''),
      },
      userEmail: userEmail ? String(userEmail) : null,
      userRole: userRole ? String(userRole) : null,
    })
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
      userName = '',
      userEmail = '',
      attempts = 0,
      lockedUntil = null,
      reason = '',
      userRole = '',
      username = '',
    } = {},
    ctx = {},
  ) {
    return this._log({
      userId,
      activityType: 'AUTH_LOCKOUT',
      resourceId: identifier ? String(identifier) : null,
      details: {
        identifier,
        userName,
        userEmail,
        attempts,
        lockedUntil,
        reason: reason || 'Account locked after repeated failed sign-in attempts',
        userRole: userRole ? String(userRole) : null,
        username: username ? String(username) : null,
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
