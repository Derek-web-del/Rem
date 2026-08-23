import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BETTER_AUTH_SECRET_FOR_TESTS, BETTER_AUTH_RESET_JWKS_FOR_TESTS } from './load-test-env.js'

// better-auth's `isTest()` is a module-level constant frozen at first import of
// `@better-auth/core/env` — it reads NODE_ENV once and never re-checks. Set it here,
// before ANY test in this file dynamically imports `server/index.js` (matches the
// pattern used by tests/security-incidents.test.js and tests/portal-terms-reset.test.js).
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeWithPg = PG_TEST_URL ? describe : describe.skip

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getSetCookie(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
  const v = res.headers.get('set-cookie')
  return v ? [v] : []
}

function cookieHeaderFromSetCookies(setCookies) {
  return setCookies
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ')
}

async function postJson(url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const res = await fetch(url, { method: opts.method || 'POST', headers, body: JSON.stringify(body ?? {}) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text, setCookie: getSetCookie(res) }
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, { method: 'GET', headers: opts.headers || {} })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

async function promoteUserToStudent(pool, email) {
  await pool.query('UPDATE "user" SET role = $1 WHERE LOWER(email) = LOWER($2)', ['student', email])
}

/** Sign up a bare Better Auth user, promote to student, and link a students row. */
async function createStudent(base, pool, { gradeLevel }) {
  const email = `${uniq('student')}@example.com`
  const password = 'Str0ng#Pass!'
  const signUp = await postJson(`${base}/api/auth/sign-up/email`, {
    email,
    password,
    name: 'Test Student',
  })
  assert.ok(signUp.res.status === 200 || signUp.res.status === 201, signUp.text)
  const authUserId = signUp.json?.user?.id
  assert.ok(authUserId, 'expected auth user id from sign-up response')

  await promoteUserToStudent(pool, email)

  const { rows } = await pool.query(
    `
      INSERT INTO students (
        first_name, middle_name, last_name, email, contact_no, address, dob,
        parent_contact, parent_email, enrollment_no, roll_no,
        grade_level, semester, login_id, password_hash, auth_user_id,
        terms_accepted
      )
      VALUES ($1, '', $2, $3, '09171234567', 'Test Address', '2010-01-01',
        '09179876543', 'parent@example.com', $4, '1',
        $5, '1st Semester', $6, 'x', $7, true)
      RETURNING id
    `,
    ['Test', 'Student', email, uniq('en'), gradeLevel, uniq('login'), authUserId],
  )
  const studentId = rows[0].id

  const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
  assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
  const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)
  assert.ok(cookieHeader, 'expected a session cookie for the student')

  return { email, authUserId, studentId, cookieHeader }
}

async function insertQuiz(pool, { title, gradeLevel, createdBy }) {
  const { rows } = await pool.query(
    `
      INSERT INTO quizzes (title, activity_type, grade_level, semester, total_points, is_hidden, max_attempts, created_by)
      VALUES ($1, 'Quiz', $2, 1, 10, false, 1, $3)
      RETURNING id
    `,
    [title, gradeLevel, createdBy],
  )
  return rows[0].id
}

/** Attach one multiple-choice question (with a marked-correct choice) to a quiz. */
async function attachAnsweredQuestion(pool, quizId) {
  const { rows: partRows } = await pool.query(
    `
      INSERT INTO quiz_parts (quiz_id, part_title, question_type, no_of_questions, order_index)
      VALUES ($1, 'Part 1', 'multiple_choice', 1, 0)
      RETURNING id
    `,
    [quizId],
  )
  const partId = partRows[0].id
  const { rows: qRows } = await pool.query(
    `
      INSERT INTO quiz_questions (part_id, quiz_id, question_text, question_type, points, order_index)
      VALUES ($1, $2, 'What is 2 + 2?', 'multiple_choice', 10, 0)
      RETURNING id
    `,
    [partId, quizId],
  )
  const questionId = qRows[0].id
  await pool.query(
    `
      INSERT INTO quiz_choices (question_id, choice_label, choice_text, is_correct)
      VALUES ($1, 'A', '3', false), ($1, 'B', '4', true)
    `,
    [questionId],
  )
}

function findChoice(quiz, choiceText) {
  for (const part of quiz.parts || []) {
    for (const q of part.questions || []) {
      const match = (q.choices || []).find((c) => c.choice_text === choiceText)
      if (match) return match
    }
  }
  return null
}

