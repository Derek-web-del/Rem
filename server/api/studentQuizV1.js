import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { ensureQuizzesSchema, hasQuizAccess } from '../lib/quizzesDb.js'
import {
  assertStudentQuizAccess,
  fetchQuizResults,
  fetchStudentQuizDetail,
  fetchStudentQuizTake,
  listStudentQuizzesWithSubmissions,
  saveQuizProgress,
  startQuizSubmission,
  submitQuizSubmission,
  saveQuizViolations,
} from '../lib/quizSubmissionsDb.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'

function parseIdParam(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function checkQuizPasswordAccess(pool, quiz, userId, res) {
  if (quiz?.has_password && !(await hasQuizAccess(pool, userId, quiz.id))) {
    res.status(403).json({
      success: false,
      error: 'PASSWORD_REQUIRED',
      message: 'This quiz is pass code protected.',
      has_password: true,
    })
    return false
  }
  return true
}

export function registerStudentQuizRoutes(router, { requireStudentSession, resolveStudentContext, requireTermsAccepted, auth }) {
  async function studentGate(req, res) {
    const gate = await requireStudentSession(req, res, auth)
    if (!gate) return null
    const pool = getPgPool()
    const studentRow = await resolveStudentContext(pool, gate.user, res)
    if (!studentRow) return null
    if (!requireTermsAccepted(studentRow, res)) return null
    return { gate, pool, studentRow, user: gate.user }
  }

  router.get('/v1/student/quizzes/:id', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const data = await fetchStudentQuizDetail(ctx.pool, quizId, ctx.studentRow)
      if (!data) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      res.json({ success: true, quiz: data.quiz, submission: data.submission, attempt_policy: data.attempt_policy })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/quizzes/:id')
    }
  })

  router.get('/v1/student/quizzes/:id/take', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const quiz = await assertStudentQuizAccess(ctx.pool, ctx.studentRow, quizId)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (!(await checkQuizPasswordAccess(ctx.pool, quiz, ctx.user.id, res))) return
      const data = await fetchStudentQuizTake(ctx.pool, quizId, ctx.studentRow)
      if (data?.error === 'CLOSED') {
        res.status(400).json({
          success: false,
          error: 'CLOSED',
          message: 'Quiz deadline has passed.',
          submission: data.submission ?? null,
        })
        return
      }
      if (data?.completed) {
        res.status(400).json({
          success: false,
          error: 'COMPLETED',
          message: 'Quiz already submitted.',
          attempt_policy: data.attempt_policy,
        })
        return
      }
      if (data?.can_retake) {
        res.json({ success: true, can_retake: true, ...data })
        return
      }
      res.json({ success: true, ...data })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/quizzes/:id/take')
    }
  })

  router.post('/v1/student/quizzes/:id/start', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const quiz = await assertStudentQuizAccess(ctx.pool, ctx.studentRow, quizId)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (!(await checkQuizPasswordAccess(ctx.pool, quiz, ctx.user.id, res))) return
      const result = await startQuizSubmission(ctx.pool, quizId, ctx.studentRow.id)
      if (result?.error === 'CLOSED') {
        res.status(400).json({
          success: false,
          error: 'CLOSED',
          message: 'Quiz deadline has passed.',
        })
        return
      }
      if (result?.error === 'NO_ATTEMPTS_LEFT') {
        res.status(400).json({
          success: false,
          error: 'NO_ATTEMPTS_LEFT',
          message: 'No attempts remaining for this quiz.',
          submission: result.submission,
        })
        return
      }
      if (result?.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      res.json({ success: true, submission: result.submission })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/quizzes/:id/start')
    }
  })

  router.post('/v1/student/quizzes/:id/save-progress', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const quiz = await assertStudentQuizAccess(ctx.pool, ctx.studentRow, quizId)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (!(await checkQuizPasswordAccess(ctx.pool, quiz, ctx.user.id, res))) return
      const result = await saveQuizProgress(ctx.pool, quizId, ctx.studentRow.id, {
        answers: req.body?.answers,
        time_spent_seconds: req.body?.time_spent_seconds,
      })
      if (result.error === 'CLOSED') {
        res.status(400).json({ success: false, error: 'CLOSED', message: 'Quiz deadline has passed.' })
        return
      }
      if (result.error === 'NO_ATTEMPTS_LEFT') {
        res.status(400).json({ success: false, error: 'NO_ATTEMPTS_LEFT', message: 'No attempts remaining for this quiz.' })
        return
      }
      if (result.error === 'COMPLETED') {
        res.status(400).json({ success: false, error: 'COMPLETED', message: 'Quiz already submitted.' })
        return
      }
      res.json({
        success: true,
        submission: result.submission,
        submittedAt: result.submittedAt,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/quizzes/:id/save-progress')
    }
  })

  router.post('/v1/student/quizzes/:id/submit', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const quiz = await assertStudentQuizAccess(ctx.pool, ctx.studentRow, quizId)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (!(await checkQuizPasswordAccess(ctx.pool, quiz, ctx.user.id, res))) return
      const result = await submitQuizSubmission(ctx.pool, quizId, ctx.studentRow.id, {
        answers: req.body?.answers,
        time_spent_seconds: req.body?.time_spent_seconds,
      })
      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (result.error === 'CLOSED') {
        res.status(400).json({ success: false, error: 'CLOSED', message: 'Quiz deadline has passed.' })
        return
      }
      if (result.error === 'NO_ATTEMPTS_LEFT') {
        res.status(400).json({ success: false, error: 'NO_ATTEMPTS_LEFT', message: 'No attempts remaining for this quiz.' })
        return
      }
      if (result.error === 'COMPLETED') {
        res.status(400).json({ success: false, error: 'COMPLETED', message: 'Quiz already submitted.' })
        return
      }
      try {
        const submission = result.submission
        await customActivityLogger.logQuizSubmitted(
          String(ctx.user.id),
          {
            quizId,
            quizTitle: String(quiz?.title || '').trim(),
            score: submission?.score != null ? Number(submission.score) : null,
            totalPoints: submission?.total_points != null ? Number(submission.total_points) : null,
            timeSpent: req.body?.time_spent_seconds != null ? Number(req.body.time_spent_seconds) : 0,
          },
          {
            userEmail: String(ctx.user?.email || '').trim().toLowerCase(),
            userRole: 'student',
          },
        )
      } catch (logErr) {
        console.warn('[studentQuizV1] quiz submit audit log failed:', logErr?.message || logErr)
      }
      res.json({ success: true, submission: result.submission })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/quizzes/:id/submit')
    }
  })

  router.post('/v1/student/quizzes/:id/violations', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const quiz = await assertStudentQuizAccess(ctx.pool, ctx.studentRow, quizId)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (!(await checkQuizPasswordAccess(ctx.pool, quiz, ctx.user.id, res))) return
      const result = await saveQuizViolations(ctx.pool, quizId, ctx.studentRow.id, req.body?.violations)
      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      if (result.error === 'INVALID_STATE') {
        res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Violations can only be saved for an active or recently submitted quiz.',
        })
        return
      }
      res.json({ success: true, violation_count: result.violation_count })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/quizzes/:id/violations')
    }
  })

  router.get('/v1/student/quizzes/:id/results', async (req, res) => {
    try {
      const ctx = await studentGate(req, res)
      if (!ctx) return
      const quizId = parseIdParam(req.params.id)
      if (!quizId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      await ensureQuizzesSchema(ctx.pool)
      const data = await fetchQuizResults(ctx.pool, quizId, ctx.studentRow.id)
      if (!data) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Results not found.' })
        return
      }
      res.json({ success: true, ...data })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/quizzes/:id/results')
    }
  })
}

export { listStudentQuizzesWithSubmissions }
