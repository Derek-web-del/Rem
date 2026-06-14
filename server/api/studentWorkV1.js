import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  ensureAssignmentsSchema,
  expireUnsubmittedForAssignment,
  mapAssignmentRow,
  mapSubmissionRow,
  upsertStudentAssignmentSubmission,
} from '../lib/assignmentsDb.js'
import {
  ensureActivitiesSchema,
  expireUnsubmittedForActivity,
  mapActivityRow,
  mapActivitySubmissionRow,
  upsertStudentActivitySubmission,
} from '../lib/activitiesDb.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { STUDENT_PORTAL_MODULES } from '../../shared/auditPortalModules.js'
import { studentDisplayName } from '../lib/studentSession.js'
import {
  assertStudentWorkAccess,
  fetchStudentWorkSubmission,
  isSubmissionOpen,
  mapStudentWorkListRow,
} from '../lib/studentWorkPortal.js'
import {
  deleteSubmissionFileByUrl,
  getStudentSubmissionUploadFile,
  saveStudentSubmissionFile,
  streamSubmissionDownload,
  studentSubmissionUploadMiddleware,
  STUDENT_SUBMISSION_TYPE_REJECT_MSG,
  validateStudentSubmissionUploadFile,
} from '../lib/submissionStorage.js'

function parseIdParam(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function auditCtx(user, studentRow) {
  return {
    userEmail: String(user?.email || '').trim(),
    userRole: 'student',
    details: { studentId: studentRow?.id },
  }
}

function mapDetailResponse(row, submission, kind) {
  const item = mapStudentWorkListRow(row, submission, kind)
  return {
    ...item,
    description: String(row.description ?? item.description ?? '').trim(),
  }
}

function mapSubmissionResponse(submission, totalScore) {
  if (!submission) return null
  const base =
    submission.activity_id != null
      ? mapActivitySubmissionRow(submission, totalScore)
      : mapSubmissionRow(submission, totalScore)
  return base
}

function registerWorkRoutes(router, { requireStudentSession, resolveStudentContext, requireTermsAccepted, auth }) {
  async function studentGate(req, res) {
    const gate = await requireStudentSession(req, res, auth)
    if (!gate) return null
    const pool = getPgPool()
    const studentRow = await resolveStudentContext(pool, gate.user, res)
    if (!studentRow) return null
    if (!requireTermsAccepted(studentRow, res)) return null
    return { gate, pool, studentRow, user: gate.user }
  }

  // ── Assignments ──

  router.get('/v1/student/assignments/:id/submission', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const assignmentId = parseIdParam(req.params.id)
      if (!assignmentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(ctx.pool)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'assignments', 'assignment_id', assignmentId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'assignment_submissions',
        'assignment_id',
        assignmentId,
        ctx.studentRow.id,
      )
      const total = Number(row.total_score) || 100
      res.json({ success: true, submission: mapSubmissionResponse(submission, total) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/assignments/:id/submission')
    }
  })

  router.get('/v1/student/assignments/:id/prompt-file', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const assignmentId = parseIdParam(req.params.id)
      if (!assignmentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'assignments', 'assignment_id', assignmentId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      streamSubmissionDownload(res, row.file_path, row.file_name || 'assignment.pdf')
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/assignments/:id/prompt-file')
    }
  })

  router.get('/v1/student/assignments/:id/submission-file', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const assignmentId = parseIdParam(req.params.id)
      if (!assignmentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'assignments', 'assignment_id', assignmentId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'assignment_submissions',
        'assignment_id',
        assignmentId,
        ctx.studentRow.id,
      )
      if (!submission?.file_path) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'No submission file.' })
        return
      }
      streamSubmissionDownload(res, submission.file_path, submission.file_name || 'submission')
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/assignments/:id/submission-file')
    }
  })

  router.get('/v1/student/assignments/:id', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const assignmentId = parseIdParam(req.params.id)
      if (!assignmentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(ctx.pool)
      await expireUnsubmittedForAssignment(ctx.pool, assignmentId)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'assignments', 'assignment_id', assignmentId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'assignment_submissions',
        'assignment_id',
        assignmentId,
        ctx.studentRow.id,
      )
      const total = Number(row.total_score) || 100
      res.json({
        success: true,
        assignment: mapDetailResponse(row, submission, 'assignment'),
        submission: mapSubmissionResponse(submission, total),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/assignments/:id')
    }
  })

  router.post('/v1/student/assignments/:id/submit', studentSubmissionUploadMiddleware, async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const assignmentId = parseIdParam(req.params.id)
      if (!assignmentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(ctx.pool)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'assignments', 'assignment_id', assignmentId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      if (!isSubmissionOpen(row.submission_deadline)) {
        res.status(400).json({ success: false, error: 'CLOSED', message: 'Submission period has ended.' })
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
      const prior = await fetchStudentWorkSubmission(
        ctx.pool,
        'assignment_submissions',
        'assignment_id',
        assignmentId,
        ctx.studentRow.id,
      )
      if (prior?.file_path) deleteSubmissionFileByUrl(prior.file_path)

      const fileMeta = saveStudentSubmissionFile({
        buffer: file.buffer,
        originalName: file.originalname,
        mime: file.mimetype,
        studentId: ctx.studentRow.id,
        itemId: assignmentId,
        kind: 'assignment',
      })
      const studentName = studentDisplayName(ctx.studentRow)
      const saved = await upsertStudentAssignmentSubmission(ctx.pool, {
        assignmentId,
        studentId: ctx.studentRow.id,
        studentName,
        fileMeta,
      })
      const total = Number(row.total_score) || 100
      const assignmentTitle = String(row.title || row.assignment_title || '').trim()

      try {
        await customActivityLogger.logAssignmentSubmit(String(ctx.user.id), assignmentId, null, {
          ...auditCtx(ctx.user, ctx.studentRow),
          assignmentTitle,
        })
        await insertAuditLogRecord(
          'ASSIGNMENT_SUBMITTED',
          {
            userId: String(ctx.user.id),
            role: 'student',
            action: 'assignment_submitted',
            description: assignmentTitle
              ? `Student submitted assignment: ${assignmentTitle}`
              : `Student submitted assignment ${assignmentId}`,
            assignmentId,
            assignmentTitle,
            studentId: ctx.studentRow.id,
            module: STUDENT_PORTAL_MODULES.ASSIGNMENTS,
          },
          {
            module: STUDENT_PORTAL_MODULES.ASSIGNMENTS,
            action: 'Submit',
            performed_by: String(ctx.user.id),
            performed_by_name: studentName,
            target_id: String(assignmentId),
            target_label: assignmentTitle || `Assignment ${assignmentId}`,
          },
        )
      } catch {
        /* non-fatal */
      }

      res.json({ success: true, submission: mapSubmissionResponse(saved, total) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/assignments/:id/submit')
    }
  })

  // ── Activities ──

  router.get('/v1/student/activities/:id/submission', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const activityId = parseIdParam(req.params.id)
      if (!activityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(ctx.pool)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'activities', 'activity_id', activityId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'activity_submissions',
        'activity_id',
        activityId,
        ctx.studentRow.id,
      )
      const total = Number(row.total_score) || 100
      res.json({ success: true, submission: mapSubmissionResponse(submission, total) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/activities/:id/submission')
    }
  })

  router.get('/v1/student/activities/:id/prompt-file', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const activityId = parseIdParam(req.params.id)
      if (!activityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'activities', 'activity_id', activityId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      streamSubmissionDownload(res, row.file_path, row.file_name || 'activity.pdf')
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/activities/:id/prompt-file')
    }
  })

  router.get('/v1/student/activities/:id/submission-file', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const activityId = parseIdParam(req.params.id)
      if (!activityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'activities', 'activity_id', activityId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'activity_submissions',
        'activity_id',
        activityId,
        ctx.studentRow.id,
      )
      if (!submission?.file_path) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'No submission file.' })
        return
      }
      streamSubmissionDownload(res, submission.file_path, submission.file_name || 'submission')
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/activities/:id/submission-file')
    }
  })

  router.get('/v1/student/activities/:id', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const activityId = parseIdParam(req.params.id)
      if (!activityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(ctx.pool)
      await expireUnsubmittedForActivity(ctx.pool, activityId)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'activities', 'activity_id', activityId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      const submission = await fetchStudentWorkSubmission(
        ctx.pool,
        'activity_submissions',
        'activity_id',
        activityId,
        ctx.studentRow.id,
      )
      const total = Number(row.total_score) || 100
      res.json({
        success: true,
        activity: mapDetailResponse(row, submission, 'activity'),
        submission: mapSubmissionResponse(submission, total),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/activities/:id')
    }
  })

  router.post('/v1/student/activities/:id/submit', studentSubmissionUploadMiddleware, async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const activityId = parseIdParam(req.params.id)
      if (!activityId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(ctx.pool)
      const row = await assertStudentWorkAccess(ctx.pool, ctx.studentRow, 'activities', 'activity_id', activityId)
      if (!row) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      if (!isSubmissionOpen(row.submission_deadline)) {
        res.status(400).json({ success: false, error: 'CLOSED', message: 'Submission period has ended.' })
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
      const prior = await fetchStudentWorkSubmission(
        ctx.pool,
        'activity_submissions',
        'activity_id',
        activityId,
        ctx.studentRow.id,
      )
      if (prior?.file_path) deleteSubmissionFileByUrl(prior.file_path)

      const fileMeta = saveStudentSubmissionFile({
        buffer: file.buffer,
        originalName: file.originalname,
        mime: file.mimetype,
        studentId: ctx.studentRow.id,
        itemId: activityId,
        kind: 'activity',
      })
      const studentName = studentDisplayName(ctx.studentRow)
      const saved = await upsertStudentActivitySubmission(ctx.pool, {
        activityId,
        studentId: ctx.studentRow.id,
        studentName,
        fileMeta,
      })
      const total = Number(row.total_score) || 100
      const activityTitle = String(row.title || row.activity_title || '').trim()

      try {
        await customActivityLogger.logActivitySubmit(String(ctx.user.id), activityId, {
          ...auditCtx(ctx.user, ctx.studentRow),
          activityTitle,
        })
        await insertAuditLogRecord(
          'ACTIVITY_SUBMITTED',
          {
            userId: String(ctx.user.id),
            role: 'student',
            action: 'activity_submitted',
            description: activityTitle
              ? `Student submitted activity: ${activityTitle}`
              : `Student submitted activity ${activityId}`,
            activityId,
            activityTitle,
            studentId: ctx.studentRow.id,
            module: STUDENT_PORTAL_MODULES.ACTIVITIES,
          },
          {
            module: STUDENT_PORTAL_MODULES.ACTIVITIES,
            action: 'Submit',
            performed_by: String(ctx.user.id),
            performed_by_name: studentName,
            target_id: String(activityId),
            target_label: activityTitle || `Activity ${activityId}`,
          },
        )
      } catch {
        /* non-fatal */
      }

      res.json({ success: true, submission: mapSubmissionResponse(saved, total) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/activities/:id/submit')
    }
  })
}

export { registerWorkRoutes }
