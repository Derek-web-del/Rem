import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { isAllowedHighSchoolGradeLevel } from '../lib/gradeLevels.js'
import { parseRequiredSemester } from '../lib/semesterValidation.js'
import { hashPasswordBcrypt } from '../password.js'
import {
  createQuiz,
  deleteQuiz,
  ensureQuizzesSchema,
  fetchQuizById,
  fetchStudentQuizById,
  grantQuizAccess,
  hasQuizAccess,
  listQuizzes,
  listStudentQuizzes,
  toggleQuizVisibility,
  updateQuiz,
  verifyQuizPassword,
  normalizeMaxAttempts,
} from '../lib/quizzesDb.js'
import { fetchFacultyRowForSession } from '../lib/facultySession.js'
import { enforceFacultyTermsAccepted } from '../lib/facultyTerms.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { ensureQuizSubmissionsSchema, fetchQuizRosterScores } from '../lib/quizSubmissionsDb.js'
import { isDeadlinePassed } from '../lib/studentWorkPortal.js'
import {
  diffQuizQuestions,
  diffRecords,
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import { buildTargetLabel, quizAuditSnapshot } from '../lib/teacherAuditSnapshots.js'
import { resolveSubjectIdForActivity } from '../lib/activitiesDb.js'
import { validateGradeComponentForWork } from '../lib/subjectGradeCriteriaDb.js'

async function getSessionUser(req, auth) {
  if (!auth?.api?.getSession) return null
  const session = await auth.api.getSession({ headers: req.headers })
  return (
    session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user ?? null
  )
}

async function requireFacultySession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const u = await getSessionUser(req, auth)
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Quizzes API requires teacher/faculty role',
        requiredRole: 'faculty',
      })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    const pool = getPgPool()
    if (!(await enforceFacultyTermsAccepted(req, res, pool, u))) return null
    return { user: u }
  } catch (e) {
    sendSafeServerError(res, e, 'quizzes faculty session gate')
    return null
  }
}

async function requireStudentSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const u = await getSessionUser(req, auth)
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'student') {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Students only.' })
      return null
    }
    return { user: u }
  } catch (e) {
    sendSafeServerError(res, e, 'quizzes student session gate')
    return null
  }
}

async function requireAnySession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const u = await getSessionUser(req, auth)
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    return { user: u, role: String(u.role || '').trim().toLowerCase() }
  } catch (e) {
    sendSafeServerError(res, e, 'quizzes session gate')
    return null
  }
}

