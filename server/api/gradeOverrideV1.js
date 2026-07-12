import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import { decryptStudentPiiFields, studentDisplayName } from '../lib/studentPiiCrypto.js'
import { computePercent } from '../lib/gradesDb.js'
import { applySubmissionScoreOverride, OVERRIDE_NOT_LOCKED_MSG } from '../lib/submissionScoreUpdate.js'
import { resolveAdminAuditActor } from '../lib/adminAuditActor.js'
import { ADMIN_PORTAL_MODULES } from '../../shared/auditPortalModules.js'

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

export function createGradeOverrideV1Router(express, auth) {
  const router = express.Router()

  router.patch('/grade-override', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const pool = getPgPool()
      if (!pool) {
        res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: 'Database unavailable.' })
        return
      }

      const entityType = String(req.body?.entity_type ?? '').trim().toLowerCase()
      const submissionId = parsePositiveId(req.body?.submission_id)
      const entityId = parsePositiveId(req.body?.entity_id)
      const studentId = parsePositiveId(req.body?.student_id)
      const newScore = Number(req.body?.new_score)
      const reason = String(req.body?.reason ?? '').trim()

      if (!ENTITY_TYPES.has(entityType)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_type must be assignment, activity, or quiz.' })
        return
      }
      if (!studentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'student_id is required.' })
        return
      }
      if (!submissionId && !entityId) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'submission_id or entity_id is required.',
        })
        return
      }
      if (!Number.isFinite(newScore)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'new_score must be a number.' })
        return
      }
      if (!reason) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'reason is required.' })
        return
      }

      const result = await applySubmissionScoreOverride(
        pool,
        entityType,
        { submissionId, entityId, studentId },
        newScore,
      )

      if (!result) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found for this student.' })
        return
      }

      if (result.error === 'BAD_TARGET') {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'submission_id or entity_id is required.',
        })
        return
      }

      if (result.error === 'RANGE') {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `new_score must be between 0 and ${result.max_score}.`,
        })
        return
      }

      if (result.error === 'NOT_LOCKED') {
        res.status(403).json({
          success: false,
          error: 'NOT_LOCKED',
          message: result.message || OVERRIDE_NOT_LOCKED_MSG,
        })
        return
      }

      const actor = await resolveAdminAuditActor(adminSession)
      const actorId = actor.actorId
      const studentName = await fetchStudentName(pool, studentId)
      const resolvedSubmissionId = result.submission?.id ?? submissionId ?? null
      const oldPct =
        result.old_score != null
          ? formatPercent(result.old_score, result.max_score)
          : '0%'
      const newPct = formatPercent(result.new_score, result.max_score)
      const overriddenAt = new Date().toISOString()

      const description =
        `Admin changed ${entityType} score for ${studentName} from ${oldPct} to ${newPct}. Reason: ${reason}`

      const auditPayload = {
        userId: actorId,
        userName: actor.actorName,
        role: 'admin',
        action: 'grade_override',
        description,
        displayType: 'Grade override',
        module: ADMIN_PORTAL_MODULES.STUDENTS,
        entity_type: entityType,
        submission_id: resolvedSubmissionId,
        entity_id: result.entity_id ?? entityId ?? null,
        student_id: studentId,
        old_score: result.old_score,
        new_score: result.new_score,
        reason,
        overridden_by: actorId,
        overridden_at: overriddenAt,
        actorName: actor.actorName,
        actorEmail: actor.actorEmail || null,
        actorUserId: actorId,
        performed_by_name: actor.actorName,
      }

      try {
        await insertAuditLogRecord('GRADE_OVERRIDE', auditPayload, {
          module: ADMIN_PORTAL_MODULES.STUDENTS,
          action: 'grade_override',
          performed_by: actorId,
          performed_by_name: actor.actorName,
          target_id: String(studentId),
          target_label: `${studentName} — ${result.title || entityType}`,
        })
        await auditInstituteRecord(adminSession, 'GRADE_OVERRIDE', {
          recordType: entityType,
          recordId: String(resolvedSubmissionId ?? result.entity_id ?? entityId ?? ''),
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
          score: result.new_score,
          max_score: result.max_score,
          entity_type: entityType,
          entity_id: result.entity_id,
          title: result.title,
        },
        audit: { event_type: 'GRADE_OVERRIDE', description },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/v1/admin/grade-override')
    }
  })

  return router
}
