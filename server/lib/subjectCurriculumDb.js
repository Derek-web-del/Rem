import { ensureAssignmentsSchema } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { ensureQuizzesSchema } from './quizzesDb.js'
import { ensureFacultyStudyMaterialsSchema } from './facultyStudyMaterialsDb.js'
import { ensureSubjectGradeCriteriaSchema } from './subjectGradeCriteriaDb.js'
import { studentDisplayName } from './studentPiiCrypto.js'
import { normalizeGradeLevel } from './assignmentsDb.js'
import { syllabusDisplayFileName } from './syllabusResponse.js'

const ITEM_TABLES = {
  assignment: { table: 'assignments', idCol: 'id' },
  activity: { table: 'activities', idCol: 'id' },
  quiz: { table: 'quizzes', idCol: 'id' },
  material: { table: 'study_materials', idCol: 'id' },
}

export async function ensureSubjectCurriculumSchema(pool) {
  await ensureAssignmentsSchema(pool)
  await ensureActivitiesSchema(pool)
  await ensureQuizzesSchema(pool)
  await ensureFacultyStudyMaterialsSchema(pool)
  await ensureSubjectGradeCriteriaSchema(pool)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_modules (
      id BIGSERIAL PRIMARY KEY,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      module_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_topics (
      id BIGSERIAL PRIMARY KEY,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      topic_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_module_subtopics (
      id BIGSERIAL PRIMARY KEY,
      module_id BIGINT NOT NULL REFERENCES subject_modules(id) ON DELETE CASCADE,
      label VARCHAR(255) NOT NULL,
      subtopic_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const itemCols = [
    ['study_materials', 'module_id', 'BIGINT REFERENCES subject_modules(id) ON DELETE SET NULL'],
    ['study_materials', 'topic_id', 'BIGINT REFERENCES subject_topics(id) ON DELETE SET NULL'],
    ['study_materials', 'subtopic_label', 'VARCHAR(100)'],
    ['study_materials', 'module_order', 'INT NOT NULL DEFAULT 0'],
    ["study_materials", 'status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
    ['assignments', 'module_id', 'BIGINT REFERENCES subject_modules(id) ON DELETE SET NULL'],
    ['assignments', 'topic_id', 'BIGINT REFERENCES subject_topics(id) ON DELETE SET NULL'],
    ['assignments', 'module_order', 'INT NOT NULL DEFAULT 0'],
    ["assignments", 'status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
    ['activities', 'module_id', 'BIGINT REFERENCES subject_modules(id) ON DELETE SET NULL'],
    ['activities', 'topic_id', 'BIGINT REFERENCES subject_topics(id) ON DELETE SET NULL'],
    ['activities', 'module_order', 'INT NOT NULL DEFAULT 0'],
    ["activities", 'status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
    ['quizzes', 'subject_id', 'INT REFERENCES subjects(id) ON DELETE SET NULL'],
    ['quizzes', 'module_id', 'BIGINT REFERENCES subject_modules(id) ON DELETE SET NULL'],
    ['quizzes', 'topic_id', 'BIGINT REFERENCES subject_topics(id) ON DELETE SET NULL'],
    ['quizzes', 'module_order', 'INT NOT NULL DEFAULT 0'],
    ["quizzes", 'status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
  ]
  for (const [tbl, col, typ] of itemCols) {
    await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${typ}`)
  }

  const lessonCols = [
    ['topic_id', 'BIGINT REFERENCES subject_topics(id) ON DELETE SET NULL'],
    ['description', 'TEXT'],
    ['file_path', 'VARCHAR(512)'],
    ['link_url', 'VARCHAR(512)'],
    ['lesson_number', 'INT NOT NULL DEFAULT 0'],
  ]
  for (const [col, typ] of lessonCols) {
    await pool.query(`ALTER TABLE subject_modules ADD COLUMN IF NOT EXISTS ${col} ${typ}`)
  }
}

export async function fetchSubjectRow(pool, subjectId) {
  const { rows } = await pool.query(
    `SELECT id, subject_name, subject_code, grade_level, faculty_id, syllabus_pdf FROM subjects WHERE id = $1 LIMIT 1`,
    [Number(subjectId)],
  )
  return rows[0] || null
}

export async function countEnrolledStudents(pool, gradeLevel) {
  const norm = normalizeGradeLevel(gradeLevel)
  if (!norm) return 0
  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS cnt FROM students st
    WHERE lower(trim(replace(coalesce(st.grade_level, ''), '  ', ' '))) = $1
    `,
    [norm],
  )
  return Number(rows[0]?.cnt ?? 0)
}

async function submissionCount(pool, table, itemId) {
  const subTable =
    table === 'assignments'
      ? 'assignment_submissions'
      : table === 'activities'
        ? 'activity_submissions'
        : null
  if (!subTable) return 0
  const col = table === 'assignments' ? 'assignment_id' : 'activity_id'
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM ${subTable} WHERE ${col} = $1 AND status = 'submitted'`,
    [Number(itemId)],
  )
  return Number(rows[0]?.cnt ?? 0)
}

async function quizCompletedCount(pool, quizId) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM quiz_submissions WHERE quiz_id = $1 AND status IN ('submitted', 'graded')`,
      [Number(quizId)],
    )
    return Number(rows[0]?.cnt ?? 0)
  } catch {
    return 0
  }
}

function mapCurriculumItem(row, type, enrolled) {
  const status = String(row.status || 'published').toLowerCase()
  const isQuiz = type === 'quiz'
  const submitted = isQuiz ? row.completed_count : row.submitted_count
  return {
    item_type: type,
    id: String(row.id),
    title: String(row.title || row.material_name || row.unit_name || 'Untitled').trim(),
    status,
    is_published: status === 'published' && !row.is_hidden,
    module_id: row.module_id != null ? String(row.module_id) : null,
    topic_id: row.topic_id != null ? String(row.topic_id) : null,
    module_order: Number(row.module_order ?? 0),
    subtopic_label: row.subtopic_label ? String(row.subtopic_label) : null,
    total_score: row.total_score != null ? Number(row.total_score) : row.total_points != null ? Number(row.total_points) : null,
    submission_deadline: row.submission_deadline ?? row.deadline ?? null,
    created_at: row.created_at ?? null,
    submitted_count: submitted ?? 0,
    enrolled_count: enrolled,
    file_type: row.file_type ? String(row.file_type) : null,
  }
}

function inferSyllabusFileType(syllabusRaw) {
  return 'application/pdf'
}

function buildSyllabusClassworkItem(subjectRow) {
  const syllabusRaw = String(subjectRow?.syllabus_pdf ?? '').trim()
  if (!syllabusRaw) return null
  const sid = String(subjectRow.id)
  const code = String(subjectRow.subject_code ?? '').trim()
  const fileName = syllabusDisplayFileName(syllabusRaw, code)
  return {
    item_type: 'syllabus',
    id: `syllabus-${sid}`,
    title: fileName.replace(/\.[^.]+$/, '') || 'Syllabus',
    status: 'published',
    is_published: true,
    is_syllabus: true,
    is_locked: true,
    module_id: null,
    topic_id: null,
    module_order: -1,
    subtopic_label: null,
    total_score: null,
    submission_deadline: null,
    created_at: null,
    submitted_count: 0,
    enrolled_count: 0,
    file_type: inferSyllabusFileType(syllabusRaw),
    file_name: fileName,
  }
}

function mapLessonRow(row, idx = 0) {
  return {
    item_type: 'lesson',
    id: String(row.id),
    title: String(row.title || 'Untitled Lesson').trim(),
    description: row.description != null ? String(row.description) : '',
    file_path: row.file_path ? String(row.file_path) : null,
    link_url: row.link_url ? String(row.link_url) : null,
    lesson_number: Number(row.lesson_number ?? idx + 1),
    module_order: Number(row.module_order ?? 0),
    topic_id: row.topic_id != null ? String(row.topic_id) : null,
    created_at: row.created_at ?? null,
  }
}

function splitItemsByType(items) {
  return {
    assignments: items.filter((i) => i.item_type === 'assignment'),
    activities: items.filter((i) => i.item_type === 'activity'),
    quizzes: items.filter((i) => i.item_type === 'quiz'),
    materials: items.filter((i) => i.item_type === 'material'),
  }
}

async function fetchItemsForSubject(pool, subjectId, subjectRow, enrolled, { publishedOnly = false } = {}) {
  const sid = Number(subjectId)
  const gradeNorm = normalizeGradeLevel(subjectRow?.grade_level)
  const subjectName = String(subjectRow?.subject_name || '').trim()

  const [materials, assignments, activities, quizzes] = await Promise.all([
    pool.query(
      `SELECT id, material_name, unit_name, module_id, topic_id, subtopic_label, module_order, status, file_type, created_at
       FROM study_materials WHERE subject_id = $1 ORDER BY module_order, id`,
      [sid],
    ),
    pool.query(
      `SELECT id, title, module_id, topic_id, module_order, status, total_score, submission_deadline, created_at
       FROM assignments WHERE subject_id = $1 ORDER BY module_order, id`,
      [sid],
    ),
    pool.query(
      `SELECT id, title, module_id, topic_id, module_order, status, total_score, submission_deadline, created_at
       FROM activities WHERE subject_id = $1 ORDER BY module_order, id`,
      [sid],
    ),
    pool.query(
      `SELECT id, title, module_id, topic_id, module_order, status, is_hidden, total_points, deadline, created_at
       FROM quizzes
       WHERE subject_id = $1
          OR (subject_id IS NULL AND lower(trim(coalesce(subject, ''))) = lower(trim($2)) AND lower(trim(coalesce(grade_level, ''))) = $3)
       ORDER BY module_order, id`,
      [sid, subjectName, gradeNorm],
    ),
  ])

  const items = []
  for (const r of materials.rows || []) {
    const row = { ...r, title: r.material_name || r.unit_name, submitted_count: 0 }
    items.push(mapCurriculumItem(row, 'material', enrolled))
  }
  for (const r of assignments.rows || []) {
    const sc = await submissionCount(pool, 'assignments', r.id)
    items.push(mapCurriculumItem({ ...r, submitted_count: sc }, 'assignment', enrolled))
  }
  for (const r of activities.rows || []) {
    const sc = await submissionCount(pool, 'activities', r.id)
    items.push(mapCurriculumItem({ ...r, submitted_count: sc }, 'activity', enrolled))
  }
  for (const r of quizzes.rows || []) {
    const cc = await quizCompletedCount(pool, r.id)
    items.push(mapCurriculumItem({ ...r, completed_count: cc }, 'quiz', enrolled))
  }
  if (publishedOnly) {
    return items.filter((it) => it.is_published)
  }
  return items
}

async function fetchLessonsForSubject(pool, subjectId) {
  const { rows } = await pool.query(
    `
    SELECT id, subject_id, topic_id, title, description, file_path, link_url, lesson_number, module_order, created_at
    FROM subject_modules
    WHERE subject_id = $1
    ORDER BY topic_id NULLS LAST, lesson_number ASC, module_order ASC, id ASC
    `,
    [Number(subjectId)],
  )
  return (rows || []).map((r, idx) => mapLessonRow(r, idx))
}

export async function fetchSubjectLesson(pool, subjectId, lessonId) {
  await ensureSubjectCurriculumSchema(pool)
  const { rows } = await pool.query(
    `
    SELECT id, subject_id, topic_id, title, description, file_path, link_url, lesson_number, module_order, created_at
    FROM subject_modules
    WHERE id = $1 AND subject_id = $2
    LIMIT 1
    `,
    [Number(lessonId), Number(subjectId)],
  )
  return rows[0] ? mapLessonRow(rows[0]) : null
}

export async function fetchSubjectModulesWithItems(pool, subjectId, { publishedOnly = false } = {}) {
  await ensureSubjectCurriculumSchema(pool)
  const subjectRow = await fetchSubjectRow(pool, subjectId)
  if (!subjectRow) return null
  const enrolled = await countEnrolledStudents(pool, subjectRow.grade_level)
  const allItems = await fetchItemsForSubject(pool, subjectId, subjectRow, enrolled, { publishedOnly })

  const { rows: modules } = await pool.query(
    `SELECT * FROM subject_modules WHERE subject_id = $1 ORDER BY module_order ASC, id ASC`,
    [Number(subjectId)],
  )
  const { rows: subtopics } = await pool.query(
    `
    SELECT st.* FROM subject_module_subtopics st
    INNER JOIN subject_modules m ON m.id = st.module_id
    WHERE m.subject_id = $1
    ORDER BY st.subtopic_order ASC, st.id ASC
    `,
    [Number(subjectId)],
  )

  return (modules || []).map((mod, idx) => {
    const modId = String(mod.id)
    const modItems = allItems.filter((it) => it.module_id === modId)
    const modSubtopics = (subtopics || [])
      .filter((s) => String(s.module_id) === modId)
      .map((s) => ({
        id: String(s.id),
        label: String(s.label),
        subtopic_order: Number(s.subtopic_order ?? 0),
      }))
    return {
      id: modId,
      title: String(mod.title),
      module_order: Number(mod.module_order ?? idx),
      item_count: modItems.length,
      subtopics: modSubtopics,
      items: modItems.sort((a, b) => a.module_order - b.module_order),
    }
  })
}

export async function fetchSubjectTopicsWithItems(pool, subjectId, { publishedOnly = false } = {}) {
  await ensureSubjectCurriculumSchema(pool)
  const subjectRow = await fetchSubjectRow(pool, subjectId)
  if (!subjectRow) return null
  const enrolled = await countEnrolledStudents(pool, subjectRow.grade_level)
  const allItems = await fetchItemsForSubject(pool, subjectId, subjectRow, enrolled, { publishedOnly })
  const allLessons = await fetchLessonsForSubject(pool, subjectId)

  const { rows: topics } = await pool.query(
    `SELECT * FROM subject_topics WHERE subject_id = $1 ORDER BY topic_order ASC, id ASC`,
    [Number(subjectId)],
  )

  const grouped = (topics || []).map((top, idx) => {
    const tid = String(top.id)
    const topicItems = allItems.filter((it) => it.topic_id === tid)
    const lessons = allLessons.filter((l) => l.topic_id === tid)
    const byType = splitItemsByType(topicItems)
    return {
      id: tid,
      title: String(top.title),
      topic_order: Number(top.topic_order ?? idx),
      lessons,
      items: topicItems.sort((a, b) => a.module_order - b.module_order),
      ...byType,
    }
  })

  const uncategorizedItems = allItems.filter((it) => !it.topic_id)
  const uncategorizedLessons = allLessons.filter((l) => !l.topic_id)
  const syllabusItem = buildSyllabusClassworkItem(subjectRow)
  if (syllabusItem) {
    uncategorizedItems.unshift(syllabusItem)
  }
  if (uncategorizedItems.length || uncategorizedLessons.length) {
    const byType = splitItemsByType(uncategorizedItems)
    grouped.unshift({
      id: 'uncategorized',
      title: 'Unassigned',
      topic_order: -1,
      lessons: uncategorizedLessons,
      items: uncategorizedItems.sort((a, b) => {
        if (a.is_syllabus) return -1
        if (b.is_syllabus) return 1
        return a.module_order - b.module_order
      }),
      ...byType,
    })
  }
  return grouped
}

/** Map API/form topic_id to null (uncategorized) or a numeric id string. */
export function normalizeTopicIdInput(topicRaw) {
  if (
    topicRaw === '' ||
    topicRaw == null ||
    topicRaw === 'null' ||
    topicRaw === 'undefined' ||
    topicRaw === 'uncategorized'
  ) {
    return null
  }
  return topicRaw
}

/**
 * Resolve topic_id for subject_modules FK (subject_topics.id).
 * @returns {{ ok: true, topicId: number | null } | { ok: false, code: string }}
 */
export async function resolveTopicIdForSubject(pool, subjectId, topicRaw) {
  const normalized = normalizeTopicIdInput(topicRaw)
  if (normalized === null) {
    return { ok: true, topicId: null }
  }
  const tid = Number(normalized)
  if (!Number.isFinite(tid) || tid <= 0) {
    return { ok: false, code: 'INVALID_TOPIC_ID' }
  }
  const sid = Number(subjectId)
  const { rows } = await pool.query(
    `SELECT id FROM subject_topics WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [tid, sid],
  )
  if (!rows[0]) {
    return { ok: false, code: 'TOPIC_NOT_FOUND' }
  }
  return { ok: true, topicId: tid }
}

export async function reorderSubjectTopics(pool, subjectId, topicIds) {
  await ensureSubjectCurriculumSchema(pool)
  const sid = Number(subjectId)
  if (!Array.isArray(topicIds) || !topicIds.length) {
    return { ok: false, message: 'topic_ids array is required.' }
  }
  const ids = topicIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) return { ok: false, message: 'No valid topic ids.' }
  const { rows } = await pool.query(
    `SELECT id FROM subject_topics WHERE subject_id = $1 AND id = ANY($2::bigint[])`,
    [sid, ids],
  )
  if ((rows || []).length !== ids.length) {
    return { ok: false, message: 'One or more topics not found for this subject.' }
  }
  for (let i = 0; i < ids.length; i++) {
    await pool.query(`UPDATE subject_topics SET topic_order = $1 WHERE id = $2 AND subject_id = $3`, [
      i,
      ids[i],
      sid,
    ])
  }
  return { ok: true }
}

export async function moveSubjectLesson(pool, subjectId, lessonId, { topic_id, module_order }) {
  return updateSubjectLesson(pool, subjectId, lessonId, { topic_id, module_order })
}

export async function fetchSubjectStream(pool, subjectId, { publishedOnly = false } = {}) {
  return fetchSubjectTopicsWithItems(pool, subjectId, { publishedOnly })
}

export async function createSubjectModule(pool, subjectId, { title, module_order }) {
  await ensureSubjectCurriculumSchema(pool)
  const { rows } = await pool.query(
    `INSERT INTO subject_modules (subject_id, title, module_order) VALUES ($1, $2, $3) RETURNING *`,
    [Number(subjectId), String(title).trim(), Number(module_order ?? 0)],
  )
  return rows[0]
}

export async function updateSubjectModule(pool, subjectId, moduleId, { title, module_order }) {
  const sets = []
  const params = []
  let n = 1
  if (title != null) {
    sets.push(`title = $${n++}`)
    params.push(String(title).trim())
  }
  if (module_order != null) {
    sets.push(`module_order = $${n++}`)
    params.push(Number(module_order))
  }
  if (!sets.length) return null
  params.push(Number(moduleId), Number(subjectId))
  const { rows } = await pool.query(
    `UPDATE subject_modules SET ${sets.join(', ')} WHERE id = $${n++} AND subject_id = $${n} RETURNING *`,
    params,
  )
  return rows[0] || null
}

export async function deleteSubjectModule(pool, subjectId, moduleId) {
  const mid = Number(moduleId)
  await pool.query(`UPDATE study_materials SET module_id = NULL WHERE module_id = $1`, [mid])
  await pool.query(`UPDATE assignments SET module_id = NULL WHERE module_id = $1`, [mid])
  await pool.query(`UPDATE activities SET module_id = NULL WHERE module_id = $1`, [mid])
  await pool.query(`UPDATE quizzes SET module_id = NULL WHERE module_id = $1`, [mid])
  const r = await pool.query(`DELETE FROM subject_modules WHERE id = $1 AND subject_id = $2`, [
    mid,
    Number(subjectId),
  ])
  return Number(r.rowCount ?? 0) > 0
}

export async function createSubjectTopic(pool, subjectId, { title, topic_order }) {
  await ensureSubjectCurriculumSchema(pool)
  const { rows } = await pool.query(
    `INSERT INTO subject_topics (subject_id, title, topic_order) VALUES ($1, $2, $3) RETURNING *`,
    [Number(subjectId), String(title).trim(), Number(topic_order ?? 0)],
  )
  return rows[0]
}

export async function updateSubjectTopic(pool, subjectId, topicId, { title, topic_order }) {
  const sets = []
  const params = []
  let n = 1
  if (title != null) {
    sets.push(`title = $${n++}`)
    params.push(String(title).trim())
  }
  if (topic_order != null) {
    sets.push(`topic_order = $${n++}`)
    params.push(Number(topic_order))
  }
  if (!sets.length) return null
  params.push(Number(topicId), Number(subjectId))
  const { rows } = await pool.query(
    `UPDATE subject_topics SET ${sets.join(', ')} WHERE id = $${n++} AND subject_id = $${n} RETURNING *`,
    params,
  )
  return rows[0] || null
}

export async function createSubjectLesson(pool, subjectId, topicId, payload = {}) {
  await ensureSubjectCurriculumSchema(pool)
  const sid = Number(subjectId)
  const topicSource = topicId ?? payload.topic_id
  const resolved = await resolveTopicIdForSubject(pool, sid, topicSource)
  if (!resolved.ok) return null
  const tid = resolved.topicId
  const numQuery = tid != null
    ? `SELECT COALESCE(MAX(lesson_number), 0)::int AS max_num FROM subject_modules WHERE topic_id = $1`
    : `SELECT COALESCE(MAX(lesson_number), 0)::int AS max_num FROM subject_modules WHERE subject_id = $1 AND topic_id IS NULL`
  const numParams = tid != null ? [tid] : [sid]
  const { rows: numRows } = await pool.query(numQuery, numParams)
  const nextNum = Number(payload.lesson_number ?? (Number(numRows[0]?.max_num ?? 0) + 1))
  const desc = payload.description != null ? String(payload.description) : ''
  const { rows } = await pool.query(
    `
    INSERT INTO subject_modules (
      subject_id, topic_id, title, description, file_path, link_url, lesson_number, module_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      sid,
      tid,
      String(payload.title || '').trim(),
      desc.trim() || null,
      payload.file_path ? String(payload.file_path) : null,
      payload.link_url ? String(payload.link_url).trim() : null,
      nextNum,
      Number(payload.module_order ?? nextNum),
    ],
  )
  return mapLessonRow(rows[0])
}

export async function updateSubjectLesson(pool, subjectId, lessonId, payload = {}) {
  const sets = []
  const params = []
  let n = 1
  if (payload.title != null) {
    sets.push(`title = $${n++}`)
    params.push(String(payload.title).trim())
  }
  if (payload.description != null) {
    sets.push(`description = $${n++}`)
    params.push(String(payload.description).trim() || null)
  }
  if (payload.file_path !== undefined) {
    sets.push(`file_path = $${n++}`)
    params.push(payload.file_path ? String(payload.file_path) : null)
  }
  if (payload.link_url !== undefined) {
    sets.push(`link_url = $${n++}`)
    params.push(payload.link_url ? String(payload.link_url).trim() : null)
  }
  if (payload.lesson_number != null) {
    sets.push(`lesson_number = $${n++}`)
    params.push(Number(payload.lesson_number))
  }
  if (payload.module_order != null) {
    sets.push(`module_order = $${n++}`)
    params.push(Number(payload.module_order))
  }
  if (payload.topic_id !== undefined) {
    const resolved = await resolveTopicIdForSubject(pool, subjectId, payload.topic_id)
    if (!resolved.ok) return null
    sets.push(`topic_id = $${n++}`)
    params.push(resolved.topicId)
  }
  if (!sets.length) return null
  params.push(Number(lessonId), Number(subjectId))
  const { rows } = await pool.query(
    `UPDATE subject_modules SET ${sets.join(', ')} WHERE id = $${n++} AND subject_id = $${n} RETURNING *`,
    params,
  )
  return rows[0] ? mapLessonRow(rows[0]) : null
}

export async function deleteSubjectLesson(pool, subjectId, lessonId) {
  const lid = Number(lessonId)
  await pool.query(`UPDATE study_materials SET module_id = NULL WHERE module_id = $1`, [lid])
  await pool.query(`UPDATE assignments SET module_id = NULL WHERE module_id = $1`, [lid])
  await pool.query(`UPDATE activities SET module_id = NULL WHERE module_id = $1`, [lid])
  await pool.query(`UPDATE quizzes SET module_id = NULL WHERE module_id = $1`, [lid])
  const r = await pool.query(`DELETE FROM subject_modules WHERE id = $1 AND subject_id = $2`, [
    lid,
    Number(subjectId),
  ])
  return Number(r.rowCount ?? 0) > 0
}

export async function deleteSubjectTopic(pool, subjectId, topicId) {
  const tid = Number(topicId)
  await pool.query(`UPDATE subject_modules SET topic_id = NULL WHERE topic_id = $1`, [tid])
  await pool.query(`UPDATE study_materials SET topic_id = NULL WHERE topic_id = $1`, [tid])
  await pool.query(`UPDATE assignments SET topic_id = NULL WHERE topic_id = $1`, [tid])
  await pool.query(`UPDATE activities SET topic_id = NULL WHERE topic_id = $1`, [tid])
  await pool.query(`UPDATE quizzes SET topic_id = NULL WHERE topic_id = $1`, [tid])
  const r = await pool.query(`DELETE FROM subject_topics WHERE id = $1 AND subject_id = $2`, [
    tid,
    Number(subjectId),
  ])
  return Number(r.rowCount ?? 0) > 0
}

export async function createModuleSubtopic(pool, moduleId, subjectId, { label, subtopic_order }) {
  const { rows: mod } = await pool.query(
    `SELECT id FROM subject_modules WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [Number(moduleId), Number(subjectId)],
  )
  if (!mod[0]) return null
  const { rows } = await pool.query(
    `INSERT INTO subject_module_subtopics (module_id, label, subtopic_order) VALUES ($1, $2, $3) RETURNING *`,
    [Number(moduleId), String(label).trim(), Number(subtopic_order ?? 0)],
  )
  return rows[0]
}

export async function updateModuleSubtopic(pool, subtopicId, moduleId, subjectId, { label, subtopic_order }) {
  const sets = []
  const params = []
  let n = 1
  if (label != null) {
    sets.push(`label = $${n++}`)
    params.push(String(label).trim())
  }
  if (subtopic_order != null) {
    sets.push(`subtopic_order = $${n++}`)
    params.push(Number(subtopic_order))
  }
  if (!sets.length) return null
  params.push(Number(subtopicId), Number(moduleId))
  const { rows } = await pool.query(
    `
    UPDATE subject_module_subtopics st SET ${sets.join(', ')}
    FROM subject_modules m
    WHERE st.id = $${n++} AND st.module_id = $${n} AND st.module_id = m.id AND m.subject_id = $${n + 1}
    RETURNING st.*
    `,
    [...params, Number(subjectId)],
  )
  return rows[0] || null
}

export async function deleteModuleSubtopic(pool, subtopicId, moduleId, subjectId) {
  const r = await pool.query(
    `
    DELETE FROM subject_module_subtopics st
    USING subject_modules m
    WHERE st.id = $1 AND st.module_id = $2 AND st.module_id = m.id AND m.subject_id = $3
    `,
    [Number(subtopicId), Number(moduleId), Number(subjectId)],
  )
  return Number(r.rowCount ?? 0) > 0
}

export async function fetchSubjectStudents(pool, subjectId) {
  const subjectRow = await fetchSubjectRow(pool, subjectId)
  if (!subjectRow) return []
  const gradeNorm = normalizeGradeLevel(subjectRow.grade_level)
  const { rows } = await pool.query(
    `
    SELECT st.id, st.first_name, st.middle_name, st.last_name, st.section_id, st.archived_at,
           sec.section_name
    FROM students st
    LEFT JOIN sections sec ON sec.id = st.section_id
    WHERE lower(trim(replace(coalesce(st.grade_level, ''), '  ', ' '))) = $1
    ORDER BY lower(st.last_name), lower(st.first_name), st.id
    `,
    [gradeNorm],
  )
  return (rows || []).map((r) => ({
    id: String(r.id),
    name: studentDisplayName(r),
    section_id: r.section_id != null ? String(r.section_id) : '',
    section_name: String(r.section_name || '').trim() || '—',
    enrollment_status: r.archived_at ? 'archived' : 'active',
  }))
}

export async function updateCurriculumItemStatus(pool, itemType, itemId, status) {
  const meta = ITEM_TABLES[itemType]
  if (!meta) return { ok: false, message: 'Invalid item type.' }
  const st = String(status || '').toLowerCase()
  if (st !== 'published' && st !== 'draft') return { ok: false, message: 'Status must be published or draft.' }
  const id = Number(itemId)
  if (itemType === 'quiz') {
    await pool.query(
      `UPDATE quizzes SET status = $1, is_hidden = $2, updated_at = NOW() WHERE id = $3`,
      [st, st === 'draft', id],
    )
  } else {
    await pool.query(`UPDATE ${meta.table} SET status = $1 WHERE ${meta.idCol} = $2`, [st, id])
  }
  return { ok: true, status: st }
}

export async function moveCurriculumItem(pool, { item_type, item_id, module_id, topic_id, module_order, subject_id }) {
  const meta = ITEM_TABLES[item_type]
  if (!meta) return { ok: false, message: 'Invalid item type.' }
  const id = Number(item_id)
  const sets = []
  const params = []
  let n = 1
  if (module_id !== undefined) {
    sets.push(`module_id = $${n++}`)
    params.push(module_id == null ? null : Number(module_id))
  }
  if (topic_id !== undefined) {
    sets.push(`topic_id = $${n++}`)
    params.push(topic_id == null ? null : Number(topic_id))
  }
  if (module_order != null) {
    sets.push(`module_order = $${n++}`)
    params.push(Number(module_order))
  }

  let resolvedSubjectId =
    subject_id != null && Number.isFinite(Number(subject_id)) && Number(subject_id) > 0
      ? Number(subject_id)
      : null
  if (!resolvedSubjectId && topic_id != null && Number.isFinite(Number(topic_id)) && Number(topic_id) > 0) {
    const { rows } = await pool.query(
      `SELECT subject_id FROM subject_topics WHERE id = $1 LIMIT 1`,
      [Number(topic_id)],
    )
    if (rows?.[0]?.subject_id != null) resolvedSubjectId = Number(rows[0].subject_id)
  }
  if (!resolvedSubjectId && module_id != null && Number.isFinite(Number(module_id)) && Number(module_id) > 0) {
    const { rows } = await pool.query(
      `SELECT subject_id FROM subject_modules WHERE id = $1 LIMIT 1`,
      [Number(module_id)],
    )
    if (rows?.[0]?.subject_id != null) resolvedSubjectId = Number(rows[0].subject_id)
  }
  if (
    resolvedSubjectId &&
    (item_type === 'quiz' || item_type === 'assignment' || item_type === 'activity')
  ) {
    sets.push(`subject_id = $${n++}`)
    params.push(resolvedSubjectId)
  }

  if (!sets.length) return { ok: false, message: 'Nothing to update.' }
  params.push(id)
  await pool.query(`UPDATE ${meta.table} SET ${sets.join(', ')} WHERE ${meta.idCol} = $${n}`, params)
  return { ok: true }
}
