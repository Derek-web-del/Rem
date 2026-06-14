const QUIZ_COLUMNS = `
  id, title, description, instructions, activity_type, subject, grade_level,
  branch, semester, duration_mins, deadline, total_points, quiz_password, is_hidden,
  max_attempts, created_by, created_at, updated_at
`

const QUIZ_ACCESS_TTL_MS = 4 * 60 * 60 * 1000

export async function grantQuizAccess(pool, authUserId, quizId, ttlMs = QUIZ_ACCESS_TTL_MS) {
  if (!pool) return
  const uid = String(authUserId || '').trim()
  const qid = Number(quizId)
  if (!uid || !Number.isFinite(qid) || qid <= 0) return
  await ensureQuizzesSchema(pool)
  const expiresAt = new Date(Date.now() + Math.max(60_000, Number(ttlMs) || QUIZ_ACCESS_TTL_MS))
  await pool.query(
    `
      INSERT INTO quiz_password_access (quiz_id, auth_user_id, granted_at, expires_at)
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (quiz_id, auth_user_id) DO UPDATE SET
        granted_at = NOW(),
        expires_at = EXCLUDED.expires_at
    `,
    [qid, uid, expiresAt],
  )
}

export async function hasQuizAccess(pool, authUserId, quizId) {
  if (!pool) return false
  const uid = String(authUserId || '').trim()
  const qid = Number(quizId)
  if (!uid || !Number.isFinite(qid) || qid <= 0) return false
  try {
    await ensureQuizzesSchema(pool)
    const { rows } = await pool.query(
      `
        SELECT 1 FROM quiz_password_access
        WHERE quiz_id = $1 AND auth_user_id = $2 AND expires_at > NOW()
        LIMIT 1
      `,
      [qid, uid],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

export async function revokeQuizPasswordAccess(pool, quizId) {
  if (!pool) return
  const qid = Number(quizId)
  if (!Number.isFinite(qid) || qid <= 0) return
  try {
    await pool.query(`DELETE FROM quiz_password_access WHERE quiz_id = $1`, [qid])
  } catch {
    /* non-fatal */
  }
}

export async function ensureQuizzesSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL DEFAULT '',
      description TEXT,
      instructions TEXT,
      activity_type VARCHAR(64) NOT NULL DEFAULT 'Quiz',
      subject VARCHAR(128),
      grade_level VARCHAR(128),
      branch VARCHAR(128),
      semester SMALLINT,
      duration_mins INTEGER,
      deadline TIMESTAMPTZ,
      total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
      created_by VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_parts (
      id BIGSERIAL PRIMARY KEY,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      part_title VARCHAR(255),
      question_type VARCHAR(64) NOT NULL,
      no_of_questions INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id BIGSERIAL PRIMARY KEY,
      part_id BIGINT NOT NULL REFERENCES quiz_parts(id) ON DELETE CASCADE,
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_text TEXT,
      question_type VARCHAR(64) NOT NULL,
      points NUMERIC(10, 2) NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 0
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_choices (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
      choice_label VARCHAR(8),
      choice_text TEXT,
      is_correct BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
      answer_text TEXT,
      match_pair TEXT
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes (created_by)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_parts_quiz_id ON quiz_parts (quiz_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions (quiz_id)`)
  await pool.query(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS quiz_password VARCHAR(255)`)
  await pool.query(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE`)
  await pool.query(
    `ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1`,
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_password_access (
      quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      auth_user_id VARCHAR(64) NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (quiz_id, auth_user_id)
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_quiz_password_access_expires ON quiz_password_access (expires_at)`,
  )
  const curriculumCols = [
    ['subject_id', 'INT REFERENCES subjects(id) ON DELETE SET NULL'],
    ['module_id', 'BIGINT'],
    ['topic_id', 'BIGINT'],
    ['module_order', 'INT NOT NULL DEFAULT 0'],
    ['status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
  ]
  for (const [name, type] of curriculumCols) {
    await pool.query(`ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS ${name} ${type}`)
  }
  await pool.query(`
    ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS grade_component_id BIGINT
      REFERENCES subject_grade_components(id) ON DELETE SET NULL
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_quizzes_subject_id ON quizzes (subject_id)`)
}

export function normalizeMaxAttempts(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function mapQuizRow(row, extra = {}) {
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : '',
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
    subject_id: row.subject_id != null ? Number(row.subject_id) : null,
    grade_component_id: row.grade_component_id != null ? Number(row.grade_component_id) : null,
    created_by: String(row.created_by ?? '').trim(),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
    ...extra,
  }
}

function mapChoiceRow(row) {
  return {
    id: row.id != null ? String(row.id) : '',
    choice_label: String(row.choice_label ?? '').trim(),
    choice_text: String(row.choice_text ?? '').trim(),
    is_correct: Boolean(row.is_correct),
  }
}

function mapAnswerRow(row) {
  return {
    id: row.id != null ? String(row.id) : '',
    answer_text: String(row.answer_text ?? '').trim(),
    match_pair: row.match_pair != null ? String(row.match_pair).trim() : null,
  }
}

function mapQuestionRow(row, choices, answers) {
  return {
    id: row.id != null ? String(row.id) : '',
    part_id: row.part_id != null ? String(row.part_id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    question_text: String(row.question_text ?? '').trim(),
    question_type: String(row.question_type ?? '').trim(),
    points: row.points != null ? Number(row.points) : 1,
    order_index: row.order_index != null ? Number(row.order_index) : 0,
    choices: choices || [],
    answers: answers || [],
  }
}

function mapPartRow(row, questions) {
  return {
    id: row.id != null ? String(row.id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    part_title: String(row.part_title ?? '').trim(),
    question_type: String(row.question_type ?? '').trim(),
    no_of_questions: row.no_of_questions != null ? Number(row.no_of_questions) : 0,
    order_index: row.order_index != null ? Number(row.order_index) : 0,
    questions: questions || [],
  }
}

export async function listQuizzes(pool, facultyId) {
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
      (
        SELECT COALESCE(array_agg(sub.question_type ORDER BY sub.min_ord), ARRAY[]::varchar[])
        FROM (
          SELECT p.question_type, MIN(p.order_index) AS min_ord
          FROM quiz_parts p
          WHERE p.quiz_id = q.id
          GROUP BY p.question_type
        ) sub
      ) AS part_types
    FROM quizzes q
    WHERE q.created_by::text = $1::text
    ORDER BY q.created_at DESC, q.id DESC
    `,
    [String(facultyId)],
  )
  return (rows || [])
    .map((row) => {
      const partTypes = Array.isArray(row.part_types)
        ? row.part_types.map((t) => String(t ?? '').trim()).filter(Boolean)
        : []
      return mapQuizRow(row, {
        primary_question_type: String(row.primary_question_type ?? '').trim(),
        part_types: partTypes,
      })
    })
    .filter(Boolean)
}

export async function listStudentQuizzes(pool) {
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
      ) AS primary_question_type
    FROM quizzes q
    WHERE COALESCE(q.is_hidden, FALSE) = FALSE
    ORDER BY q.created_at DESC, q.id DESC
    `,
  )
  return (rows || [])
    .map((row) =>
      mapQuizRow(row, {
        primary_question_type: String(row.primary_question_type ?? '').trim(),
      }),
    )
    .filter(Boolean)
}

async function loadQuizNested(pool, quizId) {
  const { rows: partRows } = await pool.query(
    `
    SELECT id, quiz_id, part_title, question_type, no_of_questions, order_index
    FROM quiz_parts
    WHERE quiz_id = $1
    ORDER BY order_index ASC, id ASC
    `,
    [quizId],
  )
  const { rows: questionRows } = await pool.query(
    `
    SELECT id, part_id, quiz_id, question_text, question_type, points, order_index
    FROM quiz_questions
    WHERE quiz_id = $1
    ORDER BY order_index ASC, id ASC
    `,
    [quizId],
  )
  const qIds = questionRows.map((q) => q.id)
  let choiceRows = []
  let answerRows = []
  if (qIds.length) {
    const { rows: c } = await pool.query(
      `SELECT id, question_id, choice_label, choice_text, is_correct
       FROM quiz_choices WHERE question_id = ANY($1::bigint[])
       ORDER BY choice_label ASC, id ASC`,
      [qIds],
    )
    choiceRows = c
    const { rows: a } = await pool.query(
      `SELECT id, question_id, answer_text, match_pair
       FROM quiz_answers WHERE question_id = ANY($1::bigint[])
       ORDER BY id ASC`,
      [qIds],
    )
    answerRows = a
  }

  const choicesByQ = new Map()
  for (const c of choiceRows) {
    const key = String(c.question_id)
    if (!choicesByQ.has(key)) choicesByQ.set(key, [])
    choicesByQ.get(key).push(mapChoiceRow(c))
  }
  const answersByQ = new Map()
  for (const a of answerRows) {
    const key = String(a.question_id)
    if (!answersByQ.has(key)) answersByQ.set(key, [])
    answersByQ.get(key).push(mapAnswerRow(a))
  }

  const questionsByPart = new Map()
  for (const q of questionRows) {
    const key = String(q.part_id)
    if (!questionsByPart.has(key)) questionsByPart.set(key, [])
    questionsByPart.get(key).push(
      mapQuestionRow(q, choicesByQ.get(String(q.id)) || [], answersByQ.get(String(q.id)) || []),
    )
  }

  return (partRows || []).map((p) => mapPartRow(p, questionsByPart.get(String(p.id)) || []))
}

export async function fetchQuizById(pool, id, facultyId) {
  const { rows } = await pool.query(
    `
    SELECT ${QUIZ_COLUMNS}
    FROM quizzes
    WHERE id = $1 AND created_by::text = $2::text
    LIMIT 1
    `,
    [id, String(facultyId)],
  )
  const quiz = mapQuizRow(rows?.[0])
  if (!quiz) return null
  quiz.parts = await loadQuizNested(pool, id)
  return quiz
}

export async function fetchStudentQuizById(pool, id) {
  const { rows } = await pool.query(
    `
    SELECT ${QUIZ_COLUMNS}
    FROM quizzes
    WHERE id = $1 AND COALESCE(is_hidden, FALSE) = FALSE
    LIMIT 1
    `,
    [id],
  )
  const quiz = mapQuizRow(rows?.[0])
  if (!quiz) return null
  quiz.parts = await loadQuizNested(pool, id)
  return quiz
}

export async function fetchQuizPasswordHash(pool, id) {
  const { rows } = await pool.query(
    `SELECT quiz_password FROM quizzes WHERE id = $1 AND COALESCE(is_hidden, FALSE) = FALSE LIMIT 1`,
    [id],
  )
  const hash = rows?.[0]?.quiz_password
  return hash != null ? String(hash).trim() : ''
}

async function insertQuestionTree(client, quizId, partId, question, qIndex) {
  const qType = String(question.question_type || '').trim()
  const { rows: qRows } = await client.query(
    `
    INSERT INTO quiz_questions (part_id, quiz_id, question_text, question_type, points, order_index)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [
      partId,
      quizId,
      String(question.question_text ?? '').trim(),
      qType,
      Number(question.points) > 0 ? Number(question.points) : 1,
      qIndex,
    ],
  )
  const questionId = qRows[0].id

  if (qType === 'multiple_choice') {
    for (const choice of question.choices || []) {
      await client.query(
        `
        INSERT INTO quiz_choices (question_id, choice_label, choice_text, is_correct)
        VALUES ($1, $2, $3, $4)
        `,
        [
          questionId,
          String(choice.choice_label ?? '').trim(),
          String(choice.choice_text ?? '').trim(),
          Boolean(choice.is_correct),
        ],
      )
    }
  } else {
    for (const ans of question.answers || []) {
      await client.query(
        `
        INSERT INTO quiz_answers (question_id, answer_text, match_pair)
        VALUES ($1, $2, $3)
        `,
        [
          questionId,
          String(ans.answer_text ?? '').trim(),
          ans.match_pair != null ? String(ans.match_pair).trim() : null,
        ],
      )
    }
  }
}

async function insertPartsTree(client, quizId, parts) {
  for (let pIndex = 0; pIndex < (parts || []).length; pIndex += 1) {
    const part = parts[pIndex]
    const { rows: pRows } = await client.query(
      `
      INSERT INTO quiz_parts (quiz_id, part_title, question_type, no_of_questions, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [
        quizId,
        String(part.part_title ?? '').trim() || null,
        String(part.question_type ?? '').trim(),
        Number(part.no_of_questions) || (part.questions || []).length,
        pIndex,
      ],
    )
    const partId = pRows[0].id
    const questions = part.questions || []
    for (let qIndex = 0; qIndex < questions.length; qIndex += 1) {
      await insertQuestionTree(client, quizId, partId, questions[qIndex], qIndex)
    }
  }
}

async function deleteQuizTree(client, quizId) {
  await client.query(
    `DELETE FROM quiz_choices WHERE question_id IN (
      SELECT id FROM quiz_questions WHERE quiz_id = $1
    )`,
    [quizId],
  )
  await client.query(
    `DELETE FROM quiz_answers WHERE question_id IN (
      SELECT id FROM quiz_questions WHERE quiz_id = $1
    )`,
    [quizId],
  )
  await client.query(`DELETE FROM quiz_questions WHERE quiz_id = $1`, [quizId])
  await client.query(`DELETE FROM quiz_parts WHERE quiz_id = $1`, [quizId])
}

function parseDeadline(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function createQuiz(pool, facultyId, payload) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const totalPoints = Number(payload.total_points) || 0
    const subjectId =
      payload.subject_id != null && Number.isFinite(Number(payload.subject_id)) && Number(payload.subject_id) > 0
        ? Number(payload.subject_id)
        : null
    const gradeComponentId =
      payload.grade_component_id != null &&
      Number.isFinite(Number(payload.grade_component_id)) &&
      Number(payload.grade_component_id) > 0
        ? Number(payload.grade_component_id)
        : null
    const { rows } = await client.query(
      `
      INSERT INTO quizzes (
        title, description, instructions, activity_type, subject, grade_level,
        semester, duration_mins, deadline, total_points, quiz_password, is_hidden,
        max_attempts, subject_id, grade_component_id, created_by, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING id
      `,
      [
        payload.title,
        payload.description || null,
        payload.instructions || null,
        payload.activity_type || 'Quiz',
        payload.subject || null,
        payload.grade_level || null,
        payload.semester,
        payload.duration_mins,
        parseDeadline(payload.deadline),
        totalPoints,
        payload.quiz_password || null,
        Boolean(payload.is_hidden),
        normalizeMaxAttempts(payload.max_attempts),
        subjectId,
        gradeComponentId,
        String(facultyId),
      ],
    )
    const quizId = rows[0].id
    await insertPartsTree(client, quizId, payload.parts || [])
    await client.query('COMMIT')
    return fetchQuizById(pool, quizId, facultyId)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function updateQuiz(pool, id, facultyId, payload) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await fetchQuizById(pool, id, facultyId)
    if (!existing) {
      await client.query('ROLLBACK')
      return null
    }
    const totalPoints = Number(payload.total_points) || 0
    const subjectId =
      payload.subject_id != null && Number.isFinite(Number(payload.subject_id)) && Number(payload.subject_id) > 0
        ? Number(payload.subject_id)
        : existing.subject_id != null
          ? Number(existing.subject_id)
          : null
    const gradeComponentId =
      payload.grade_component_id != null &&
      Number.isFinite(Number(payload.grade_component_id)) &&
      Number(payload.grade_component_id) > 0
        ? Number(payload.grade_component_id)
        : existing.grade_component_id != null
          ? Number(existing.grade_component_id)
          : null
    const passwordProvided = Object.prototype.hasOwnProperty.call(payload, 'quiz_password')
    if (passwordProvided) {
      await client.query(
        `
        UPDATE quizzes SET
          title = $1, description = $2, instructions = $3, activity_type = $4,
          subject = $5, grade_level = $6, semester = $7,
          duration_mins = $8, deadline = $9, total_points = $10,
          quiz_password = $11, max_attempts = $12,
          subject_id = $13, grade_component_id = $14, updated_at = NOW()
        WHERE id = $15 AND created_by::text = $16::text
        `,
        [
          payload.title,
          payload.description || null,
          payload.instructions || null,
          payload.activity_type || 'Quiz',
          payload.subject || null,
          payload.grade_level || null,
          payload.semester,
          payload.duration_mins,
          parseDeadline(payload.deadline),
          totalPoints,
          payload.quiz_password || null,
          normalizeMaxAttempts(payload.max_attempts),
          subjectId,
          gradeComponentId,
          id,
          String(facultyId),
        ],
      )
      await revokeQuizPasswordAccess(pool, id)
    } else {
      await client.query(
        `
        UPDATE quizzes SET
          title = $1, description = $2, instructions = $3, activity_type = $4,
          subject = $5, grade_level = $6, semester = $7,
          duration_mins = $8, deadline = $9, total_points = $10,
          max_attempts = $11, subject_id = $12, grade_component_id = $13, updated_at = NOW()
        WHERE id = $14 AND created_by::text = $15::text
        `,
        [
          payload.title,
          payload.description || null,
          payload.instructions || null,
          payload.activity_type || 'Quiz',
          payload.subject || null,
          payload.grade_level || null,
          payload.semester,
          payload.duration_mins,
          parseDeadline(payload.deadline),
          totalPoints,
          normalizeMaxAttempts(payload.max_attempts),
          subjectId,
          gradeComponentId,
          id,
          String(facultyId),
        ],
      )
    }
    await deleteQuizTree(client, id)
    await insertPartsTree(client, id, payload.parts || [])
    await client.query('COMMIT')
    return fetchQuizById(pool, id, facultyId)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function deleteQuiz(pool, id, facultyId) {
  const existing = await fetchQuizById(pool, id, facultyId)
  if (!existing) return null
  await pool.query(`DELETE FROM quizzes WHERE id = $1 AND created_by::text = $2::text`, [
    id,
    String(facultyId),
  ])
  return existing
}

export async function toggleQuizVisibility(pool, id, facultyId) {
  const { rows } = await pool.query(
    `
    UPDATE quizzes
    SET is_hidden = NOT COALESCE(is_hidden, FALSE), updated_at = NOW()
    WHERE id = $1 AND created_by::text = $2::text
    RETURNING is_hidden
    `,
    [id, String(facultyId)],
  )
  if (!rows?.[0]) return null
  return Boolean(rows[0].is_hidden)
}

export async function verifyQuizPassword(pool, id, password) {
  const hash = await fetchQuizPasswordHash(pool, id)
  if (!hash) return true
  const { verifyPasswordCompat } = await import('../password.js')
  return verifyPasswordCompat({ hash, password: String(password ?? '') })
}
