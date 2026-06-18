import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import {
  fetchFacultyRowForSession,
  requireFacultyOrTeacherSession,
} from '../lib/teacherGradesAuth.js'
import { computePercent } from '../lib/gradesDb.js'
import { isDeadlinePassed } from '../lib/studentWorkPortal.js'
import { decryptStudentPiiFields, studentDisplayName } from '../lib/studentPiiCrypto.js'
import {
  applySubmissionScoreOverride,
  fetchSubmissionContextForOverwrite,
} from '../lib/submissionScoreUpdate.js'
import {
  createScoreOverwriteRequest,
  findPendingBySubmission,
  getScoreOverwriteRequestById,
  listScoreOverwriteRequests,
  updateScoreOverwriteRequestStatus,
} from '../lib/scoreOverwriteRequestsDb.js'

const ENTITY_TYPES = new Set(['assignment', 'activity', 'quiz'])

function parsePositiveId(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function formatPercent(score, maxScore) {
  const pct = computePercent(score, maxScore)
  return pct != null ? `${pct}%` : String(score ?? '—')
}

async function fetchStudentName(pool, studentId) {
  const { rows } = await pool.query(`SELECT * FROM students WHERE id = $1 LIMIT 1`, [studentId])
  if (!rows?.length) return 'Unknown student'
  return studentDisplayName(decryptStudentPiiFields(rows[0])) || 'Unknown student'
}

function mapRequestForClient(row, studentName = null) {
  if (!row) return null
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    student_id: row.student_id,
    student_name: studentName,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    submission_id: row.submission_id,
    current_score: row.current_score,
    requested_score: row.requested_score,
    reason: row.reason,
    status: row.status,
    admin_id: row.admin_id,
    admin_notes: row.admin_notes,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function createScoreOverwriteRequestsV1Router(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        success: false,
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Score overwrite APIs require PostgreSQL.',
      })
    }
    router.post('/v1/teacher/score-overwrite-requests', svc503)
    router.get('/v1/teacher/score-overwrite-requests', svc503)
    router.get('/v1/admin/score-overwrite-requests', svc503)
    router.patch('/v1/admin/score-overwrite-requests/:id', svc503)
    return router
  }

  router.post('/v1/teacher/score-overwrite-requests', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }

      const entityType = String(req.body?.entity_type ?? '').trim().toLowerCase()
      const entityId = parsePositiveId(req.body?.entity_id)
      const submissionId = parsePositiveId(req.body?.submission_id)
      const studentId = parsePositiveId(req.body?.student_id)
      const requestedScore = Number(req.body?.requested_score)
      const reason = String(req.body?.reason ?? '').trim()

      if (!ENTITY_TYPES.has(entityType)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_type must be assignment, activity, or quiz.' })
        return
      }
      if (!entityId || !submissionId || !studentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_id, submission_id, and student_id are required.' })
        return
      }
      if (!Number.isFinite(requestedScore)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'requested_score must be a number.' })
        return
      }
      if (reason.length < 10) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'reason must be at least 10 characters.' })
        return
      }

      const ctx = await fetchSubmissionContextForOverwrite(pool, entityType, submissionId, studentId)
      if (!ctx) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      if (Number(ctx.entity_id) !== entityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_id does not match submission.' })
        return
      }
      if (Number(ctx.faculty_id) !== Number(facultyRow.id)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You do not own this item.' })
        return
      }
      if (!isDeadlinePassed(ctx.deadline)) {
        res.status(403).json({
          success: false,
          error: 'NOT_LOCKED',
          message: 'Score overwrite requests are only allowed after the deadline has passed.',
        })
        return
      }

      const maxScore = Number(ctx.max_score) || 100
      if (requestedScore < 0 || requestedScore > maxScore) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `requested_score must be between 0 and ${maxScore}.`,
        })
        return
      }

      const pending = await findPendingBySubmission(pool, submissionId)
      if (pending) {
        res.status(409).json({
          success: false,
          error: 'PENDING_EXISTS',
          message: 'A pending score overwrite request already exists for this submission.',
          request_id: pending.id,
        })
        return
      }

      const teacherId = String(user?.id || '').trim()
      const currentScore = ctx.old_score != null ? Number(ctx.old_score) : null
      const rounded =
        entityType === 'quiz'
          ? Math.round(requestedScore * 100) / 100
          : Math.round(requestedScore)

      const created = await createScoreOverwriteRequest(pool, {
        teacher_id: teacherId,
        student_id: studentId,
        entity_type: entityType,
        entity_id: entityId,
        submission_id: submissionId,
        current_score: currentScore,
        requested_score: rounded,
        reason,
      })

      const studentName = await fetchStudentName(pool, studentId)
      const oldPct = formatPercent(currentScore, maxScore)
      const newPct = formatPercent(rounded, maxScore)
      const description = `Teacher requested ${entityType} score change for ${studentName} from ${oldPct} to ${newPct}. Reason: ${reason}`

      try {
        await insertAuditLogRecord('SCORE_OVERWRITE_REQUESTED', {
          userId: teacherId,
          role: 'teacher',
          action: 'score_overwrite_requested',
          description,
          displayType: 'Score overwrite requested',
          entity_type: entityType,
          entity_id: entityId,
          submission_id: submissionId,
          student_id: studentId,
          current_score: currentScore,
          requested_score: rounded,
          reason,
          request_id: created.id,
        })
      } catch {
        /* non-fatal */
      }

      res.status(201).json({ success: true, request: mapRequestForClient(created, studentName) })
    } catch (e) {
      if (String(e?.code) === '23505') {
        res.status(409).json({
          success: false,
          error: 'PENDING_EXISTS',
          message: 'A pending score overwrite request already exists for this submission.',
        })
        return
      }
      sendSafeServerError(res, e, 'POST /api/v1/teacher/score-overwrite-requests')
    }
  })

  router.get('/v1/teacher/score-overwrite-requests', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const teacherId = String(user?.id || '').trim()
      const pool = getPgPool()
      const status = String(req.query?.status ?? '').trim() || null
      const rows = await listScoreOverwriteRequests(pool, { status, teacherId })
      const requests = await Promise.all(
        rows.map(async (row) => {
          const name = await fetchStudentName(pool, row.student_id)
          return mapRequestForClient(row, name)
        }),
      )
      res.json({ success: true, requests })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/teacher/score-overwrite-requests')
    }
  })

  router.get('/v1/admin/score-overwrite-requests', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const pool = getPgPool()
      const status = String(req.query?.status ?? 'pending').trim() || 'pending'
      const rows = await listScoreOverwriteRequests(pool, { status })
      const requests = await Promise.all(
        rows.map(async (row) => {
          const name = await fetchStudentName(pool, row.student_id)
          return mapRequestForClient(row, name)
        }),
      )
      res.json({ success: true, requests })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/score-overwrite-requests')
    }
  })

  router.patch('/v1/admin/score-overwrite-requests/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const pool = getPgPool()
      const id = parsePositiveId(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid request id.' })
        return
      }

      const action = String(req.body?.action ?? '').trim().toLowerCase()
      const adminNotes = String(req.body?.admin_notes ?? req.body?.adminNotes ?? '').trim() || null
      if (action !== 'approve' && action !== 'reject') {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'action must be approve or reject.' })
        return
      }
      if (action === 'reject' && !adminNotes) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'admin_notes is required when rejecting.' })
        return
      }

      const existing = await getScoreOverwriteRequestById(pool, id)
      if (!existing) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' })
        return
      }
      if (existing.status !== 'pending') {
        res.status(409).json({ success: false, error: 'ALREADY_REVIEWED', message: 'This request has already been reviewed.' })
        return
      }

      const actor = adminSession.user ?? adminSession?.data?.user ?? {}
      const actorId = String(actor.id || '').trim()
      const studentName = await fetchStudentName(pool, existing.student_id)

      if (action === 'reject') {
        const updated = await updateScoreOverwriteRequestStatus(pool, id, {
          status: 'rejected',
          adminId: actorId,
          adminNotes,
        })
        const description = `Admin rejected score overwrite for ${studentName} (${existing.entity_type}). Notes: ${adminNotes}`
        try {
          await insertAuditLogRecord('SCORE_OVERWRITE_REJECTED', {
            userId: actorId,
            role: 'admin',
            action: 'score_overwrite_rejected',
            description,
            displayType: 'Score overwrite rejected',
            request_id: id,
            entity_type: existing.entity_type,
            submission_id: existing.submission_id,
            student_id: existing.student_id,
            admin_notes: adminNotes,
          })
          await auditInstituteRecord(adminSession, 'SCORE_OVERWRITE_REJECTED', {
            recordType: existing.entity_type,
            recordId: String(existing.submission_id),
            description,
          })
        } catch {
          /* non-fatal */
        }
        res.json({ success: true, request: mapRequestForClient(updated, studentName) })
        return
      }

      const result = await applySubmissionScoreOverride(
        pool,
        existing.entity_type,
        existing.submission_id,
        existing.student_id,
        existing.requested_score,
      )

      if (!result) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      if (result.error === 'RANGE') {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Score must be between 0 and ${result.max_score}.`,
        })
        return
      }
      if (result.error === 'NOT_LOCKED') {
        res.status(403).json({ success: false, error: 'NOT_LOCKED', message: result.message })
        return
      }

      const updated = await updateScoreOverwriteRequestStatus(pool, id, {
        status: 'approved',
        adminId: actorId,
        adminNotes,
      })

      const oldPct = formatPercent(result.old_score, result.max_score)
      const newPct = formatPercent(result.new_score, result.max_score)
      const description = `Admin approved score overwrite for ${studentName} from ${oldPct} to ${newPct}. Teacher reason: ${existing.reason}`

      try {
        await insertAuditLogRecord('SCORE_OVERWRITE_APPROVED', {
          userId: actorId,
          role: 'admin',
          action: 'score_overwrite_approved',
          description,
          displayType: 'Score overwrite approved',
          request_id: id,
          entity_type: existing.entity_type,
          submission_id: existing.submission_id,
          student_id: existing.student_id,
          old_score: result.old_score,
          new_score: result.new_score,
          teacher_reason: existing.reason,
          admin_notes: adminNotes,
        })
        await auditInstituteRecord(adminSession, 'SCORE_OVERWRITE_APPROVED', {
          recordType: existing.entity_type,
          recordId: String(existing.submission_id),
          description,
        })
      } catch {
        /* non-fatal */
      }

      res.json({
        success: true,
        request: mapRequestForClient(updated, studentName),
        submission: {
          id: result.submission.id,
          score: result.new_score,
          max_score: result.max_score,
        },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/v1/admin/score-overwrite-requests/:id')
    }
  })

  return router
}