describeWithPg('GET /api/v1/quizzes[/:id] student scoping (regression for fix #1)', () => {
  it('hides other-grade quizzes, strips answer keys pre-completion, and reveals them after', async (t) => {
    Object.assign(process.env, {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
      BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_FOR_TESTS,
      BETTER_AUTH_RESET_JWKS: BETTER_AUTH_RESET_JWKS_FOR_TESTS,
      AUTH_DISABLE_SIGNUP: 'false',
      AUTH_MODULE_INSTANCE: `quiz-student-scoping-${Date.now()}`,
      RATE_LIMIT_MAX_SIGNIN: '1000',
    })
    const { createApp } = await import('../server/index.js')
    const { getPgPool } = await import('../server/pgPool.js')
    const { ensureQuizzesSchema } = await import('../server/lib/quizzesDb.js')
    const { ensureQuizSubmissionsSchema } = await import('../server/lib/quizSubmissionsDb.js')

    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`
    const pool = getPgPool()

    let grade8, grade10, quizGrade8Id, quizGrade10Id
    t.after(async () => {
      try {
        if (quizGrade8Id) await pool.query('DELETE FROM quizzes WHERE id = $1', [quizGrade8Id])
        if (quizGrade10Id) await pool.query('DELETE FROM quizzes WHERE id = $1', [quizGrade10Id])
        if (grade8?.email) await pool.query('DELETE FROM students WHERE lower(email) = lower($1)', [grade8.email])
        if (grade10?.email) await pool.query('DELETE FROM students WHERE lower(email) = lower($1)', [grade10.email])
        if (grade8?.email) await pool.query('DELETE FROM "user" WHERE lower(email) = lower($1)', [grade8.email])
        if (grade10?.email) await pool.query('DELETE FROM "user" WHERE lower(email) = lower($1)', [grade10.email])
      } catch {
        /* best effort cleanup */
      }
      await teardownTestApp(server, app)
    })

    await ensureQuizzesSchema(pool)
    await ensureQuizSubmissionsSchema(pool)

    grade8 = await createStudent(base, pool, { gradeLevel: 'Grade 8' })
    grade10 = await createStudent(base, pool, { gradeLevel: 'Grade 10' })

    quizGrade8Id = await insertQuiz(pool, { title: 'Grade 8 Math Quiz', gradeLevel: 'Grade 8', createdBy: uniq('faculty') })
    await attachAnsweredQuestion(pool, quizGrade8Id)
    quizGrade10Id = await insertQuiz(pool, { title: 'Grade 10 Math Quiz', gradeLevel: 'Grade 10', createdBy: uniq('faculty') })

    // --- List scoping: each student sees only their own grade's quiz ---
    const grade8List = await getJson(`${base}/api/v1/quizzes`, { headers: { Cookie: grade8.cookieHeader } })
    assert.equal(grade8List.res.status, 200)
    const grade8ListIds = (grade8List.json?.quizzes || []).map((q) => q.id)
    assert.ok(grade8ListIds.includes(String(quizGrade8Id)), 'grade 8 student should see the grade 8 quiz')
    assert.ok(!grade8ListIds.includes(String(quizGrade10Id)), 'grade 8 student should NOT see the grade 10 quiz')

    const grade10List = await getJson(`${base}/api/v1/quizzes`, { headers: { Cookie: grade10.cookieHeader } })
    assert.equal(grade10List.res.status, 200)
    const grade10ListIds = (grade10List.json?.quizzes || []).map((q) => q.id)
    assert.ok(grade10ListIds.includes(String(quizGrade10Id)), 'grade 10 student should see the grade 10 quiz')
    assert.ok(!grade10ListIds.includes(String(quizGrade8Id)), 'grade 10 student should NOT see the grade 8 quiz')

    // --- Detail scoping: fetching another grade's quiz by id must 404, not leak it ---
    const crossGradeFetch = await getJson(`${base}/api/v1/quizzes/${quizGrade10Id}`, {
      headers: { Cookie: grade8.cookieHeader },
    })
    assert.equal(crossGradeFetch.res.status, 404, 'grade 8 student must not be able to fetch the grade 10 quiz by id')

    // --- Answer-key stripping: own-grade quiz, no completed attempt yet ---
    const ownGradeFetch = await getJson(`${base}/api/v1/quizzes/${quizGrade8Id}`, {
      headers: { Cookie: grade8.cookieHeader },
    })
    assert.equal(ownGradeFetch.res.status, 200)
    const correctChoiceBefore = findChoice(ownGradeFetch.json?.quiz, '4')
    assert.ok(correctChoiceBefore, 'expected the "4" choice to be present in the response')
    assert.equal(
      correctChoiceBefore.is_correct,
      undefined,
      'is_correct must be stripped before the student has completed an attempt',
    )

    // --- Simulate a completed attempt, then confirm the answer key becomes visible ---
    await pool.query(
      `
        INSERT INTO quiz_submissions (quiz_id, student_id, status, score, total_points, started_at, submitted_at, attempt_number)
        VALUES ($1, $2, 'completed', 10, 10, NOW(), NOW(), 1)
      `,
      [quizGrade8Id, grade8.studentId],
    )

    const afterCompletionFetch = await getJson(`${base}/api/v1/quizzes/${quizGrade8Id}`, {
      headers: { Cookie: grade8.cookieHeader },
    })
    assert.equal(afterCompletionFetch.res.status, 200)
    const correctChoiceAfter = findChoice(afterCompletionFetch.json?.quiz, '4')
    assert.ok(correctChoiceAfter, 'expected the "4" choice to be present in the response')
    assert.equal(
      correctChoiceAfter.is_correct,
      true,
      'is_correct should be visible once the student has completed the attempt',
    )
  })
})
