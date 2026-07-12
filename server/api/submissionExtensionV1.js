import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import { decryptStudentPiiFields, studentDisplayName } from '../lib/studentPiiCrypto.js'
import {
  adminUploadSubmissionOnBehalf,
  grantSubmissionExtension,
  revokeSubmissionExtension,
} from '../lib/submissionExtensionDb.js'
import { resolveAdminAuditActor } from '../lib/adminAuditActor.js'
import { ADMIN_PORTAL_MODULES } from '../../shared/auditPortalModules.js'
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

export function createSubmissionExtensionV1Router(express, auth) {
  const router = express.Router()

  router.post('/submission-extension', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

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
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_id and student_id are required.' })
        return
      }

      const actor = await resolveAdminAuditActor(adminSession)
      const actorId = actor.actorId

      const result = await grantSubmissionExtension(pool, {
        entityType,
        entityId,
        studentId,
        until,
        reason,
        grantedBy: actorId,
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

      const studentName = await fetchStudentName(pool, studentId)
      const description = `Admin granted late submission for ${studentName} on ${entityType} "${result.title}" until ${formatUntil(result.late_submission_until)}. Reason: ${reason}`

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_GRANTED',
          {
            userId: actorId,
            userName: actor.actorName,
            role: 'admin',
            action: 'late_submission_granted',
            description,
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            late_submission_until: result.late_submission_until,
            reason,
            actorName: actor.actorName,
            actorEmail: actor.actorEmail || null,
            actorUserId: actorId,
            performed_by_name: actor.actorName,
          },
          {
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            action: 'late_submission_granted',
            performed_by: actorId,
            performed_by_name: actor.actorName,
            target_id: String(entityId),
            target_label: `${studentName} — ${result.title || entityType}`,
          },
        )
        await auditInstituteRecord(adminSession, 'LATE_SUBMISSION_GRANTED', {
          recordType: entityType,
          recordId: String(entityId),
          description,
          reason,
          student_id: studentId,
          student_name: studentName,
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
      sendSafeServerError(res, e, 'POST /api/v1/admin/submission-extension')
    }
  })

  router.delete('/submission-extension', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      const entityType = String(req.body?.entity_type ?? req.query?.entity_type ?? '').trim().toLowerCase()
      const entityId = parsePositiveId(req.body?.entity_id ?? req.query?.entity_id)
      const studentId = parsePositiveId(req.body?.student_id ?? req.query?.student_id)

      if (!ENTITY_TYPES.has(entityType) || !entityId || !studentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_type, entity_id, and student_id are required.' })
        return
      }

      const result = await revokeSubmissionExtension(pool, { entityType, entityId, studentId })
      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: result.message })
        return
      }

      const actor = await resolveAdminAuditActor(adminSession)
      const actorId = actor.actorId
      const studentName = await fetchStudentName(pool, studentId)

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_REVOKED',
          {
            userId: actorId,
            userName: actor.actorName,
            role: 'admin',
            action: 'late_submission_revoked',
            description: `Admin revoked late submission for ${studentName} on ${entityType} #${entityId}.`,
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            actorName: actor.actorName,
            actorUserId: actorId,
            performed_by_name: actor.actorName,
          },
          {
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            action: 'late_submission_revoked',
            performed_by: actorId,
            performed_by_name: actor.actorName,
            target_id: String(entityId),
            target_label: studentName,
          },
        )
      } catch {
        /* non-fatal */
      }

      res.json({ ok: true, revoked: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/admin/submission-extension')
    }
  })

  router.post('/submission-extension/upload', studentSubmissionUploadMiddleware, async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

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
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_id and student_id are required.' })
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

      const actor = await resolveAdminAuditActor(adminSession)
      const actorId = actor.actorId

      const result = await adminUploadSubmissionOnBehalf(pool, {
        entityType,
        entityId,
        studentId,
        fileMeta: { buffer: file.buffer, originalName: file.originalname, mime: file.mimetype },
        reason,
        uploadedBy: actorId,
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

      const studentName = await fetchStudentName(pool, studentId)
      const description = `Admin uploaded ${entityType} submission on behalf of ${studentName} for "${result.title}". Reason: ${reason}`

      try {
        await insertAuditLogRecord(
          'LATE_SUBMISSION_UPLOAD',
          {
            userId: actorId,
            userName: actor.actorName,
            role: 'admin',
            action: 'late_submission_upload',
            description,
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            entity_type: entityType,
            entity_id: entityId,
            student_id: studentId,
            submission_id: result.submission?.id ?? null,
            reason,
            actorName: actor.actorName,
            actorUserId: actorId,
            performed_by_name: actor.actorName,
          },
          {
            module: ADMIN_PORTAL_MODULES.STUDENTS,
            action: 'late_submission_upload',
            performed_by: actorId,
            performed_by_name: actor.actorName,
            target_id: String(entityId),
            target_label: `${studentName} — ${result.title || entityType}`,
          },
        )
        await auditInstituteRecord(adminSession, 'LATE_SUBMISSION_UPLOAD', {
          recordType: entityType,
          recordId: String(entityId),
          description,
          reason,
          student_id: studentId,
          student_name: studentName,
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
      sendSafeServerError(res, e, 'POST /api/v1/admin/submission-extension/upload')
    }
  })

  return router
}
