import {
  ensureQuizzesSchema,
  fetchQuizById,
  fetchStudentQuizById,
  hasQuizAccess,
  normalizeMaxAttempts,
} from './quizzesDb.js'
import { normalizeGradeLevel, resolveStudentGradeLevel } from './studentSession.js'
import { studentDisplayName } from './studentPiiCrypto.js'
import { ensureLateSubmissionColumns } from './lateSubmissionSchema.js'
import { isSubmissionOpenForStudent } from './studentWorkPortal.js'

export async function ensureQuizSubmissionsSchema(pool) {
  await ensureQuizzesSchema(pool)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_submissions (
      id BIGSERIAL PRIMARY KEY,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'not_started',
      score NUMERIC(10, 2),
      total_points NUMERIC(10, 2),
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (quiz_id, student_id)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_student_answers (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL REFERENCES quiz_submissions(id) ON DELETE CASCADE,
      question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
      student_answer TEXT,
      selected_choice_id BIGINT REFERENCES quiz_choices(id) ON DELETE SET NULL,
      is_correct BOOLEAN,
      points_earned NUMERIC(10, 2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (submission_id, question_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON quiz_submissions (quiz_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_submissions_student_id ON quiz_submissions (student_id)`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_quiz_student_answers_submission ON quiz_student_answers (submission_id)`,
  )
  await pool.query(`
    ALTER TABLE quiz_submissions
      ADD COLUMN IF NOT EXISTS violations JSONB NOT NULL DEFAULT '[]'
  `)
  await ensureLateSubmissionColumns(pool, 'quiz_submissions')
}

export function isQuizOpenForStudent(deadlineIso, lateUntilIso) {
  return isSubmissionOpenForStudent(deadlineIso, lateUntilIso)
}

export function isQuizDeadlineOpen(deadlineIso) {
  if (!deadlineIso) return true
  const d = new Date(deadlineIso)
  if (Number.isNaN(d.getTime())) return true
  return d.getTime() >= Date.now()
}

function normalizeLateUntil(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function quizSubmissionWindowOpen(quiz, submission) {
  return isSubmissionOpenForStudent(quiz?.deadline, submission?.late_submission_until)
}

function mapSubmissionRow(row) {
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    student_id: row.student_id != null ? String(row.student_id) : '',
    status: String(row.status ?? 'not_started').trim().toLowerCase(),
    score: row.score != null ? Number(row.score) : null,
    total_points: row.total_points != null ? Number(row.total_points) : null,
    time_spent_seconds: row.time_spent_seconds != null ? Number(row.time_spent_seconds) : 0,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at ?? null,
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at ?? null,
    attempt_number: row.attempt_number != null ? Number(row.attempt_number) : 1,
  }
}

function mapStudentAnswerRow(row) {
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : '',
    submission_id: row.submission_id != null ? String(row.submission_id) : '',
    question_id: row.question_id != null ? String(row.question_id) : '',
    student_answer: row.student_answer ?? null,
    selected_choice_id: row.selected_choice_id != null ? String(row.selected_choice_id) : null,
    is_correct: row.is_correct != null ? Boolean(row.is_correct) : null,
    points_earned: row.points_earned != null ? Number(row.points_earned) : null,
  }
}

export function stripQuizForTaking(quiz) {
  if (!quiz) return null
  const copy = JSON.parse(JSON.stringify(quiz))
  for (const part of copy.parts || []) {
    for (const q of part.questions || []) {
      if (q.question_type === 'multiple_choice') {
        q.choices = (q.choices || []).map((c) => ({
          id: c.id,
          choice_label: c.choice_label,
          choice_text: c.choice_text,
        }))
      } else if (q.question_type === 'matching') {
        const pairs = q.answers || []
        q.match_options = [...new Set(pairs.map((p) => p.match_pair).filter(Boolean))]
        q.answers = pairs.map((a) => ({
          id: a.id,
          answer_text: a.answer_text,
          match_pair: '',
        }))
      } else if (q.question_type === 'enumeration') {
        q.answers = (q.answers || []).map((a) => ({
          id: a.id,
          answer_text: '',
        }))
      } else {
        q.answers = []
      }
    }
  }
  return copy
}

function submissionStatusLabel(status) {
  const s = String(status || 'not_started').toLowerCase()
  if (s === 'completed') return { label: 'Completed', tone: 'green' }
  if (s === 'in_progress') return { label: 'In Progress', tone: 'blue' }
  return { label: 'Not Started', tone: 'yellow' }
}

export function getQuizAttemptPolicy(quiz, submission) {
  const maxAttempts = normalizeMaxAttempts(quiz?.max_attempts ?? 1)
  const attemptsUsed = Math.max(0, Number(submission?.attempt_number ?? 0) || 0)
  const status = String(submission?.status || 'not_started').trim().toLowerCase()
  const completed = status === 'completed'
  const canRetake = completed && attemptsUsed < maxAttempts
  const canStart = !submission || status === 'not_started' || status === 'in_progress' || canRetake
  const attemptsRemaining = completed
    ? Math.max(0, maxAttempts - attemptsUsed)
    : Math.max(0, maxAttempts - (attemptsUsed > 0 ? attemptsUsed - 1 : 0))

  return {
    max_attempts: maxAttempts,
    attempts_used: attemptsUsed,
    attempts_remaining: attemptsRemaining,
    can_start: canStart,
    can_retake: canRetake,
  }
}

function attachAttemptFields(quiz, submission) {
  const policy = getQuizAttemptPolicy(quiz, submission)
  const open = quizSubmissionWindowOpen(quiz, submission)
  if (!open) {
    policy.can_start = false
    policy.can_retake = false
  }
  return { ...quiz, ...policy }
}

export function mapStudentQuizListRow(quiz, submission) {
  const sub = submission || {}
  const statusInfo = submissionStatusLabel(sub.status)
  const open = quizSubmissionWindowOpen(quiz, sub)
  const globalOpen = isQuizDeadlineOpen(quiz.deadline)
  const lateUntil = normalizeLateUntil(sub.late_submission_until)
  const total = quiz.total_points != null ? Number(quiz.total_points) : 0
  const score = sub.score != null ? Number(sub.score) : null
  const withAttempts = attachAttemptFields(quiz, sub)
  return {
    ...withAttempts,
    submission_id: sub.id || '',
    submission_status: sub.status || 'not_started',
    status: statusInfo.label,
    status_tone: statusInfo.tone,
    submission_open: open,
    can_submit: open,
    late_submission_until: lateUntil,
    has_late_extension: Boolean(lateUntil && new Date(lateUntil).getTime() >= Date.now()),
    deadline_badge: open ? (globalOpen ? 'Open' : 'Late') : 'Closed',
    deadline_badge_tone: open ? 'green' : 'red',
    score_display:
      sub.status === 'completed' && score != null
        ? `${score.toFixed(2)}/${total.toFixed(2)}`
        : '—',
    score,
    time_spent_seconds: sub.time_spent_seconds ?? 0,
    submitted_at: sub.submitted_at ?? null,
    started_at: sub.started_at ?? null,
  }
}

export async function fetchSubmissionForStudent(pool, quizId, studentId) {
  const { rows } = await pool.query(
    `SELECT * FROM quiz_submissions WHERE quiz_id = $1 AND student_id = $2 LIMIT 1`,
    [quizId, studentId],
  )
  return mapSubmissionRow(rows?.[0])
}

export async function listStudentQuizzesWithSubmissions(pool, studentRow) {
  await ensureQuizSubmissionsSchema(pool)
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  const studentId = studentRow?.id
  const params = [studentId]
  let gradeFilter = ''
  if (grade) {
    params.push(grade)
    gradeFilter = ` AND lower(trim(replace(coalesce(q.grade_level, ''), '  ', ' '))) = $${params.length}`
  }

  const { rows } = await pool.query(
    `
      SELECT
        q.*,
        (
          SELECT p.question_type
          FROM quiz_parts p
          WHERE p.quiz_id = q.id
          ORDER BY p.order_index ASC, p.id ASC
          LIMIT 1
        ) AS primary_question_type,
        s.id AS submission_id,
        s.status AS submission_status,
        s.score AS submission_score,
        s.total_points AS submission_total_points,
        s.time_spent_seconds,
        s.started_at,
        s.submitted_at,
        s.attempt_number
      FROM quizzes q
      LEFT JOIN quiz_submissions s ON s.quiz_id = q.id AND s.student_id = $1
      WHERE COALESCE(q.is_hidden, FALSE) = FALSE
      ${gradeFilter}
      ORDER BY q.created_at DESC, q.id DESC
    `,
    params,
  )

  const { mapQuizRow } = await import('./quizzesDb.js')
  return (rows || []).map((row) => {
    const submission = row.submission_id
      ? mapSubmissionRow({
          id: row.submission_id,
          quiz_id: row.id,
          student_id: studentId,
          status: row.submission_status,
          score: row.submission_score,
          total_points: row.submission_total_points,
          time_spent_seconds: row.time_spent_seconds,
          started_at: row.started_at,
          submitted_at: row.submitted_at,
          attempt_number: row.attempt_number,
        })
      : null
    const quiz = {
      id: String(row.id),
      title: String(row.title ?? '').trim(),
      description: String(row.description ?? '').trim(),
      instructions: String(row.instructions ?? '').trim(),
      activity_type: String(row.activity_type ?? 'Quiz').trim(),
      subject: String(row.subject ?? '').trim(),
      grade_level: String(row.grade_level ?? '').trim(),
      semester: row.semester != null ? Number(row.semester) : null,
      duration_mins: row.duration_mins != null ? Number(row.duration_mins) : null,
      deadline: row.deadline instanceof Date ? row.deadline.toISOString() : row.deadline ?? null,
      total_points: row.total_points != null ? Number(row.total_points) : 0,
      max_attempts: normalizeMaxAttempts(row.max_attempts ?? 1),
      is_hidden: Boolean(row.is_hidden),
      has_password: Boolean(String(row.quiz_password ?? '').trim()),
      created_by: String(row.created_by ?? '').trim(),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ?? null,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
      primary_question_type: String(row.primary_question_type ?? '').trim(),
    }
    return mapStudentQuizListRow(quiz, submission)
  })
}

export async function assertStudentQuizAccess(pool, studentRow, quizId) {
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  const quiz = await fetchStudentQuizById(pool, quizId)
  if (!quiz) return null
  if (grade) {
    const qg = normalizeGradeLevel(quiz.grade_level)
    if (qg && qg !== grade) return null
  }
  return quiz
}

function countQuestions(quiz) {
  let n = 0
  for (const part of quiz.parts || []) {
    n += (part.questions || []).length
  }
  return n
}

export async function fetchStudentQuizDetail(pool, quizId, studentRow) {
  const quiz = await assertStudentQuizAccess(pool, studentRow, quizId)
  if (!quiz) return null
  const submission = await fetchSubmissionForStudent(pool, quizId, studentRow.id)
  const attemptPolicy = getQuizAttemptPolicy(quiz, submission)
  const open = quizSubmissionWindowOpen(quiz, submission)
  return {
    quiz: {
      ...quiz,
      question_count: countQuestions(quiz),
      submission_open: open,
      can_submit: open,
      late_submission_until: normalizeLateUntil(submission?.late_submission_until),
      has_late_extension: Boolean(
        submission?.late_submission_until &&
          new Date(submission.late_submission_until).getTime() >= Date.now(),
      ),
      ...attemptPolicy,
    },
    submission,
    attempt_policy: attemptPolicy,
  }
}

export async function fetchStudentQuizTake(pool, quizId, studentRow) {
  const quiz = await assertStudentQuizAccess(pool, studentRow, quizId)
  if (!quiz) return null
  const submission = await fetchSubmissionForStudent(pool, quizId, studentRow.id)
  if (!quizSubmissionWindowOpen(quiz, submission)) {
    return { error: 'CLOSED', submission }
  }
  const attemptPolicy = getQuizAttemptPolicy(quiz, submission)
  if (submission?.status === 'completed') {
    if (attemptPolicy.can_retake) {
      return {
        can_retake: true,
        submission,
        attempt_policy: attemptPolicy,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          has_password: quiz.has_password,
          max_attempts: attemptPolicy.max_attempts,
          duration_mins: quiz.duration_mins,
        },
      }
    }
    return { completed: true, submission, attempt_policy: attemptPolicy }
  }
  const answers = await loadSavedAnswers(pool, submission?.id)
  const stripped = stripQuizForTaking(quiz)
  Object.assign(stripped, attemptPolicy)
  stripped.question_count = countQuestions(quiz)
  let remainingSeconds = null
  if (quiz.duration_mins && submission?.started_at) {
    const started = new Date(submission.started_at).getTime()
    const end = started + Number(quiz.duration_mins) * 60 * 1000
    remainingSeconds = Math.max(0, Math.floor((end - Date.now()) / 1000))
  } else if (quiz.duration_mins) {
    remainingSeconds = Number(quiz.duration_mins) * 60
  }
  return {
    quiz: stripped,
    submission,
    answers,
    remaining_seconds: remainingSeconds,
    submission_open: quizSubmissionWindowOpen(quiz, submission),
    attempt_policy: attemptPolicy,
  }
}

async function loadSavedAnswers(pool, submissionId) {
  if (!submissionId) return []
  const { rows } = await pool.query(
    `SELECT * FROM quiz_student_answers WHERE submission_id = $1 ORDER BY question_id ASC`,
    [submissionId],
  )
  return (rows || []).map(mapStudentAnswerRow).filter(Boolean)
}

export async function startQuizSubmission(pool, quizId, studentId) {
  await ensureQuizSubmissionsSchema(pool)
  const quiz = await fetchStudentQuizById(pool, quizId)
  if (!quiz) return { error: 'NOT_FOUND' }
  const existing = await fetchSubmissionForStudent(pool, quizId, studentId)
  if (!quizSubmissionWindowOpen(quiz, existing)) return { error: 'CLOSED' }

  const maxAttempts = normalizeMaxAttempts(quiz.max_attempts)
  const policy = getQuizAttemptPolicy(quiz, existing)

  if (existing?.status === 'completed') {
    if (!policy.can_retake) {
      return { error: 'NO_ATTEMPTS_LEFT', submission: existing }
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM quiz_student_answers WHERE submission_id = $1`, [existing.id])
      const { rows } = await client.query(
        `
          UPDATE quiz_submissions SET
            status = 'in_progress',
            score = NULL,
            total_points = NULL,
            submitted_at = NULL,
            time_spent_seconds = 0,
            violations = '[]'::jsonb,
            started_at = NOW(),
            attempt_number = COALESCE(attempt_number, 1) + 1,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [existing.id],
      )
      await client.query('COMMIT')
      return { submission: mapSubmissionRow(rows?.[0]) }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  const { rows } = await pool.query(
    `
      INSERT INTO quiz_submissions (quiz_id, student_id, status, started_at, attempt_number, updated_at)
      VALUES ($1, $2, 'in_progress', NOW(), 1, NOW())
      ON CONFLICT (quiz_id, student_id) DO UPDATE SET
        status = CASE
          WHEN quiz_submissions.status = 'completed' THEN quiz_submissions.status
          ELSE 'in_progress'
        END,
        started_at = COALESCE(quiz_submissions.started_at, NOW()),
        updated_at = NOW()
      RETURNING *
    `,
    [quizId, studentId],
  )
  const submission = mapSubmissionRow(rows?.[0])
  if (submission.status === 'completed' && !getQuizAttemptPolicy(quiz, submission).can_retake) {
    return { error: 'NO_ATTEMPTS_LEFT', submission }
  }
  return { submission }
}

function normalizeIncomingAnswer(a) {
  return {
    question_id: Number(a?.question_id),
    selected_choice_id: a?.selected_choice_id != null ? Number(a.selected_choice_id) : null,
    student_answer: a?.student_answer != null ? String(a.student_answer) : null,
  }
}

async function upsertAnswers(client, submissionId, answers) {
  for (const raw of answers || []) {
    const a = normalizeIncomingAnswer(raw)
    if (!Number.isFinite(a.question_id) || a.question_id <= 0) continue
    await client.query(
      `
        INSERT INTO quiz_student_answers (
          submission_id, question_id, student_answer, selected_choice_id, updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (submission_id, question_id) DO UPDATE SET
          student_answer = EXCLUDED.student_answer,
          selected_choice_id = EXCLUDED.selected_choice_id,
          updated_at = NOW()
      `,
      [
        submissionId,
        a.question_id,
        a.student_answer,
        Number.isFinite(a.selected_choice_id) ? a.selected_choice_id : null,
      ],
    )
  }
}

function unwrapStartResult(result) {
  if (result?.error) return result
  return { submission: result.submission }
}

export async function saveQuizProgress(pool, quizId, studentId, { answers = [], time_spent_seconds = 0 } = {}) {
  const quiz = await fetchStudentQuizById(pool, quizId)
  if (!quiz) return { error: 'NOT_FOUND' }
  let submission = await fetchSubmissionForStudent(pool, quizId, studentId)
  if (!quizSubmissionWindowOpen(quiz, submission)) return { error: 'CLOSED' }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!submission) {
      const started = unwrapStartResult(await startQuizSubmission(pool, quizId, studentId))
      if (started.error) {
        await client.query('ROLLBACK')
        return started
      }
      submission = started.submission
    }
    if (submission.status === 'completed') {
      const policy = getQuizAttemptPolicy(quiz, submission)
      if (!policy.can_retake) {
        await client.query('ROLLBACK')
        return { error: policy.attempts_remaining <= 0 ? 'NO_ATTEMPTS_LEFT' : 'COMPLETED', submission }
      }
      await client.query('ROLLBACK')
      return { error: 'COMPLETED', submission }
    }
    await client.query(
      `
        UPDATE quiz_submissions
        SET status = 'in_progress',
            time_spent_seconds = GREATEST(time_spent_seconds, $1),
            updated_at = NOW()
        WHERE id = $2
      `,
      [Math.max(0, Number(time_spent_seconds) || 0), submission.id],
    )
    await upsertAnswers(client, submission.id, answers)
    await client.query('COMMIT')
    const { rows } = await pool.query(`SELECT * FROM quiz_submissions WHERE id = $1`, [submission.id])
    return { submission: mapSubmissionRow(rows?.[0]), submittedAt: rows?.[0]?.updated_at }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

function scoreQuestion(question, answer) {
  const qType = String(question.question_type || '').trim()
  const maxPoints = Number(question.points) || 0

  if (qType === 'multiple_choice') {
    const correct = (question.choices || []).find((c) => c.is_correct)
    const match =
      correct &&
      answer?.selected_choice_id != null &&
      String(answer.selected_choice_id) === String(correct.id)
    return { is_correct: Boolean(match), points_earned: match ? maxPoints : 0 }
  }

  if (qType === 'true_false' || qType === 'identification') {
    const correct = String(question.answers?.[0]?.answer_text ?? '')
      .trim()
      .toLowerCase()
    const student = String(answer?.student_answer ?? '')
      .trim()
      .toLowerCase()
    const match = correct && student === correct
    return { is_correct: match, points_earned: match ? maxPoints : 0 }
  }

  if (qType === 'essay') {
    return { is_correct: null, points_earned: null }
  }

  if (qType === 'enumeration') {
    const correctAnswers = (question.answers || [])
      .map((a) => String(a.answer_text ?? '').trim().toLowerCase())
      .filter(Boolean)
    let studentAnswers = []
    try {
      studentAnswers = JSON.parse(answer?.student_answer || '[]')
    } catch {
      studentAnswers = String(answer?.student_answer || '')
        .split('|')
        .map((s) => s.trim())
    }
    if (!Array.isArray(studentAnswers)) studentAnswers = [studentAnswers]
    studentAnswers = studentAnswers.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    if (!correctAnswers.length) return { is_correct: false, points_earned: 0 }
    let matched = 0
    for (const sa of studentAnswers) {
      if (correctAnswers.includes(sa)) matched += 1
    }
    const ratio = matched / correctAnswers.length
    const points = Math.round(maxPoints * ratio * 100) / 100
    return { is_correct: ratio >= 1, points_earned: points }
  }

  if (qType === 'matching') {
    const pairs = question.answers || []
    let studentPairs = []
    try {
      studentPairs = JSON.parse(answer?.student_answer || '[]')
    } catch {
      studentPairs = []
    }
    if (!pairs.length) return { is_correct: false, points_earned: 0 }
    let matched = 0
    for (let i = 0; i < pairs.length; i += 1) {
      const p = pairs[i]
      const sp = studentPairs[i] || {}
      const leftOk =
        String(sp.answer_text ?? sp.left ?? '')
          .trim()
          .toLowerCase() ===
        String(p.answer_text ?? '')
          .trim()
          .toLowerCase()
      const rightOk =
        String(sp.match_pair ?? sp.right ?? '')
          .trim()
          .toLowerCase() ===
        String(p.match_pair ?? '')
          .trim()
          .toLowerCase()
      if (leftOk && rightOk) matched += 1
    }
    const ratio = matched / pairs.length
    const points = Math.round(maxPoints * ratio * 100) / 100
    return { is_correct: ratio >= 1, points_earned: points }
  }

  return { is_correct: false, points_earned: 0 }
}

function flattenQuestions(quiz) {
  const list = []
  for (const part of quiz.parts || []) {
    for (const q of part.questions || []) {
      list.push(q)
    }
  }
  return list
}

export async function submitQuizSubmission(pool, quizId, studentId, { answers = [], time_spent_seconds = 0 } = {}) {
  const quiz = await fetchStudentQuizById(pool, quizId)
  if (!quiz) return { error: 'NOT_FOUND' }
  let submission = await fetchSubmissionForStudent(pool, quizId, studentId)
  if (!quizSubmissionWindowOpen(quiz, submission)) return { error: 'CLOSED' }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!submission) {
      const started = unwrapStartResult(await startQuizSubmission(pool, quizId, studentId))
      if (started.error) {
        await client.query('ROLLBACK')
        return started
      }
      submission = started.submission
    }
    if (submission.status === 'completed') {
      const policy = getQuizAttemptPolicy(quiz, submission)
      await client.query('ROLLBACK')
      return {
        error: policy.attempts_remaining <= 0 ? 'NO_ATTEMPTS_LEFT' : 'COMPLETED',
        submission,
      }
    }

    await upsertAnswers(client, submission.id, answers)

    const questions = flattenQuestions(quiz)
    const answerMap = new Map()
    for (const a of answers || []) {
      const n = normalizeIncomingAnswer(a)
      if (Number.isFinite(n.question_id)) answerMap.set(String(n.question_id), n)
    }

    let totalEarned = 0
    let gradablePoints = 0
    for (const q of questions) {
      const qType = String(q.question_type || '')
      const ans = answerMap.get(String(q.id)) || {}
      const result = scoreQuestion(q, ans)
      if (qType !== 'essay') {
        gradablePoints += Number(q.points) || 0
        totalEarned += result.points_earned != null ? Number(result.points_earned) : 0
      }
      await client.query(
        `
          INSERT INTO quiz_student_answers (
            submission_id, question_id, student_answer, selected_choice_id,
            is_correct, points_earned, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (submission_id, question_id) DO UPDATE SET
            student_answer = COALESCE(EXCLUDED.student_answer, quiz_student_answers.student_answer),
            selected_choice_id = COALESCE(EXCLUDED.selected_choice_id, quiz_student_answers.selected_choice_id),
            is_correct = EXCLUDED.is_correct,
            points_earned = EXCLUDED.points_earned,
            updated_at = NOW()
        `,
        [
          submission.id,
          q.id,
          ans.student_answer,
          Number.isFinite(ans.selected_choice_id) ? ans.selected_choice_id : null,
          result.is_correct,
          result.points_earned,
        ],
      )
    }

    const totalPossible = Number(quiz.total_points) || gradablePoints
    const finalScore = Math.round(totalEarned * 100) / 100

    const { rows } = await client.query(
      `
        UPDATE quiz_submissions
        SET status = 'completed',
            score = $1,
            total_points = $2,
            time_spent_seconds = GREATEST(time_spent_seconds, $3),
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [finalScore, totalPossible, Math.max(0, Number(time_spent_seconds) || 0), submission.id],
    )
    await client.query('COMMIT')
    return { submission: mapSubmissionRow(rows?.[0]) }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function fetchQuizResults(pool, quizId, studentId) {
  const quiz = await fetchStudentQuizById(pool, quizId)
  if (!quiz) return null
  const submission = await fetchSubmissionForStudent(pool, quizId, studentId)
  if (!submission || submission.status !== 'completed') return null
  const saved = await loadSavedAnswers(pool, submission.id)
  const answerByQ = new Map(saved.map((a) => [String(a.question_id), a]))

  const parts = (quiz.parts || []).map((part) => ({
    ...part,
    questions: (part.questions || []).map((q) => {
      const ans = answerByQ.get(String(q.id)) || {}
      const maxPts = Number(q.points) || 0
      const earned = ans.points_earned != null ? Number(ans.points_earned) : 0
      let displayAnswer = ans.student_answer
      if (q.question_type === 'multiple_choice' && ans.selected_choice_id) {
        const choice = (q.choices || []).find((c) => String(c.id) === String(ans.selected_choice_id))
        displayAnswer = choice ? `${choice.choice_label}. ${choice.choice_text}` : displayAnswer
      }
      return {
        ...q,
        student_answer: displayAnswer,
        selected_choice_id: ans.selected_choice_id,
        is_correct: ans.is_correct,
        points_earned: earned,
        points_max: maxPts,
      }
    }),
  }))

  const totalPossible = Number(quiz.total_points) || 0
  const score = submission.score != null ? Number(submission.score) : 0
  const percentage = totalPossible > 0 ? Math.round((score / totalPossible) * 1000) / 10 : 0

  return {
    quiz: { ...quiz, parts },
    submission,
    percentage,
  }
}

function computePercent(score, totalPoints) {
  const s = score != null ? Number(score) : null
  const t = totalPoints != null ? Number(totalPoints) : null
  if (s == null || t == null || t <= 0) return null
  return Math.round((s / t) * 1000) / 10
}

async function studentsHasArchivedAt(pool) {
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'archived_at'
        LIMIT 1
      `,
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

const ALLOWED_VIOLATION_TYPES = new Set(['fullscreen_exit', 'tab_switch'])

function normalizeViolationsPayload(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    const type = String(item?.type || '').trim()
    if (!ALLOWED_VIOLATION_TYPES.has(type)) continue
    const questionNumber = Number(item?.question_number)
    if (!Number.isFinite(questionNumber) || questionNumber <= 0) continue
    out.push({
      type,
      question_number: Math.floor(questionNumber),
    })
  }
  return out
}

function parseViolationsColumn(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Persist client-collected quiz session violations on the student's submission. */
export async function saveQuizViolations(pool, quizId, studentId, violations = []) {
  await ensureQuizSubmissionsSchema(pool)
  const normalized = normalizeViolationsPayload(violations)

  const submission = await fetchSubmissionForStudent(pool, quizId, studentId)
  if (!submission) return { error: 'NOT_FOUND' }

  const status = String(submission.status || '').trim().toLowerCase()
  const submittedAt = submission.submitted_at ? new Date(submission.submitted_at) : null
  const graceMs = 5 * 60 * 1000
  const recentlyCompleted =
    status === 'completed' &&
    submittedAt &&
    !Number.isNaN(submittedAt.getTime()) &&
    Date.now() - submittedAt.getTime() <= graceMs

  if (status !== 'in_progress' && !recentlyCompleted) {
    return { error: 'INVALID_STATE' }
  }

  const existing = parseViolationsColumn(submission.violations)
  if (normalized.length < existing.length) {
    return { error: 'INVALID_STATE', message: 'Violation log is append-only and cannot be shortened.' }
  }

  const serverNow = new Date().toISOString()
  const stamped = normalized.map((item) => ({
    ...item,
    timestamp: serverNow,
  }))

  const merged = [...existing]
  for (const item of stamped) {
    const key = `${item.type}:${item.question_number}:${item.timestamp}`
    const dup = merged.some(
      (v) =>
        v.type === item.type &&
        v.question_number === item.question_number &&
        v.timestamp === item.timestamp,
    )
    if (!dup) merged.push(item)
  }

  await pool.query(
    `
      UPDATE quiz_submissions
      SET violations = $1::jsonb, updated_at = NOW()
      WHERE quiz_id = $2 AND student_id = $3
    `,
    [JSON.stringify(merged), quizId, studentId],
  )

  return { violation_count: merged.length }
}

/** Teacher roster: students in quiz grade (+ optional section) with submission scores. */
export async function fetchQuizRosterScores(pool, quizId, facultyId, { sectionId } = {}) {
  await ensureQuizSubmissionsSchema(pool)
  const quiz = await fetchQuizById(pool, quizId, facultyId)
  if (!quiz) return null

  const gradeNorm = normalizeGradeLevel(quiz.grade_level)
  const secFilter = Number(sectionId)
  const hasSectionFilter = Number.isFinite(secFilter) && secFilter > 0
  const hasArchive = await studentsHasArchivedAt(pool)

  const gradeParams = []
  let gradeWhere = 'FALSE'
  if (gradeNorm) {
    gradeParams.push(gradeNorm)
    gradeWhere = `(
      lower(trim(replace(coalesce(st.grade_level, ''), '  ', ' '))) = $1
      OR lower(trim(replace(coalesce(s.grade_level, ''), '  ', ' '))) = $1
    )`
  }

  const archiveWhere = hasArchive ? ' AND st.archived_at IS NULL' : ''

  const { rows: sectionRows } = await pool.query(
    `
      SELECT DISTINCT s.id, s.section_name, s.grade_level
      FROM students st
      LEFT JOIN sections s ON s.id = st.section_id
      WHERE ${gradeWhere}${archiveWhere}
        AND s.id IS NOT NULL
      ORDER BY s.section_name ASC NULLS LAST, s.id ASC
    `,
    gradeParams,
  )

  const rosterParams = [quizId, ...gradeParams]
  const gradeWhereRoster = gradeNorm
    ? `(
      lower(trim(replace(coalesce(st.grade_level, ''), '  ', ' '))) = $2
      OR lower(trim(replace(coalesce(s.grade_level, ''), '  ', ' '))) = $2
    )`
    : 'FALSE'

  let sectionWhere = ''
  if (hasSectionFilter) {
    rosterParams.push(secFilter)
    sectionWhere = ` AND st.section_id = $${rosterParams.length}`
  }
  const { rows } = await pool.query(
    `
      SELECT
        st.id AS student_id,
        st.first_name,
        st.middle_name,
        st.last_name,
        trim(concat_ws(' ', st.first_name, st.middle_name, st.last_name)) AS student_name,
        st.section_id,
        COALESCE(s.section_name, '') AS section_name,
        sub.status AS submission_status,
        sub.id AS submission_id,
        sub.score,
        sub.total_points AS submission_total_points,
        sub.submitted_at,
        sub.time_spent_seconds,
        sub.violations
      FROM students st
      LEFT JOIN sections s ON s.id = st.section_id
      LEFT JOIN quiz_submissions sub ON sub.quiz_id = $1 AND sub.student_id = st.id
      WHERE ${gradeWhereRoster}${archiveWhere}${sectionWhere}
      ORDER BY st.last_name ASC NULLS LAST, st.first_name ASC NULLS LAST, st.id ASC
    `,
    rosterParams,
  )

  const maxPoints = Number(quiz.total_points) || 0
  let submittedCount = 0
  let inProgressCount = 0
  let notStartedCount = 0
  const completedPercents = []
  const completedScores = []

  const students = (rows || []).map((row) => {
    const status = String(row.submission_status || 'not_started').trim().toLowerCase()
    if (status === 'completed') submittedCount += 1
    else if (status === 'in_progress') inProgressCount += 1
    else notStartedCount += 1

    const score = row.score != null ? Number(row.score) : null
    const totalPts =
      row.submission_total_points != null ? Number(row.submission_total_points) : maxPoints
    const percent = status === 'completed' ? computePercent(score, totalPts) : null
    if (status === 'completed' && score != null) {
      completedScores.push(score)
      if (percent != null) completedPercents.push(percent)
    }

    const violations = parseViolationsColumn(row.violations)

    return {
      student_id: row.student_id != null ? String(row.student_id) : '',
      submission_id: row.submission_id != null ? String(row.submission_id) : null,
      student_name:
        studentDisplayName({
          first_name: row.first_name,
          middle_name: row.middle_name,
          last_name: row.last_name,
        }) ||
        String(row.student_name || '').trim() ||
        `Student #${row.student_id}`,
      section_id: row.section_id != null ? String(row.section_id) : '',
      section_name: String(row.section_name || '').trim() || '—',
      status,
      score,
      total_points: totalPts,
      percent,
      submitted_at:
        row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at ?? null,
      time_spent_seconds: row.time_spent_seconds != null ? Number(row.time_spent_seconds) : 0,
      violations,
      violation_count: violations.length,
    }
  })

  const class_avg_score =
    completedScores.length > 0
      ? Math.round((completedScores.reduce((a, b) => a + b, 0) / completedScores.length) * 100) / 100
      : null
  const class_avg_percent =
    completedPercents.length > 0
      ? Math.round((completedPercents.reduce((a, b) => a + b, 0) / completedPercents.length) * 10) / 10
      : null

  const sections = (sectionRows || []).map((r) => ({
    id: r.id != null ? String(r.id) : '',
    section_name: String(r.section_name || '').trim() || '—',
    grade_level: String(r.grade_level ?? '').trim(),
  }))

  return {
    grade_level: quiz.grade_level || '',
    section_id: hasSectionFilter ? String(secFilter) : null,
    sections,
    summary: {
      total_students: students.length,
      submitted_count: submittedCount,
      in_progress_count: inProgressCount,
      not_started_count: notStartedCount,
      class_avg_score,
      class_avg_percent,
      max_points: maxPoints,
    },
    students,
  }
}

export { hasQuizAccess, countQuestions }
