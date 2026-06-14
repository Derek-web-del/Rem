import { ensureAssignmentsSchema, normalizeGradeLevel } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { ensureQuizSubmissionsSchema } from './quizSubmissionsDb.js'
import { facultySectionIds } from './gradesDb.js'
import { fetchSubjectGradeComponents } from './subjectGradeCriteriaDb.js'
import { fetchSubjectRow } from './subjectCurriculumDb.js'
import { fetchSubjectGradeItems, fetchStudentScoresForItems } from './subjectGradeItemsDb.js'
import { decryptStudentRows, studentDisplayName } from './studentPiiCrypto.js'
import {
  computeStudentGradeRow,
  groupItemsByComponent,
  itemKey,
  clampScore,
} from './gradebookCalc.js'

export async function ensureGradebookSchema(pool) {
  await ensureAssignmentsSchema(pool)
  await ensureActivitiesSchema(pool)
  await ensureQuizSubmissionsSchema(pool)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_student_final_grades (
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      final_grade NUMERIC(6, 2) NOT NULL DEFAULT 0,
      component_avgs JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(255),
      PRIMARY KEY (subject_id, student_id)
    )
  `)
}

async function studentsHasArchivedAt(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'archived_at' LIMIT 1`,
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

async function fetchSectionsForSubject(pool, facultyRow, subjectRow) {
  const sectionIds = await facultySectionIds(pool, facultyRow)
  if (!sectionIds.length) return []

  const gradeNorm = normalizeGradeLevel(subjectRow.grade_level)
  const { rows } = await pool.query(
    `
    SELECT id, section_name, grade_level
    FROM sections
    WHERE id = ANY($1::int[])
    ORDER BY section_name ASC NULLS LAST, id ASC
    `,
    [sectionIds],
  )

  return (rows || [])
    .filter((r) => {
      if (!gradeNorm) return true
      const sg = normalizeGradeLevel(r.grade_level)
      return !sg || sg === gradeNorm
    })
    .map((r) => ({
      id: Number(r.id),
      section_name: String(r.section_name || '').trim() || `Section ${r.id}`,
      grade_level: String(r.grade_level || '').trim(),
    }))
}

async function fetchGradebookItems(pool, subjectId, subjectRow = null) {
  return fetchSubjectGradeItems(pool, subjectId, subjectRow)
}

export { fetchSubjectGradeItems, fetchStudentScoresForItems }

async function fetchGradebookStudents(pool, subjectRow, sectionId) {
  const gradeNorm = normalizeGradeLevel(subjectRow.grade_level)
  const hasArchive = await studentsHasArchivedAt(pool)
  const params = [gradeNorm]
  let sectionFilter = ''
  if (sectionId != null && Number.isFinite(Number(sectionId)) && Number(sectionId) > 0) {
    params.push(Number(sectionId))
    sectionFilter = ` AND st.section_id = $${params.length}`
  }

  const { rows } = await pool.query(
    `
    SELECT st.id, st.first_name, st.middle_name, st.last_name, st.section_id,
           sec.section_name
    FROM students st
    LEFT JOIN sections sec ON sec.id = st.section_id
    WHERE lower(trim(replace(coalesce(st.grade_level, ''), '  ', ' '))) = $1
      ${hasArchive ? ' AND st.archived_at IS NULL ' : ''}
      ${sectionFilter}
    ORDER BY lower(st.last_name) ASC NULLS LAST, lower(st.first_name) ASC NULLS LAST, st.id ASC
    `,
    params,
  )

  return decryptStudentRows(rows || []).map((r) => ({
    id: Number(r.id),
    student_id: Number(r.id),
    name: studentDisplayName(r) || `Student #${r.id}`,
    section_id: r.section_id != null ? Number(r.section_id) : null,
    section_name: String(r.section_name || '').trim() || '—',
  }))
}

async function fetchScoresMatrix(pool, subjectId, studentIds, items) {
  const scores = {}
  for (const sid of studentIds) {
    scores[String(sid)] = {}
  }
  if (!studentIds.length || !items.length) return scores

  const assignmentIds = items.filter((i) => i.type === 'assignment').map((i) => i.id)
  const activityIds = items.filter((i) => i.type === 'activity').map((i) => i.id)
  const quizIds = items.filter((i) => i.type === 'quiz').map((i) => i.id)

  if (assignmentIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.student_id, s.assignment_id AS entity_id, s.id AS submission_id, s.score
      FROM assignment_submissions s
      WHERE s.assignment_id = ANY($1::bigint[])
        AND s.student_id = ANY($2::int[])
      `,
      [assignmentIds, studentIds],
    )
    for (const r of rows || []) {
      const stKey = String(r.student_id)
      if (!scores[stKey]) scores[stKey] = {}
      const item = items.find((i) => i.type === 'assignment' && i.id === Number(r.entity_id))
      const key = itemKey('assignment', r.entity_id)
      scores[stKey][key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: item?.max_points ?? 100,
      }
    }
  }

  if (activityIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.student_id, s.activity_id AS entity_id, s.id AS submission_id, s.score
      FROM activity_submissions s
      WHERE s.activity_id = ANY($1::bigint[])
        AND s.student_id = ANY($2::int[])
      `,
      [activityIds, studentIds],
    )
    for (const r of rows || []) {
      const stKey = String(r.student_id)
      if (!scores[stKey]) scores[stKey] = {}
      const item = items.find((i) => i.type === 'activity' && i.id === Number(r.entity_id))
      const key = itemKey('activity', r.entity_id)
      scores[stKey][key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: item?.max_points ?? 100,
      }
    }
  }

  if (quizIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.student_id, s.quiz_id AS entity_id, s.id AS submission_id, s.score, s.total_points
      FROM quiz_submissions s
      WHERE s.quiz_id = ANY($1::bigint[])
        AND s.student_id = ANY($2::int[])
      `,
      [quizIds, studentIds],
    )
    for (const r of rows || []) {
      const stKey = String(r.student_id)
      if (!scores[stKey]) scores[stKey] = {}
      const item = items.find((i) => i.type === 'quiz' && i.id === Number(r.entity_id))
      const maxPts =
        r.total_points != null ? Number(r.total_points) : item?.max_points ?? 0
      const key = itemKey('quiz', r.entity_id)
      scores[stKey][key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: maxPts,
      }
    }
  }

  for (const sid of studentIds) {
    const stKey = String(sid)
    if (!scores[stKey]) scores[stKey] = {}
    for (const item of items) {
      const key = itemKey(item.type, item.id)
      if (!scores[stKey][key]) {
        scores[stKey][key] = {
          score: 0,
          submission_id: null,
          max_points: item.max_points,
        }
      }
    }
  }

  return scores
}

async function fetchSavedFinalGrades(pool, subjectId, studentIds) {
  if (!studentIds.length) return {}
  const { rows } = await pool.query(
    `
    SELECT student_id, final_grade, component_avgs, updated_at
    FROM subject_student_final_grades
    WHERE subject_id = $1 AND student_id = ANY($2::int[])
    `,
    [Number(subjectId), studentIds],
  )
  const out = {}
  for (const r of rows || []) {
    out[String(r.student_id)] = {
      final_grade: Number(r.final_grade) || 0,
      component_avgs:
        r.component_avgs && typeof r.component_avgs === 'object' ? r.component_avgs : {},
      updated_at: r.updated_at,
    }
  }
  return out
}

export async function fetchSubjectGradebook(pool, subjectId, { sectionId = null, facultyRow = null } = {}) {
  await ensureGradebookSchema(pool)
  const sid = Number(subjectId)
  const subjectRow = await fetchSubjectRow(pool, sid)
  if (!subjectRow) return { error: 'NOT_FOUND' }

  const criteria = await fetchSubjectGradeComponents(pool, sid)
  const components = (criteria?.components || []).map((c) => ({
    id: String(c.id),
    name: c.name,
    percentage: Number(c.percentage ?? 0),
    color: c.color || '#3B82F6',
    component_order: Number(c.component_order ?? 0),
    maps_to_assignment: Boolean(c.maps_to_assignment),
    maps_to_activity: Boolean(c.maps_to_activity),
    is_quiz: Boolean(c.is_quiz),
  }))

  const sections = facultyRow ? await fetchSectionsForSubject(pool, facultyRow, subjectRow) : []
  const items = await fetchGradebookItems(pool, sid, subjectRow)
  const students = await fetchGradebookStudents(pool, subjectRow, sectionId)
  const studentIds = students.map((s) => s.id)
  const scores = await fetchScoresMatrix(pool, sid, studentIds, items)
  const saved_final_grades = await fetchSavedFinalGrades(pool, sid, studentIds)
  const groupedItems = groupItemsByComponent(components, items)

  return {
    subject: {
      id: sid,
      subject_name: String(subjectRow.subject_name || '').trim(),
      subject_code: String(subjectRow.subject_code || '').trim(),
      grade_level: String(subjectRow.grade_level || '').trim(),
    },
    components,
    sections,
    items,
    groupedItems,
    students,
    scores,
    saved_final_grades,
    configured: components.length > 0,
    has_items: items.length > 0,
  }
}

async function upsertAssignmentScore(pool, { entityId, studentId, studentName, score }) {
  await pool.query(
    `
    INSERT INTO assignment_submissions (assignment_id, student_id, student_name, score, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (assignment_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      status = 'graded',
      student_name = COALESCE(NULLIF(EXCLUDED.student_name, ''), assignment_submissions.student_name),
      updated_at = NOW()
    `,
    [entityId, studentId, studentName, score],
  )
}

async function upsertActivityScore(pool, { entityId, studentId, studentName, score }) {
  await pool.query(
    `
    INSERT INTO activity_submissions (activity_id, student_id, student_name, score, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (activity_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      status = 'graded',
      student_name = COALESCE(NULLIF(EXCLUDED.student_name, ''), activity_submissions.student_name),
      updated_at = NOW()
    `,
    [entityId, studentId, studentName, score],
  )
}

async function upsertQuizScore(pool, { entityId, studentId, score, maxPoints }) {
  await pool.query(
    `
    INSERT INTO quiz_submissions (quiz_id, student_id, score, total_points, status, updated_at)
    VALUES ($1, $2, $3, $4, 'graded', NOW())
    ON CONFLICT (quiz_id, student_id) DO UPDATE SET
      score = EXCLUDED.score,
      total_points = COALESCE(quiz_submissions.total_points, EXCLUDED.total_points),
      status = 'graded',
      updated_at = NOW()
    `,
    [entityId, studentId, score, maxPoints],
  )
}

export async function saveSubjectGradebookScores(
  pool,
  subjectId,
  { scores: scoreEntries = [], sectionId = null, updatedBy = null } = {},
) {
  await ensureGradebookSchema(pool)
  const sid = Number(subjectId)
  const subjectRow = await fetchSubjectRow(pool, sid)
  if (!subjectRow) return { error: 'NOT_FOUND' }

  const criteria = await fetchSubjectGradeComponents(pool, sid)
  const components = (criteria?.components || []).map((c) => ({
    id: String(c.id),
    name: c.name,
    percentage: Number(c.percentage ?? 0),
    maps_to_assignment: Boolean(c.maps_to_assignment),
    maps_to_activity: Boolean(c.maps_to_activity),
    is_quiz: Boolean(c.is_quiz),
  }))

  const items = await fetchGradebookItems(pool, sid, subjectRow)
  const itemMap = new Map(items.map((i) => [itemKey(i.type, i.id), i]))
  const students = await fetchGradebookStudents(pool, subjectRow, sectionId)
  const studentById = new Map(students.map((s) => [String(s.id), s]))
  const groupedItems = groupItemsByComponent(components, items)

  const scoresMap = await fetchScoresMatrix(
    pool,
    sid,
    students.map((s) => s.id),
    items,
  )

  const entries = Array.isArray(scoreEntries) ? scoreEntries : []
  for (const entry of entries) {
    const studentId = Number(entry.student_id)
    const entityType = String(entry.entity_type || '').toLowerCase()
    const entityId = Number(entry.entity_id)
    if (!Number.isFinite(studentId) || studentId <= 0) continue
    if (!Number.isFinite(entityId) || entityId <= 0) continue
    if (!['assignment', 'activity', 'quiz'].includes(entityType)) continue

    const key = itemKey(entityType, entityId)
    const item = itemMap.get(key)
    if (!item) continue

    const student = studentById.get(String(studentId))
    if (!student) continue

    const clamped = clampScore(entry.score, item.max_points)

    if (entityType === 'assignment') {
      await upsertAssignmentScore(pool, {
        entityId,
        studentId,
        studentName: student.name,
        score: Math.round(clamped),
      })
    } else if (entityType === 'activity') {
      await upsertActivityScore(pool, {
        entityId,
        studentId,
        studentName: student.name,
        score: Math.round(clamped),
      })
    } else if (entityType === 'quiz') {
      await upsertQuizScore(pool, {
        entityId,
        studentId,
        score: clamped,
        maxPoints: item.max_points,
      })
    }

    if (!scoresMap[String(studentId)]) scoresMap[String(studentId)] = {}
    scoresMap[String(studentId)][key] = {
      score: clamped,
      submission_id: scoresMap[String(studentId)][key]?.submission_id ?? null,
      max_points: item.max_points,
    }
  }

  for (const student of students) {
    const stKey = String(student.id)
    const flatScores = {}
    for (const [key, cell] of Object.entries(scoresMap[stKey] || {})) {
      flatScores[key] = cell?.score ?? 0
    }
    const { componentAvgs, finalGrade } = computeStudentGradeRow(components, groupedItems, flatScores)

    await pool.query(
      `
      INSERT INTO subject_student_final_grades (subject_id, student_id, final_grade, component_avgs, updated_at, updated_by)
      VALUES ($1, $2, $3, $4::jsonb, NOW(), $5)
      ON CONFLICT (subject_id, student_id) DO UPDATE SET
        final_grade = EXCLUDED.final_grade,
        component_avgs = EXCLUDED.component_avgs,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      `,
      [sid, student.id, finalGrade, JSON.stringify(componentAvgs), updatedBy],
    )
  }

  return { ok: true, students_updated: students.length }
}
