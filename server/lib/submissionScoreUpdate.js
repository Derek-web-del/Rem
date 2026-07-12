import { ensureAssignmentsSchema } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { ensureQuizSubmissionsSchema } from './quizSubmissionsDb.js'
import { decryptStudentPiiFields, studentDisplayName } from './studentPiiCrypto.js'
import { isDeadlinePassed } from './studentWorkPortal.js'

export const OVERRIDE_NOT_LOCKED_MSG =
  'Override is only allowed after the submission deadline has passed.'

function deadlineNotPassedResult() {
  return { error: 'NOT_LOCKED', message: OVERRIDE_NOT_LOCKED_MSG }
}

function parsePositiveId(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function fetchStudentName(pool, studentId) {
  const { rows } = await pool.query(`SELECT * FROM students WHERE id = $1 LIMIT 1`, [studentId])
  if (!rows?.length) return `Student #${studentId}`
  return studentDisplayName(decryptStudentPiiFields(rows[0])) || `Student #${studentId}`
}

export async function applySubmissionScoreOverride(
  pool,
  entityType,
  { submissionId = null, entityId = null, studentId },
  newScore,
) {
  const type = String(entityType || '').trim().toLowerCase()
  const sid = parsePositiveId(studentId)
  if (!sid) return { error: 'BAD_STUDENT' }

  const subId = parsePositiveId(submissionId)
  const entId = parsePositiveId(entityId)

  if (type === 'assignment') {
    if (subId) return overrideAssignmentScore(pool, subId, sid, newScore)
    if (entId) return upsertAssignmentScoreOverride(pool, entId, sid, newScore)
    return { error: 'BAD_TARGET' }
  }
  if (type === 'activity') {
    if (subId) return overrideActivityScore(pool, subId, sid, newScore)
    if (entId) return upsertActivityScoreOverride(pool, entId, sid, newScore)
    return { error: 'BAD_TARGET' }
  }
  if (type === 'quiz') {
    if (subId) return overrideQuizScore(pool, subId, sid, newScore)
    if (entId) return upsertQuizScoreOverride(pool, entId, sid, newScore)
    return { error: 'BAD_TARGET' }
  }
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

async function upsertAssignmentScoreOverride(pool, assignmentId, studentId, newScore) {
  await ensureAssignmentsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT a.id, a.title, a.total_score AS max_score, a.submission_deadline AS deadline, a.faculty_id,
           s.id AS submission_id, s.score AS old_score
    FROM assignments a
    LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $2
    WHERE a.id = $1
    LIMIT 1
    `,
    [assignmentId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore)
  const studentName = await fetchStudentName(pool, studentId)
  const { rows: upserted } = await pool.query(
    `
    INSERT INTO assignment_submissions (assignment_id, student_id, student_name, score, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (assignment_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      status = 'graded',
      student_name = COALESCE(NULLIF(EXCLUDED.student_name, ''), assignment_submissions.student_name),
      updated_at = NOW()
    RETURNING *
    `,
    [assignmentId, studentId, studentName, rounded],
  )
  if (!upserted?.length) return null
  return {
    entity_type: 'assignment',
    entity_id: row.id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: upserted[0],
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

async function upsertActivityScoreOverride(pool, activityId, studentId, newScore) {
  await ensureActivitiesSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT a.id, a.title, a.total_score AS max_score, a.submission_deadline AS deadline, a.faculty_id,
           s.id AS submission_id, s.score AS old_score
    FROM activities a
    LEFT JOIN activity_submissions s ON s.activity_id = a.id AND s.student_id = $2
    WHERE a.id = $1
    LIMIT 1
    `,
    [activityId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore)
  const studentName = await fetchStudentName(pool, studentId)
  const { rows: upserted } = await pool.query(
    `
    INSERT INTO activity_submissions (activity_id, student_id, student_name, score, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (activity_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      status = 'graded',
      student_name = COALESCE(NULLIF(EXCLUDED.student_name, ''), activity_submissions.student_name),
      updated_at = NOW()
    RETURNING *
    `,
    [activityId, studentId, studentName, rounded],
  )
  if (!upserted?.length) return null
  return {
    entity_type: 'activity',
    entity_id: row.id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: upserted[0],
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
    `UPDATE quiz_submissions SET score = $1, status = 'graded', updated_at = NOW()
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

async function upsertQuizScoreOverride(pool, quizId, studentId, newScore) {
  await ensureQuizSubmissionsSchema(pool)
  const { rows: found } = await pool.query(
    `
    SELECT q.id, q.title, q.total_points AS max_score, q.deadline, q.created_by AS faculty_id,
           qs.id AS submission_id, qs.score AS old_score
    FROM quizzes q
    LEFT JOIN quiz_submissions qs ON qs.quiz_id = q.id AND qs.student_id = $2
    WHERE q.id = $1
    LIMIT 1
    `,
    [quizId, studentId],
  )
  if (!found?.length) return null
  const row = found[0]
  if (!isDeadlinePassed(row.deadline)) return deadlineNotPassedResult()
  const maxScore = Number(row.max_score) || 100
  if (newScore < 0 || newScore > maxScore) return { error: 'RANGE', max_score: maxScore }
  const rounded = Math.round(newScore * 100) / 100
  const { rows: upserted } = await pool.query(
    `
    INSERT INTO quiz_submissions (quiz_id, student_id, score, total_points, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (quiz_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      total_points = COALESCE(quiz_submissions.total_points, EXCLUDED.total_points),
      status = 'graded',
      updated_at = NOW()
    RETURNING *
    `,
    [quizId, studentId, rounded, maxScore],
  )
  if (!upserted?.length) return null
  return {
    entity_type: 'quiz',
    entity_id: row.id,
    title: row.title,
    max_score: maxScore,
    old_score: row.old_score != null ? Number(row.old_score) : null,
    new_score: rounded,
    submission: upserted[0],
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
