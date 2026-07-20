import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  fetchFacultyRowForSession,
  requireFacultyOrTeacherSession,
} from '../lib/teacherGradesAuth.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import { decryptStudentPiiFields, studentDisplayName } from '../lib/studentPiiCrypto.js'
import {
  adminUploadSubmissionOnBehalf,
  grantSubmissionExtension,
  revokeSubmissionExtension,
} from '../lib/submissionExtensionDb.js'
import { assertFacultyCanGrantSubmissionExtension } from '../lib/submissionExtensionAuth.js'
import { facultyDisplayName } from '../lib/facultySession.js'
import { logTeacherAuditEvent, TEACHER_AUDIT_MODULES } from '../lib/teacherAuditLog.js'
import { TEACHER_PORTAL_MODULES } from '../../shared/auditPortalModules.js'
import {
  getStudentSubmissionUploadFile,
  studentSubmissionUploadMiddleware,
  validateStudentSubmissionUploadFile,
  STUDENT_SUBMISSION_TYPE_REJECT_MSG,
} from '../lib/submissionStorage.js'

const ENTITY_TYPES = new Set(['assignment', 'activity', 'quiz'])

function parsePositiveId(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function fetchStudentName(pool, studentId) {
  const { rows } = await pool.query(`SELECT * FROM students WHERE id = $1 LIMIT 1`, [studentId])
  if (!rows?.length) return 'Unknown student'
  return studentDisplayName(decryptStudentPiiFields(rows[0])) || 'Unknown student'
}

function formatUntil(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

async function requireTeacherSubmissionAccess(req, res, auth, { entityType, entityId, studentId }) {
  const session = await requireFacultyOrTeacherSession(req, res, auth)
  if (!session) return null

  const user =
    session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user

  const pool = getPgPool()
  if (!pool) {
    res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
    return null
  }

  const facultyRow = await fetchFacultyRowForSession(pool, user)
  const access = await assertFacultyCanGrantSubmissionExtension(pool, facultyRow, {
    entityType,
    entityId,
    studentId,
  })

  if (!access.ok) {
    res.status(access.status).json({ success: false, error: access.error, message: access.message })
    return null
  }

  return { pool, user, facultyRow, actorId: String(user?.id || '').trim() }
}

export function createTeacherSubmissionExtensionV1Router(express, auth) {
  const router = express.Router()

  router.post('/submission-extension', async (req, res) => {
    try {
      const entityType = String(req.body?.entity_type ?? '').trim().toLowerCase()
      const entityId = parsePositiveId(req.body?.entity_id)
      const studentId = parsePositiveId(req.body?.student_id)
      const until = req.body?.until
      const reason = String(req.body?.reason ?? '').trim()

      if (!ENTITY_TYPES.has(entityType)) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'entity_type must be assignment, activity, or quiz.',
        })
        return
      }
      if (!entityId || !studentId) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'entity_id and student_id are required.',
        })
        return
      }

      const ctx = await requireTeacherSubmissionAccess(req, res, auth, { entityType, entityId, studentId })
      if (!ctx) return

      const result = await grantSubmissionExtension(ctx.pool, {
        entityType,
        entityId,
        studentId,
        until,
        reason,
        grantedBy: ctx.actorId,
      })

      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: result.message })
        return
      }
      if (result.error === 'NOT_LOCKED') {
        res.status(403).json({ success: false, error: 'NOT_LOCKED', message: result.message })
        return
      }
      if (result.error === 'BAD_UNTIL' || result.error === 'BAD_REASON') {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: result.message })
        return
      }
      if (result.error) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: result.message || 'Invalid request.' })
        return
      }

      const studentName = await fetchStudentName(ctx.pool, studentId)
      const teacherName = facultyDisplayName(ctx.facultyRow) || ctx.user?.name || 'Teacher'
      const description = `Teacher granted late submission for ${studentName} on ${entityType} "${result.title}" until ${formatUntil(result.late_submission_until)}. Reason: ${reason}`

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_GRANTED',
          {
            userId: ctx.actorId,
            userName: teacherName,
            role: 'teacher',
            action: 'late_submission_granted',
            description,
            module: TEACHER_PORTAL_MODULES.GRADES,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            late_submission_until: result.late_submission_until,
            reason,
            actorName: teacherName,
            actorUserId: ctx.actorId,
            performed_by_name: teacherName,
          },
          {
            module: TEACHER_PORTAL_MODULES.GRADES,
            action: 'late_submission_granted',
            performed_by: ctx.actorId,
            performed_by_name: teacherName,
            target_id: String(entityId),
            target_label: `${studentName} — ${result.title || entityType}`,
          },
        )
        await logTeacherAuditEvent(req, {
          event_type: 'late_submission_granted',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: 'Allow Late Submission',
          performed_by: ctx.actorId,
          performed_by_name: teacherName,
          target_id: entityId,
          target_label: `${studentName} — ${result.title || entityType}`,
          user: ctx.user,
          facultyRow: ctx.facultyRow,
          summary: description,
          new_values: {
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            late_submission_until: result.late_submission_until,
            reason,
          },
        })
      } catch {
        /* non-fatal */
      }

      res.json({
        ok: true,
        extension: {
          entity_type: entityType,
          entity_id: entityId,
          student_id: studentId,
          late_submission_until: result.late_submission_until,
          reset_expired: result.reset_expired,
          submission_id: result.submission?.id ?? null,
        },
        audit: { event_type: 'LATE_SUBMISSION_GRANTED', description },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/teacher/submission-extension')
    }
  })

  router.delete('/submission-extension', async (req, res) => {
    try {
      const entityType = String(req.body?.entity_type ?? req.query?.entity_type ?? '').trim().toLowerCase()
      const entityId = parsePositiveId(req.body?.entity_id ?? req.query?.entity_id)
      const studentId = parsePositiveId(req.body?.student_id ?? req.query?.student_id)

      if (!ENTITY_TYPES.has(entityType) || !entityId || !studentId) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'entity_type, entity_id, and student_id are required.',
        })
        return
      }

      const ctx = await requireTeacherSubmissionAccess(req, res, auth, { entityType, entityId, studentId })
      if (!ctx) return

      const result = await revokeSubmissionExtension(ctx.pool, { entityType, entityId, studentId })
      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: result.message })
        return
      }

      const studentName = await fetchStudentName(ctx.pool, studentId)
      const teacherName = facultyDisplayName(ctx.facultyRow) || ctx.user?.name || 'Teacher'

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_REVOKED',
          {
            userId: ctx.actorId,
            userName: teacherName,
            role: 'teacher',
            action: 'late_submission_revoked',
            description: `Teacher revoked late submission for ${studentName} on ${entityType} #${entityId}.`,
            module: TEACHER_PORTAL_MODULES.GRADES,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            actorName: teacherName,
            actorUserId: ctx.actorId,
            performed_by_name: teacherName,
          },
          {
            module: TEACHER_PORTAL_MODULES.GRADES,
            action: 'late_submission_revoked',
            performed_by: ctx.actorId,
            performed_by_name: teacherName,
            target_id: String(entityId),
            target_label: studentName,
          },
        )
      } catch {
        /* non-fatal */
      }

      res.json({ ok: true, revoked: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/teacher/submission-extension')
    }
  })

  router.post('/submission-extension/upload', studentSubmissionUploadMiddleware, async (req, res) => {
    try {
      const entityType = String(req.body?.entity_type ?? '').trim().toLowerCase()
      const entityId = parsePositiveId(req.body?.entity_id)
      const studentId = parsePositiveId(req.body?.student_id)
      const reason = String(req.body?.reason ?? '').trim()

      if (entityType !== 'assignment' && entityType !== 'activity') {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'entity_type must be assignment or activity for file upload.',
        })
        return
      }
      if (!entityId || !studentId) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'entity_id and student_id are required.',
        })
        return
      }

      const file = getStudentSubmissionUploadFile(req)
      const fileErr = validateStudentSubmissionUploadFile(file)
      if (fileErr) {
        if (fileErr === STUDENT_SUBMISSION_TYPE_REJECT_MSG) {
          res.status(400).json({ error: STUDENT_SUBMISSION_TYPE_REJECT_MSG })
        } else {
          res.status(400).json({ success: false, error: 'BAD_REQUEST', message: fileErr })
        }
        return
      }

      const ctx = await requireTeacherSubmissionAccess(req, res, auth, { entityType, entityId, studentId })
      if (!ctx) return

      const result = await adminUploadSubmissionOnBehalf(ctx.pool, {
        entityType,
        entityId,
        studentId,
        fileMeta: { buffer: file.buffer, originalName: file.originalname, mime: file.mimetype },
        reason,
        uploadedBy: ctx.actorId,
      })

      if (result.error === 'NO_EXTENSION') {
        res.status(403).json({ success: false, error: 'NO_EXTENSION', message: result.message })
        return
      }
      if (result.error === 'BAD_REASON' || result.error === 'BAD_TYPE') {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: result.message })
        return
      }
      if (result.error) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: result.message || 'Upload failed.' })
        return
      }

      const studentName = await fetchStudentName(ctx.pool, studentId)
      const teacherName = facultyDisplayName(ctx.facultyRow) || ctx.user?.name || 'Teacher'
      const description = `Teacher uploaded ${entityType} submission on behalf of ${studentName} for "${result.title}". Reason: ${reason}`

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_UPLOAD',
          {
            userId: ctx.actorId,
            userName: teacherName,
            role: 'teacher',
            action: 'late_submission_upload',
            description,
            module: TEACHER_PORTAL_MODULES.GRADES,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            submission_id: result.submission?.id ?? null,
            reason,
            actorName: teacherName,
            actorUserId: ctx.actorId,
            performed_by_name: teacherName,
          },
          {
            module: TEACHER_PORTAL_MODULES.GRADES,
            action: 'late_submission_upload',
            performed_by: ctx.actorId,
            performed_by_name: teacherName,
            target_id: String(entityId),
            target_label: `${studentName} — ${result.title || entityType}`,
          },
        )
        await logTeacherAuditEvent(req, {
          event_type: 'late_submission_upload',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: 'Late Submission Upload',
          performed_by: ctx.actorId,
          performed_by_name: teacherName,
          target_id: entityId,
          target_label: `${studentName} — ${result.title || entityType}`,
          user: ctx.user,
          facultyRow: ctx.facultyRow,
          summary: description,
        })
      } catch {
        /* non-fatal */
      }

      res.json({
        ok: true,
        submission: {
          id: result.submission.id,
          entity_type: entityType,
          entity_id: entityId,
          file_name: result.submission.file_name,
        },
        audit: { event_type: 'LATE_SUBMISSION_UPLOAD', description },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/teacher/submission-extension/upload')
    }
  })

  return router
}
