import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { insertAuditLogRecord } from '../lib/auditLogsLedger.js'
import { ensureAssignmentsSchema } from '../lib/assignmentsDb.js'
import { ensureActivitiesSchema } from '../lib/activitiesDb.js'
import { ensureQuizSubmissionsSchema } from '../lib/quizSubmissionsDb.js'
import { decryptStudentPiiFields, studentDisplayName } from '../lib/studentPiiCrypto.js'
import { computePercent } from '../lib/gradesDb.js'
import { isDeadlinePassed } from '../lib/studentWorkPortal.js'

const ENTITY_TYPES = new Set(['assignment', 'activity', 'quiz'])

const OVERRIDE_NOT_LOCKED_MSG =
  'Override is only allowed after the submission deadline has passed.'

function deadlineNotPassedResult() {
  return { error: 'NOT_LOCKED', message: OVERRIDE_NOT_LOCKED_MSG }
}

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

async function overrideAssignmentScore(pool, submissionId, studentId, newScore) {
  await ensureAssignmentsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT s.id, s.score AS old_score, s.assignment_id, a.title, a.total_score AS max_score,
           a.submission_deadline AS deadline
    FROM assignment_submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = $1 AND s.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null

  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) {
    return deadlineNotPassedResult()
  }
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) {
    return { error: 'RANGE', max_score: maxScore }
  }
  const rounded = Math.round(newScore)

  const { rows: updated } = await pool.query(
    `
    UPDATE assignment_submissions
    SET score = $1, status = 'graded', updated_at = NOW()
    WHERE id = $2 AND student_id = $3
    RETURNING *
    `,
    [rounded, submissionId, studentId],
  )
  if (!updated?.length) return null

  return {
    entity_type: 'assignment',
    entity_id: row.assignment_id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: updated[0],
  }
}

async function overrideActivityScore(pool, submissionId, studentId, newScore) {
  await ensureActivitiesSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT s.id, s.score AS old_score, s.activity_id, a.title, a.total_score AS max_score,
           a.submission_deadline AS deadline
    FROM activity_submissions s
    INNER JOIN activities a ON a.id = s.activity_id
    WHERE s.id = $1 AND s.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null

  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) {
    return deadlineNotPassedResult()
  }
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) {
    return { error: 'RANGE', max_score: maxScore }
  }
  const rounded = Math.round(newScore)

  const { rows: updated } = await pool.query(
    `
    UPDATE activity_submissions
    SET score = $1, status = 'graded', updated_at = NOW()
    WHERE id = $2 AND student_id = $3
    RETURNING *
    `,
    [rounded, submissionId, studentId],
  )
  if (!updated?.length) return null

  return {
    entity_type: 'activity',
    entity_id: row.activity_id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: updated[0],
  }
}

async function overrideQuizScore(pool, submissionId, studentId, newScore) {
  await ensureQuizSubmissionsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT qs.id, qs.score AS old_score, qs.quiz_id, q.title,
           COALESCE(qs.total_points, q.total_points) AS max_score,
           q.deadline
    FROM quiz_submissions qs
    INNER JOIN quizzes q ON q.id = qs.quiz_id
    WHERE qs.id = $1 AND qs.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null

  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) {
    return deadlineNotPassedResult()
  }
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) {
    return { error: 'RANGE', max_score: maxScore }
  }
  const rounded = Math.round(newScore * 100) / 100

  const { rows: updated } = await pool.query(
    `
    UPDATE quiz_submissions
    SET score = $1, updated_at = NOW()
    WHERE id = $2 AND student_id = $3
    RETURNING *
    `,
    [rounded, submissionId, studentId],
  )
  if (!updated?.length) return null

  return {
    entity_type: 'quiz',
    entity_id: row.quiz_id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: updated[0],
  }
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
      const studentId = parsePositiveId(req.body?.student_id)
      const newScore = Number(req.body?.new_score)
      const reason = String(req.body?.reason ?? '').trim()

      if (!ENTITY_TYPES.has(entityType)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'entity_type must be assignment, activity, or quiz.' })
        return
      }
      if (!submissionId || !studentId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'submission_id and student_id are required.' })
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

      let result = null
      if (entityType === 'assignment') {
        result = await overrideAssignmentScore(pool, submissionId, studentId, newScore)
      } else if (entityType === 'activity') {
        result = await overrideActivityScore(pool, submissionId, studentId, newScore)
      } else {
        result = await overrideQuizScore(pool, submissionId, studentId, newScore)
      }

      if (!result) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found for this student.' })
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

      const actor = adminSession.user ?? adminSession?.data?.user ?? {}
      const actorId = String(actor.id || '').trim()
      const studentName = await fetchStudentName(pool, studentId)
      const oldPct = formatPercent(result.old_score, result.max_score)
      const newPct = formatPercent(result.new_score, result.max_score)
      const overriddenAt = new Date().toISOString()

      const description =
        `Admin changed ${entityType} score for ${studentName} from ${oldPct} to ${newPct}. Reason: ${reason}`

      const auditPayload = {
        userId: actorId,
        role: 'admin',
        action: 'grade_override',
        description,
        displayType: 'Grade override',
        entity_type: entityType,
        submission_id: submissionId,
        student_id: studentId,
        old_score: result.old_score,
        new_score: result.new_score,
        reason,
        overridden_by: actorId,
        overridden_at: overriddenAt,
      }

      try {
        await insertAuditLogRecord('GRADE_OVERRIDE', auditPayload)
        await auditInstituteRecord(adminSession, 'GRADE_OVERRIDE', {
          recordType: entityType,
          recordId: String(submissionId),
          description,
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