function parseIdParam(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function normalizeChoice(choice) {
  return {
    choice_label: String(choice?.choice_label ?? '').trim(),
    choice_text: String(choice?.choice_text ?? '').trim(),
    is_correct: Boolean(choice?.is_correct),
  }
}

function normalizeAnswer(answer) {
  return {
    answer_text: String(answer?.answer_text ?? '').trim(),
    match_pair: answer?.match_pair != null ? String(answer.match_pair).trim() : null,
  }
}

function normalizeQuestion(q) {
  const question_type = String(q?.question_type ?? '').trim()
  return {
    question_text: String(q?.question_text ?? '').trim(),
    question_type,
    points: Number(q?.points) > 0 ? Number(q.points) : 1,
    order_index: Number(q?.order_index) || 0,
    choices: question_type === 'multiple_choice'
      ? (Array.isArray(q?.choices) ? q.choices : []).map(normalizeChoice)
      : [],
    answers: question_type !== 'multiple_choice'
      ? (Array.isArray(q?.answers) ? q.answers : []).map(normalizeAnswer)
      : [],
  }
}

function normalizePart(part, index) {
  const questions = (Array.isArray(part?.questions) ? part.questions : []).map(normalizeQuestion)
  return {
    part_title: String(part?.part_title ?? '').trim(),
    question_type: String(part?.question_type ?? '').trim(),
    no_of_questions: Number(part?.no_of_questions) || questions.length,
    order_index: Number(part?.order_index) || index,
    questions,
  }
}

function normalizePayload(body) {
  const b = body || {}
  const parts = (Array.isArray(b.parts) ? b.parts : []).map(normalizePart)
  let totalPoints = Number(b.total_points)
  if (!Number.isFinite(totalPoints) || totalPoints < 0) {
    totalPoints = 0
    for (const part of parts) {
      for (const q of part.questions) {
        if (Number.isFinite(q.points) && q.points > 0) totalPoints += q.points
      }
    }
  }
  return {
    title: String(b.title ?? '').trim(),
    description: String(b.description ?? '').trim(),
    instructions: String(b.instructions ?? '').trim(),
    activity_type: String(b.activity_type ?? 'Quiz').trim() || 'Quiz',
    subject: String(b.subject ?? b.subject_name ?? '').trim(),
    grade_level: String(b.grade_level ?? b.gradeLevel ?? '').trim(),
    semester: parseRequiredSemester(b.semester),
    duration_mins: b.duration_mins != null && b.duration_mins !== ''
      ? Number(b.duration_mins)
      : null,
    deadline: b.deadline ?? null,
    total_points: Math.round(totalPoints * 100) / 100,
    parts,
    quiz_password_plain: String(b.quiz_password ?? '').trim(),
    password_touched: Boolean(b.password_touched),
    max_attempts: normalizeMaxAttempts(b.max_attempts ?? 1),
    subject_id:
      b.subject_id == null || String(b.subject_id).trim() === '' ? null : Number(b.subject_id),
    grade_component_id:
      b.grade_component_id == null || String(b.grade_component_id).trim() === ''
        ? null
        : Number(b.grade_component_id),
  }
}

async function attachQuizPassword(payload, mode) {
  const next = { ...payload }
  if (mode === 'create') {
    next.quiz_password = next.quiz_password_plain
      ? await hashPasswordBcrypt(next.quiz_password_plain)
      : null
    return next
  }
  if (next.password_touched) {
    next.quiz_password = next.quiz_password_plain
      ? await hashPasswordBcrypt(next.quiz_password_plain)
      : null
  }
  delete next.quiz_password_plain
  delete next.password_touched
  return next
}

function validatePayload(payload) {
  if (!payload.title) return 'Quiz title is required.'
  if (!payload.subject) return 'Please select a Subject.'
  if (!payload.semester) return 'Please select a Semester.'
  if (!payload.deadline) {
    return 'Submission deadline is required.'
  }
  const deadlineDate = new Date(payload.deadline)
  if (Number.isNaN(deadlineDate.getTime())) {
    return 'Submission deadline is required.'
  }
  if (payload.grade_level && !isAllowedHighSchoolGradeLevel(payload.grade_level)) {
    return 'Please select a valid Grade Level.'
  }
  if (payload.max_attempts < 1) {
    return 'Max attempts must be at least 1.'
  }
  return null
}

async function resolveQuizSubjectLink(pool, facultyId, normalized) {
  const bodySubjectId = Number(normalized.subject_id)
  let subjectId =
    Number.isFinite(bodySubjectId) && bodySubjectId > 0 ? bodySubjectId : null
  if (!subjectId) {
    const linked = await resolveSubjectIdForActivity(
      pool,
      facultyId,
      normalized.subject,
      normalized.grade_level,
    )
    subjectId = linked?.subjectId ?? null
  }
  const gradeComponentId =
    normalized.grade_component_id != null &&
    Number.isFinite(Number(normalized.grade_component_id)) &&
    Number(normalized.grade_component_id) > 0
      ? Number(normalized.grade_component_id)
      : null
  return { subjectId, gradeComponentId }
}

async function attachQuizSubjectFields(pool, facultyId, normalized) {
  const { subjectId, gradeComponentId } = await resolveQuizSubjectLink(pool, facultyId, normalized)
  if (subjectId && !gradeComponentId) {
    return { error: 'Grade component is required for subject-linked quizzes.' }
  }
  if (subjectId && gradeComponentId) {
    const check = await validateGradeComponentForWork(pool, subjectId, gradeComponentId, 'quiz')
    if (!check.ok) return { error: check.message }
  }
  return {
    payload: {
      ...normalized,
      subject_id: subjectId,
      grade_component_id: gradeComponentId,
    },
  }
}

export function createQuizzesV1Router(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        success: false,
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Quizzes API requires PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/v1/quizzes', svc503)
    router.get('/v1/quizzes/:id', svc503)
    router.get('/v1/quizzes/:id/roster-scores', svc503)
    router.post('/v1/quizzes', svc503)
    router.put('/v1/quizzes/:id', svc503)
    router.delete('/v1/quizzes/:id', svc503)
    router.patch('/v1/quizzes/:id/toggle-visibility', svc503)
    router.patch('/v1/quizzes/:quizId/submissions/:submissionId/score', svc503)
    router.post('/v1/quizzes/:id/verify-password', svc503)
    return router
  }

  router.get('/v1/quizzes', async (req, res) => {
    try {
      const gate = await requireAnySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      await ensureQuizzesSchema(pool)

      if (gate.role === 'student') {
        const quizzes = await listStudentQuizzes(pool)
        res.json({ success: true, quizzes, data: quizzes })
        return
      }

      if (gate.role !== 'teacher' && gate.role !== 'faculty') {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied.' })
        return
      }

      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const quizzes = await listQuizzes(pool, facultyRow.id)
      res.json({ success: true, quizzes, data: quizzes })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/quizzes')
    }
  })

  router.patch('/v1/quizzes/:id/toggle-visibility', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureQuizzesSchema(pool)
      const is_hidden = await toggleQuizVisibility(pool, id, facultyRow.id)
      if (is_hidden == null) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      await logTeacherAuditEvent(req, {
        event_type: is_hidden ? 'quiz_unpublished' : 'quiz_published',
        module: TEACHER_AUDIT_MODULES.QUIZZES,
        action: is_hidden ? TEACHER_AUDIT_ACTIONS.UNPUBLISH : TEACHER_AUDIT_ACTIONS.PUBLISH,
        user: gate.user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(`Quiz #${id}`),
        old_values: { is_hidden: !is_hidden },
        new_values: { is_hidden },
        changed_fields: ['is_hidden'],
      })
      res.json({ success: true, is_hidden })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/v1/quizzes/:id/toggle-visibility')
    }
  })

  router.post('/v1/quizzes/:id/verify-password', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      await ensureQuizzesSchema(pool)
      const ok = await verifyQuizPassword(pool, id, req.body?.password)
      if (!ok) {
        res.status(401).json({
          success: false,
          error: 'INCORRECT_PASSWORD',
          message: 'Incorrect password. Please try again.',
        })
        return
      }
      await grantQuizAccess(pool, gate.user.id, id)
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/quizzes/:id/verify-password')
    }
  })

  router.get('/v1/quizzes/:id/roster-scores', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      await ensureQuizzesSchema(pool)
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const sectionRaw = req.query?.section_id
      const sectionId =
        sectionRaw != null && String(sectionRaw).trim() !== '' ? Number(sectionRaw) : null
      const roster = await fetchQuizRosterScores(pool, id, facultyRow.id, {
        sectionId: Number.isFinite(sectionId) && sectionId > 0 ? sectionId : null,
      })
      if (!roster) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      res.json({ success: true, roster })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/quizzes/:id/roster-scores')
    }
  })

  router.patch('/v1/quizzes/:quizId/submissions/:submissionId/score', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const quizId = parseIdParam(req.params.quizId)
      const submissionId = parseIdParam(req.params.submissionId)
      if (!quizId || !submissionId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid id.' })
        return
      }
      const pool = getPgPool()
      await ensureQuizzesSchema(pool)
      await ensureQuizSubmissionsSchema(pool)
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const quiz = await fetchQuizById(pool, quizId, facultyRow.id)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      if (isDeadlinePassed(quiz.deadline)) {
        res.status(403).json({
          success: false,
          error: 'SCORE_LOCKED',
          message:
            'Deadline has passed. Score is locked. Contact admin to request a grade correction.',
        })
        return
      }
      const maxScore = Number(quiz.total_points) || 100
      const score = Number(req.body?.score ?? req.body?.value)
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Score must be between 0 and ${maxScore}.`,
        })
        return
      }
      const rounded = Math.round(score * 100) / 100
      const { rows: priorRows } = await pool.query(
        `SELECT score, student_id FROM quiz_submissions WHERE id = $1 AND quiz_id = $2 LIMIT 1`,
        [submissionId, quizId],
      )
      const prior = priorRows?.[0]
      const { rows } = await pool.query(
        `
        UPDATE quiz_submissions qs
        SET score = $1, status = 'completed', total_points = $2, updated_at = NOW()
        FROM quizzes q
        WHERE qs.id = $3 AND qs.quiz_id = $4 AND q.id = qs.quiz_id
          AND q.created_by::text = $5::text
        RETURNING qs.*
        `,
        [rounded, maxScore, submissionId, quizId, String(facultyRow.id)],
      )
      if (!rows?.length) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      const user = gate.user ?? {}
      try {
        await logTeacherAuditEvent(req, {
          event_type: 'grade_score_saved',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: TEACHER_AUDIT_ACTIONS.GRADE,
          user,
          facultyRow,
          target_id: submissionId,
          target_label: buildTargetLabel(quiz.title, `Student ${prior?.student_id ?? ''}`),
          old_values: {
            score: prior?.score ?? null,
            student_id: prior?.student_id ?? null,
            quiz_id: quizId,
          },
          new_values: {
            score: rounded,
            student_id: prior?.student_id ?? null,
            quiz_id: quizId,
          },
          changed_fields: ['score'],
        })
      } catch {
        /* non-fatal */
      }
      res.json({ success: true, submission: rows[0] })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/v1/quizzes/:quizId/submissions/:submissionId/score')
    }
  })

  router.get('/v1/quizzes/:id', async (req, res) => {
    try {
      const gate = await requireAnySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      await ensureQuizzesSchema(pool)

      if (gate.role === 'student') {
        const quiz = await fetchStudentQuizById(pool, id)
        if (!quiz) {
          res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
          return
        }
        if (quiz.has_password && !(await hasQuizAccess(pool, gate.user.id, id))) {
          res.status(403).json({
            success: false,
            error: 'PASSWORD_REQUIRED',
            message: 'This quiz is password protected.',
            has_password: true,
          })
          return
        }
        res.json({ success: true, quiz })
        return
      }

      if (gate.role !== 'teacher' && gate.role !== 'faculty') {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied.' })
        return
      }

      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const quiz = await fetchQuizById(pool, id, facultyRow.id)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      res.json({ success: true, quiz })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/quizzes/:id')
    }
  })

  router.post('/v1/quizzes', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureQuizzesSchema(pool)
      const normalized = normalizePayload(req.body)
      const err = validatePayload(normalized)
      if (err) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: err })
        return
      }
      const linked = await attachQuizSubjectFields(pool, facultyRow.id, normalized)
      if (linked.error) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: linked.error })
        return
      }
      const payload = await attachQuizPassword(linked.payload, 'create')
      delete payload.quiz_password_plain
      delete payload.password_touched
      const quiz = await createQuiz(pool, facultyRow.id, payload)
      try {
        await customActivityLogger.logQuizCreated(
          String(gate.user.id),
          { quizId: quiz?.id, quizTitle: String(quiz?.title || payload?.title || '').trim() },
          { userEmail: String(gate.user?.email || '').trim().toLowerCase(), userRole: 'faculty' },
        )
      } catch {
        /* ignore */
      }
      await logTeacherAuditEvent(req, {
        event_type: 'quiz_created',
        module: TEACHER_AUDIT_MODULES.QUIZZES,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user: gate.user,
        facultyRow,
        target_id: quiz?.id,
        target_label: buildTargetLabel(quiz?.title, quiz?.subject),
        new_values: quizAuditSnapshot(quiz),
      })
      res.status(201).json({ success: true, quiz })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/quizzes')
    }
  })

  router.put('/v1/quizzes/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureQuizzesSchema(pool)
      const normalized = normalizePayload(req.body)
      const err = validatePayload(normalized)
      if (err) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: err })
        return
      }
      const linked = await attachQuizSubjectFields(pool, facultyRow.id, normalized)
      if (linked.error) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: linked.error })
        return
      }
      const payload = await attachQuizPassword(linked.payload, 'update')
      const oldQuiz = await fetchQuizById(pool, id, facultyRow.id)
      const quiz = await updateQuiz(pool, id, facultyRow.id, payload)
      if (!quiz) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      const diff = diffRecords(quizAuditSnapshot(oldQuiz), quizAuditSnapshot(quiz))
      await logTeacherAuditEvent(req, {
        event_type: 'quiz_updated',
        module: TEACHER_AUDIT_MODULES.QUIZZES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user: gate.user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(quiz?.title, quiz?.subject),
        ...diff,
      })
      for (const qEvent of diffQuizQuestions(oldQuiz, quiz)) {
        await logTeacherAuditEvent(req, {
          module: TEACHER_AUDIT_MODULES.QUIZZES,
          action: qEvent.event_type.includes('deleted')
            ? TEACHER_AUDIT_ACTIONS.DELETE
            : qEvent.event_type.includes('added')
              ? TEACHER_AUDIT_ACTIONS.CREATE
              : TEACHER_AUDIT_ACTIONS.EDIT,
          user: gate.user,
          facultyRow,
          target_id: qEvent.target_id || id,
          ...qEvent,
        })
      }
      res.json({ success: true, quiz })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/v1/quizzes/:id')
    }
  })

  router.delete('/v1/quizzes/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })
        return
      }
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureQuizzesSchema(pool)
      const oldQuiz = await fetchQuizById(pool, id, facultyRow.id)
      const deleted = await deleteQuiz(pool, id, facultyRow.id)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Quiz not found.' })
        return
      }
      await logTeacherAuditEvent(req, {
        event_type: 'quiz_deleted',
        module: TEACHER_AUDIT_MODULES.QUIZZES,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user: gate.user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(oldQuiz?.title, oldQuiz?.subject),
        old_values: quizAuditSnapshot(oldQuiz),
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/quizzes/:id')
    }
  })

  return router
}
