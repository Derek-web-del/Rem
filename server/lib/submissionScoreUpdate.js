import { ensureAssignmentsSchema } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { ensureQuizSubmissionsSchema } from './quizSubmissionsDb.js'
import { isDeadlinePassed } from './studentWorkPortal.js'

export const OVERRIDE_NOT_LOCKED_MSG =
  'Override is only allowed after the submission deadline has passed.'

function deadlineNotPassedResult() {
  return { error: 'NOT_LOCKED', message: OVERRIDE_NOT_LOCKED_MSG }
}

export async function applySubmissionScoreOverride(pool, entityType, submissionId, studentId, newScore) {
  const type = String(entityType || '').trim().toLowerCase()
  if (type === 'assignment') return overrideAssignmentScore(pool, submissionId, studentId, newScore)
  if (type === 'activity') return overrideActivityScore(pool, submissionId, studentId, newScore)
  if (type === 'quiz') return overrideQuizScore(pool, submissionId, studentId, newScore)
  return { error: 'BAD_TYPE' }
}

async function overrideAssignmentScore(pool, submissionId, studentId, newScore) {
  await ensureAssignmentsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT s.id, s.score AS old_score, s.assignment_id, a.title, a.total_score AS max_score,
           a.submission_deadline AS deadline, a.faculty_id
    FROM assignment_submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    WHERE s.id = $1 AND s.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore)
  const { rows: updated } = await pool.query(
    `UPDATE assignment_submissions
     SET score = $1, status = 'graded', updated_at = NOW()
     WHERE id = $2 AND student_id = $3
     RETURNING *`,
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
    faculty_id: row.faculty_id,
  }
}

async function overrideActivityScore(pool, submissionId, studentId, newScore) {
  await ensureActivitiesSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT s.id, s.score AS old_score, s.activity_id, a.title, a.total_score AS max_score,
           a.submission_deadline AS deadline, a.faculty_id
    FROM activity_submissions s
    INNER JOIN activities a ON a.id = s.activity_id
    WHERE s.id = $1 AND s.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore)
  const { rows: updated } = await pool.query(
    `UPDATE activity_submissions
     SET score = $1, status = 'graded', updated_at = NOW()
     WHERE id = $2 AND student_id = $3
     RETURNING *`,
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
    faculty_id: row.faculty_id,
  }
}

async function overrideQuizScore(pool, submissionId, studentId, newScore) {
  await ensureQuizSubmissionsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT qs.id, qs.score AS old_score, qs.quiz_id, q.title,
           COALESCE(qs.total_points, q.total_points) AS max_score,
           q.deadline, q.created_by AS faculty_id
    FROM quiz_submissions qs
    INNER JOIN quizzes q ON q.id = qs.quiz_id
    WHERE qs.id = $1 AND qs.student_id = $2
    LIMIT 1
    `,
    [submissionId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore * 100) / 100
  const { rows: updated } = await pool.query(
    `UPDATE quiz_submissions SET score = $1, updated_at = NOW()
     WHERE id = $2 AND student_id = $3 RETURNING *`,
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
    faculty_id: row.faculty_id,
  }
}

export async function fetchSubmissionContextForOverwrite(pool, entityType, submissionId, studentId) {
  const type = String(entityType || '').trim().toLowerCase()
  if (type === 'assignment') {
    await ensureAssignmentsSchema(pool)
    const { rows } = await pool.query(
      `SELECT s.score AS old_score, s.assignment_id AS entity_id, a.title, a.total_score AS max_score,
              a.submission_deadline AS deadline, a.faculty_id
       FROM assignment_submissions s
       INNER JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1 AND s.student_id = $2 LIMIT 1`,
      [submissionId, studentId],
    )
    if (!rows[0]) return null
    return { ...rows[0], entity_type: 'assignment' }
  }
  if (type === 'activity') {
    await ensureActivitiesSchema(pool)
    const { rows } = await pool.query(
      `SELECT s.score AS old_score, s.activity_id AS entity_id, a.title, a.total_score AS max_score,
              a.submission_deadline AS deadline, a.faculty_id
       FROM activity_submissions s
       INNER JOIN activities a ON a.id = s.activity_id
       WHERE s.id = $1 AND s.student_id = $2 LIMIT 1`,
      [submissionId, studentId],
    )
    if (!rows[0]) return null
    return { ...rows[0], entity_type: 'activity' }
  }
  if (type === 'quiz') {
    await ensureQuizSubmissionsSchema(pool)
    const { rows } = await pool.query(
      `SELECT qs.score AS old_score, qs.quiz_id AS entity_id, q.title,
              COALESCE(qs.total_points, q.total_points) AS max_score,
              q.deadline, q.created_by AS faculty_id
       FROM quiz_submissions qs
       INNER JOIN quizzes q ON q.id = qs.quiz_id
       WHERE qs.id = $1 AND qs.student_id = $2 LIMIT 1`,
      [submissionId, studentId],
    )
    if (!rows[0]) return null
    return { ...rows[0], entity_type: 'quiz' }
  }
  return null
}
