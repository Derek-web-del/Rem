import { ensureAssignmentsSchema } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { ensureQuizSubmissionsSchema } from './quizSubmissionsDb.js'
import { decryptStudentPiiFields, studentDisplayName } from './studentPiiCrypto.js'
import { isDeadlinePassed, isWorkLockedForStudent } from './studentWorkPortal.js'
import {
  deleteSubmissionFileByUrl,
  saveStudentSubmissionFile,
} from './submissionStorage.js'

const ENTITY_TYPES = new Set(['assignment', 'activity', 'quiz'])

const ENTITY_CONFIG = {
  assignment: {
    itemTable: 'assignments',
    submissionTable: 'assignment_submissions',
    fkCol: 'assignment_id',
    deadlineCol: 'submission_deadline',
    titleCol: 'title',
  },
  activity: {
    itemTable: 'activities',
    submissionTable: 'activity_submissions',
    fkCol: 'activity_id',
    deadlineCol: 'submission_deadline',
    titleCol: 'title',
  },
  quiz: {
    itemTable: 'quizzes',
    submissionTable: 'quiz_submissions',
    fkCol: 'quiz_id',
    deadlineCol: 'deadline',
    titleCol: 'title',
  },
}

function parsePositiveId(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function ensureEntitySchema(pool, entityType) {
  if (entityType === 'assignment') await ensureAssignmentsSchema(pool)
  else if (entityType === 'activity') await ensureActivitiesSchema(pool)
  else await ensureQuizSubmissionsSchema(pool)
}

async function fetchStudentName(pool, studentId) {
  const { rows } = await pool.query(`SELECT * FROM students WHERE id = $1 LIMIT 1`, [studentId])
  if (!rows?.length) return `Student #${studentId}`
  return studentDisplayName(decryptStudentPiiFields(rows[0])) || `Student #${studentId}`
}

async function fetchWorkItem(pool, entityType, entityId) {
  const cfg = ENTITY_CONFIG[entityType]
  const { rows } = await pool.query(
    `SELECT id, ${cfg.titleCol} AS title, ${cfg.deadlineCol} AS deadline FROM ${cfg.itemTable} WHERE id = $1 LIMIT 1`,
    [entityId],
  )
  return rows?.[0] ?? null
}

async function fetchSubmissionRow(pool, entityType, entityId, studentId) {
  const cfg = ENTITY_CONFIG[entityType]
  const { rows } = await pool.query(
    `SELECT * FROM ${cfg.submissionTable} WHERE ${cfg.fkCol} = $1 AND student_id = $2 LIMIT 1`,
    [entityId, studentId],
  )
  return rows?.[0] ?? null
}

function parseUntilIso(raw) {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export async function grantSubmissionExtension(
  pool,
  { entityType, entityId, studentId, until, reason, grantedBy },
) {
  const type = String(entityType || '').trim().toLowerCase()
  const entId = parsePositiveId(entityId)
  const sid = parsePositiveId(studentId)
  if (!ENTITY_TYPES.has(type) || !entId || !sid) return { error: 'BAD_REQUEST' }

  const untilDate = parseUntilIso(until)
  if (!untilDate || untilDate.getTime() <= Date.now()) {
    return { error: 'BAD_UNTIL', message: 'Extension until date must be in the future.' }
  }

  const trimmedReason = String(reason || '').trim()
  if (trimmedReason.length < 10) {
    return { error: 'BAD_REASON', message: 'Reason must be at least 10 characters.' }
  }

  await ensureEntitySchema(pool, type)
  const item = await fetchWorkItem(pool, type, entId)
  if (!item) return { error: 'NOT_FOUND', message: 'Work item not found.' }

  const deadline = item.deadline ?? null
  if (!isDeadlinePassed(deadline)) {
    return {
      error: 'NOT_LOCKED',
      message: 'Late submission extension is only needed after the original deadline has passed.',
    }
  }
  if (untilDate.getTime() <= new Date(deadline).getTime()) {
    return {
      error: 'BAD_UNTIL',
      message: 'Extension until date must be after the original deadline.',
    }
  }

  const cfg = ENTITY_CONFIG[type]
  const studentName = await fetchStudentName(pool, sid)
  const existing = await fetchSubmissionRow(pool, type, entId, sid)
  const untilIso = untilDate.toISOString()
  const grantedAt = new Date().toISOString()
  const grantedByText = String(grantedBy || '').trim() || null

  const hasFile = Boolean(String(existing?.file_path ?? '').trim())
  const status = String(existing?.status ?? 'not_submitted').trim().toLowerCase()
  const resetExpired = status === 'expired' && !hasFile
  const resetStatus = type === 'quiz' ? 'not_started' : 'not_submitted'

  let submission
  if (existing) {
    const { rows } = await pool.query(
      `
      UPDATE ${cfg.submissionTable}
      SET late_submission_until = $1,
          late_submission_reason = $2,
          late_submission_granted_by = $3,
          late_submission_granted_at = $4,
          score = CASE WHEN $5 THEN NULL ELSE score END,
          status = CASE WHEN $5 THEN $8 ELSE status END,
          updated_at = NOW()
      WHERE ${cfg.fkCol} = $6 AND student_id = $7
      RETURNING *
      `,
      [untilIso, trimmedReason, grantedByText, grantedAt, resetExpired, entId, sid, resetStatus],
    )
    submission = rows?.[0]
  } else if (type === 'quiz') {
    const { rows } = await pool.query(
      `
      INSERT INTO ${cfg.submissionTable} (
        ${cfg.fkCol}, student_id, status,
        late_submission_until, late_submission_reason, late_submission_granted_by, late_submission_granted_at,
        updated_at
      )
      VALUES ($1, $2, 'not_started', $3, $4, $5, $6, NOW())
      RETURNING *
      `,
      [entId, sid, untilIso, trimmedReason, grantedByText, grantedAt],
    )
    submission = rows?.[0]
  } else {
    const { rows } = await pool.query(
      `
      INSERT INTO ${cfg.submissionTable} (
        ${cfg.fkCol}, student_id, student_name, status,
        late_submission_until, late_submission_reason, late_submission_granted_by, late_submission_granted_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'not_submitted', $4, $5, $6, $7, NOW())
      RETURNING *
      `,
      [entId, sid, studentName, untilIso, trimmedReason, grantedByText, grantedAt],
    )
    submission = rows?.[0]
  }

  if (!submission) return { error: 'FAILED', message: 'Could not grant extension.' }

  return {
    entity_type: type,
    entity_id: entId,
    student_id: sid,
    title: String(item.title || '').trim() || 'Untitled',
    deadline,
    late_submission_until: untilIso,
    reason: trimmedReason,
    reset_expired: resetExpired,
    submission,
  }
}

export async function revokeSubmissionExtension(pool, { entityType, entityId, studentId }) {
  const type = String(entityType || '').trim().toLowerCase()
  const entId = parsePositiveId(entityId)
  const sid = parsePositiveId(studentId)
  if (!ENTITY_TYPES.has(type) || !entId || !sid) return { error: 'BAD_REQUEST' }

  await ensureEntitySchema(pool, type)
  const cfg = ENTITY_CONFIG[type]
  const { rows } = await pool.query(
    `
    UPDATE ${cfg.submissionTable}
    SET late_submission_until = NULL,
        late_submission_reason = NULL,
        late_submission_granted_by = NULL,
        late_submission_granted_at = NULL,
        updated_at = NOW()
    WHERE ${cfg.fkCol} = $1 AND student_id = $2
    RETURNING *
    `,
    [entId, sid],
  )
  if (!rows?.length) return { error: 'NOT_FOUND', message: 'Submission not found.' }
  return { entity_type: type, entity_id: entId, student_id: sid, submission: rows[0] }
}

export async function adminUploadSubmissionOnBehalf(
  pool,
  { entityType, entityId, studentId, fileMeta, reason, uploadedBy },
) {
  const type = String(entityType || '').trim().toLowerCase()
  if (type !== 'assignment' && type !== 'activity') {
    return { error: 'BAD_TYPE', message: 'Upload on behalf is only supported for assignments and activities.' }
  }

  const entId = parsePositiveId(entityId)
  const sid = parsePositiveId(studentId)
  if (!entId || !sid) return { error: 'BAD_REQUEST' }

  const trimmedReason = String(reason || '').trim()
  if (trimmedReason.length < 10) {
    return { error: 'BAD_REASON', message: 'Reason must be at least 10 characters.' }
  }

  await ensureEntitySchema(pool, type)
  const submission = await fetchSubmissionRow(pool, type, entId, sid)
  const lateUntil = submission?.late_submission_until ?? null
  if (!lateUntil || new Date(lateUntil).getTime() < Date.now()) {
    return {
      error: 'NO_EXTENSION',
      message: 'An active late submission extension is required before uploading on behalf of a student.',
    }
  }

  if (submission?.file_path) deleteSubmissionFileByUrl(submission.file_path)

  const cfg = ENTITY_CONFIG[type]
  const studentName = await fetchStudentName(pool, sid)
  const savedMeta = saveStudentSubmissionFile({
    buffer: fileMeta.buffer,
    originalName: fileMeta.originalName,
    mime: fileMeta.mime,
    studentId: sid,
    itemId: entId,
    kind: type,
  })

  let updated
  if (submission) {
    const { rows } = await pool.query(
      `
      UPDATE ${cfg.submissionTable}
      SET file_path = $1, file_name = $2, status = 'submitted', submitted_at = NOW(),
          score = NULL, updated_at = NOW()
      WHERE ${cfg.fkCol} = $3 AND student_id = $4
      RETURNING *
      `,
      [savedMeta.file_path, savedMeta.file_name, entId, sid],
    )
    updated = rows?.[0]
  } else {
    const { rows } = await pool.query(
      `
      INSERT INTO ${cfg.submissionTable} (
        ${cfg.fkCol}, student_id, student_name, file_path, file_name, status, submitted_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'submitted', NOW(), NOW())
      RETURNING *
      `,
      [entId, sid, studentName, savedMeta.file_path, savedMeta.file_name],
    )
    updated = rows?.[0]
  }

  if (!updated) return { error: 'FAILED', message: 'Could not save submission.' }

  const item = await fetchWorkItem(pool, type, entId)
  return {
    entity_type: type,
    entity_id: entId,
    student_id: sid,
    title: String(item?.title || '').trim() || 'Untitled',
    reason: trimmedReason,
    uploaded_by: String(uploadedBy || '').trim() || null,
    submission: updated,
  }
}

export async function fetchSubmissionLockContext(pool, entityType, submissionId, entityId, deadline) {
  const type = String(entityType || '').trim().toLowerCase()
  const subId = parsePositiveId(submissionId)
  const entId = parsePositiveId(entityId)
  if (!ENTITY_TYPES.has(type)) return { locked: isDeadlinePassed(deadline) }

  await ensureEntitySchema(pool, type)
  const cfg = ENTITY_CONFIG[type]
  let row = null
  if (subId) {
    const { rows } = await pool.query(`SELECT * FROM ${cfg.submissionTable} WHERE id = $1 LIMIT 1`, [subId])
    row = rows?.[0] ?? null
  } else if (entId) {
    row = null
  }

  if (!row) return { locked: isDeadlinePassed(deadline), submission: null }

  const locked = isWorkLockedForStudent(deadline, row.late_submission_until)
  return { locked, submission: row }
}

export async function isTeacherSubmissionScoreLocked(pool, entityType, submissionId, deadline) {
  const type = String(entityType || '').trim().toLowerCase()
  const subId = parsePositiveId(submissionId)
  if (!subId) return isDeadlinePassed(deadline)

  await ensureEntitySchema(pool, type)
  const cfg = ENTITY_CONFIG[type]
  const { rows } = await pool.query(
    `SELECT late_submission_until FROM ${cfg.submissionTable} WHERE id = $1 LIMIT 1`,
    [subId],
  )
  const row = rows?.[0]
  if (!row) return isDeadlinePassed(deadline)
  return isWorkLockedForStudent(deadline, row.late_submission_until)
}
