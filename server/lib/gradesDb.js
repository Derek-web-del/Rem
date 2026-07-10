import { ensureQuizSubmissionsSchema } from './quizSubmissionsDb.js'
import { ensureAssignmentsSchema } from './assignmentsDb.js'
import { ensureActivitiesSchema } from './activitiesDb.js'
import { extractFacultySectionIdsFromRow } from './facultyProfileAudit.js'
import { studentDisplayName } from './studentPiiCrypto.js'
import { isDeadlinePassed } from './studentWorkPortal.js'
import { fetchSubjectGradeComponents } from './subjectGradeCriteriaDb.js'
import { fetchStudentSubjects } from './studentPortalDb.js'
import { normalizeGradeLevel, resolveStudentGradeLevel } from './studentSession.js'
import { fetchSubjectRow } from './subjectCurriculumDb.js'
import { fetchSubjectGradeItems, fetchStudentScoresForItems } from './subjectGradeItemsDb.js'
import {
  computeScoredStudentGradeRow,
  groupItemsByComponent,
  itemKey,
} from './gradebookCalc.js'

let studentsArchivedColumnMemo = null
let subjectsArchivedColumnMemo = null

async function subjectsHasArchivedAt(pool) {
  if (subjectsArchivedColumnMemo != null) return subjectsArchivedColumnMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'archived_at'
        LIMIT 1
      `,
    )
    subjectsArchivedColumnMemo = rows?.length > 0
    return subjectsArchivedColumnMemo
  } catch {
    subjectsArchivedColumnMemo = false
    return false
  }
}

async function studentsHasArchivedAt(pool) {
  if (studentsArchivedColumnMemo != null) return studentsArchivedColumnMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'archived_at'
        LIMIT 1
      `,
    )
    studentsArchivedColumnMemo = rows?.length > 0
    return studentsArchivedColumnMemo
  } catch {
    studentsArchivedColumnMemo = false
    return false
  }
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function computePercent(score, maxScore) {
  const s = toNum(score)
  const m = toNum(maxScore)
  if (s == null || m == null || m <= 0) return null
  return Math.round((s / m) * 100)
}

export function averagePercents(items) {
  const percents = items.map((i) => i.percent).filter((p) => p != null && Number.isFinite(p))
  if (!percents.length) return 0
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
}

export function safeGrade(val) {
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

export function sanitizeGradeSummary(summary) {
  const quizzes = summary?.quizzes ?? []
  const assignments = summary?.assignments ?? []
  const activities = summary?.activities ?? []
  const components = Array.isArray(summary?.components) ? summary.components : []
  const has_scored_items = quizzes.length + assignments.length + activities.length > 0
  return {
    overall_avg: safeGrade(summary?.overall_avg),
    quiz_avg: safeGrade(summary?.quiz_avg),
    assignment_avg: safeGrade(summary?.assignment_avg),
    activity_avg: safeGrade(summary?.activity_avg),
    quizzes,
    assignments,
    activities,
    components,
    component_avgs:
      summary?.component_avgs && typeof summary.component_avgs === 'object'
        ? summary.component_avgs
        : {},
    has_scored_items,
  }
}

function normalizeDeadlineIso(raw) {
  if (!raw) return null
  if (raw instanceof Date) return raw.toISOString()
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function mapRow(row, type) {
  const score = toNum(row.score)
  const maxScore =
    type === 'quiz'
      ? toNum(row.max_score ?? row.total_points)
      : toNum(row.max_score ?? row.total_score ?? 100)
  if (score == null) return null
  const percent = computePercent(score, maxScore)
  if (percent == null) return null
  const submittedAt =
    row.submitted_at instanceof Date
      ? row.submitted_at.toISOString()
      : row.submitted_at ?? row.updated_at ?? null
  const deadline = normalizeDeadlineIso(row.deadline)
  return {
    title: String(row.title || '').trim() || 'Untitled',
    subject: String(row.subject || row.subject_name || '').trim() || '—',
    score,
    max_score: maxScore,
    percent,
    submitted_at: submittedAt,
    submission_id: row.submission_id != null ? Number(row.submission_id) : null,
    entity_id: row.entity_id != null ? Number(row.entity_id) : null,
    entity_type: type,
    grade_component_id: row.grade_component_id != null ? Number(row.grade_component_id) : null,
    deadline,
    is_locked: isDeadlinePassed(deadline),
  }
}

function roundPercent(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function averageForComponent(items, componentId) {
  const id = Number(componentId)
  if (!Number.isFinite(id) || id <= 0) return 0
  const filtered = items.filter((item) => Number(item?.grade_component_id) === id)
  return averagePercents(filtered)
}

export function componentHasGrades(comp, quizzes, assignments, activities) {
  const id = Number(comp?.id)
  if (!Number.isFinite(id) || id <= 0) return false
  if (comp?.is_quiz) return quizzes.length > 0
  let hasAssignment = false
  let hasActivity = false
  if (comp?.maps_to_assignment) {
    hasAssignment = assignments.some((item) => Number(item?.grade_component_id) === id)
  }
  if (comp?.maps_to_activity) {
    hasActivity = activities.some((item) => Number(item?.grade_component_id) === id)
  }
  if (comp?.maps_to_assignment && comp?.maps_to_activity) return hasAssignment || hasActivity
  if (comp?.maps_to_assignment) return hasAssignment
  if (comp?.maps_to_activity) return hasActivity
  return false
}

export function buildGradedComponentSummary(quizzes, assignments, activities, criteriaWeights = null) {
  const components = Array.isArray(criteriaWeights?.components) ? criteriaWeights.components : []
  const quiz_avg = averagePercents(quizzes)
  const assignment_avg = averagePercents(assignments)
  const activity_avg = averagePercents(activities)

  if (!components.length) {
    return {
      overall_avg: averagePercents([...quizzes, ...assignments, ...activities]),
      quiz_avg,
      assignment_avg,
      activity_avg,
      component_avgs: {},
      graded_weight_total: 0,
      graded_components_count: 0,
      graded_component_ids: [],
      components: [],
    }
  }

  const component_avgs = componentAverages(components, quizzes, assignments, activities)
  let weightedSum = 0
  let gradedWeightTotal = 0
  let graded_components_count = 0
  const graded_component_ids = []

  for (const comp of components) {
    if (!componentHasGrades(comp, quizzes, assignments, activities)) continue
    const weight = Number(comp.percentage ?? 0)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const avg = Number(component_avgs[String(comp.id)] ?? 0)
    weightedSum += weight * avg
    gradedWeightTotal += weight
    graded_components_count += 1
    graded_component_ids.push(String(comp.id))
  }

  const overall_avg = gradedWeightTotal > 0 ? roundPercent(weightedSum / gradedWeightTotal) : 0

  return {
    overall_avg,
    quiz_avg,
    assignment_avg,
    activity_avg,
    component_avgs,
    graded_weight_total: gradedWeightTotal,
    graded_components_count,
    graded_component_ids,
    components,
  }
}

function componentAverages(components, quizzes, assignments, activities) {
  const out = {}
  for (const comp of components || []) {
    const id = Number(comp?.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const key = String(id)
    let avg = 0
    if (comp?.is_quiz) {
      avg = averagePercents(quizzes)
    } else {
      const assignmentAvg = comp?.maps_to_assignment ? averageForComponent(assignments, id) : null
      const activityAvg = comp?.maps_to_activity ? averageForComponent(activities, id) : null
      if (assignmentAvg != null && activityAvg != null) {
        avg = Math.max(assignmentAvg, activityAvg)
      } else if (assignmentAvg != null) {
        avg = assignmentAvg
      } else if (activityAvg != null) {
        avg = activityAvg
      } else {
        avg = 0
      }
    }
    out[key] = roundPercent(avg)
  }
  return out
}

function buildSummary(quizzes, assignments, activities, criteriaWeights = null) {
  const quiz_avg = averagePercents(quizzes)
  const assignment_avg = averagePercents(assignments)
  const activity_avg = averagePercents(activities)
  const components = Array.isArray(criteriaWeights?.components) ? criteriaWeights.components : []
  const hasDynamicComponents = components.length > 0

  let overall_avg
  let component_avgs = {}
  if (hasDynamicComponents) {
    component_avgs = componentAverages(components, quizzes, assignments, activities)
    overall_avg = roundPercent(
      components.reduce((sum, comp) => {
        const cid = String(comp.id)
        const weight = Number(comp.percentage ?? 0)
        const avg = Number(component_avgs[cid] ?? 0)
        if (!Number.isFinite(weight) || weight <= 0) return sum
        return sum + (weight / 100) * avg
      }, 0),
    )
  } else if (criteriaWeights) {
    const w = Number(criteriaWeights.written_work_pct ?? 0)
    const p = Number(criteriaWeights.performance_task_pct ?? 0)
    const q = Number(criteriaWeights.quizzes_pct ?? 0)
    const a = Number(criteriaWeights.activities_pct ?? 0)
    // Performance task: use higher of assignment/activity avg when no separate PT scores exist.
    const performance_component = Math.max(assignment_avg, activity_avg)
    overall_avg = Math.round(
      (w / 100) * assignment_avg +
        (p / 100) * performance_component +
        (q / 100) * quiz_avg +
        (a / 100) * activity_avg,
    )
  } else {
    overall_avg = averagePercents([...quizzes, ...assignments, ...activities])
  }
  return { overall_avg, quiz_avg, assignment_avg, activity_avg, component_avgs }
}

export async function ensureGradesSchemas(pool) {
  await ensureQuizSubmissionsSchema(pool)
  await ensureAssignmentsSchema(pool)
  await ensureActivitiesSchema(pool)
}

export function normalizeGradeFetchOptions({ subjectId = null, facultyId = null } = {}) {
  const subId = subjectId != null && String(subjectId).trim() !== '' ? Number(subjectId) : null
  const subFilter = Number.isFinite(subId) && subId > 0 ? subId : null
  const fid = String(facultyId ?? '').trim()
  const facultyFilter = fid || null
  return { subFilter, facultyFilter, scopeToFaculty: Boolean(facultyFilter) }
}

export async function facultyOwnsSubject(pool, facultyId, subjectId) {
  const { teacherOwnsSubject } = await import('./teacherSubjectAccess.js')
  let archive = ''
  try {
    const { rows } = await pool.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'subjects'
        AND column_name = 'archived_at'
      LIMIT 1
      `,
    )
    if (rows?.length) archive = ' AND sub.archived_at IS NULL '
  } catch {
    void 0
  }
  return teacherOwnsSubject(pool, facultyId, subjectId, archive)
}

export async function fetchStudentGrades(
  pool,
  studentId,
  { subjectId = null, facultyId = null, publishedOnly = false } = {},
) {
  const sid = Number(studentId)
  if (!Number.isFinite(sid) || sid <= 0) return null

  await ensureGradesSchemas(pool)
  const { subFilter, facultyFilter } = normalizeGradeFetchOptions({ subjectId, facultyId })

  const publishedQuizFilter = publishedOnly
    ? ` AND lower(coalesce(q.status, 'published')) = 'published' AND coalesce(q.is_hidden, false) = false`
    : ''
  const publishedAssignmentFilter = publishedOnly
    ? ` AND lower(coalesce(a.status, 'published')) = 'published'`
    : ''
  const publishedActivityFilter = publishedOnly
    ? ` AND lower(coalesce(a.status, 'published')) = 'published'`
    : ''

  const quizSql = `
    SELECT q.title, q.subject,
           qs.id AS submission_id, qs.quiz_id AS entity_id,
           q.deadline,
           qs.score, qs.total_points AS max_score, qs.submitted_at
    FROM quiz_submissions qs
    INNER JOIN quizzes q ON q.id = qs.quiz_id
    WHERE qs.student_id = $1
      AND qs.score IS NOT NULL
      AND ($2::int IS NULL OR EXISTS (
        SELECT 1 FROM subjects sub
        WHERE sub.id = $2
          AND lower(trim(coalesce(q.subject, ''))) = lower(trim(coalesce(sub.subject_name, '')))
      ))
      AND ($3::text IS NULL OR q.created_by::text = $3::text)${publishedQuizFilter}
    ORDER BY qs.submitted_at DESC NULLS LAST, qs.updated_at DESC
  `

  const assignmentSql = `
    SELECT a.title,
           COALESCE(NULLIF(trim(a.subject_name), ''), sub.subject_name, '—') AS subject,
           s.id AS submission_id, s.assignment_id AS entity_id,
           a.submission_deadline AS deadline,
           s.score, a.total_score AS max_score, s.submitted_at,
           a.grade_component_id
    FROM assignment_submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    LEFT JOIN subjects sub ON sub.id = a.subject_id
    WHERE s.student_id = $1
      AND s.score IS NOT NULL
      AND ($2::int IS NULL OR a.subject_id = $2)
      AND ($3::text IS NULL OR a.faculty_id::text = $3::text)${publishedAssignmentFilter}
    ORDER BY s.submitted_at DESC NULLS LAST, s.updated_at DESC
  `

  const activitySql = `
    SELECT a.title,
           COALESCE(NULLIF(trim(a.subject_name), ''), sub.subject_name, '—') AS subject,
           s.id AS submission_id, s.activity_id AS entity_id,
           a.submission_deadline AS deadline,
           s.score, a.total_score AS max_score, s.submitted_at,
           a.grade_component_id
    FROM activity_submissions s
    INNER JOIN activities a ON a.id = s.activity_id
    LEFT JOIN subjects sub ON sub.id = a.subject_id
    WHERE s.student_id = $1
      AND s.score IS NOT NULL
      AND ($2::int IS NULL OR a.subject_id = $2)
      AND ($3::text IS NULL OR a.faculty_id::text = $3::text)${publishedActivityFilter}
    ORDER BY s.submitted_at DESC NULLS LAST, s.updated_at DESC
  `

  const queryParams = [sid, subFilter, facultyFilter]
  const [quizRes, assignRes, actRes] = await Promise.all([
    pool.query(quizSql, queryParams),
    pool.query(assignmentSql, queryParams),
    pool.query(activitySql, queryParams),
  ])

  const quizzes = (quizRes.rows || []).map((r) => mapRow(r, 'quiz')).filter(Boolean)
  const assignments = (assignRes.rows || []).map((r) => mapRow(r, 'assignment')).filter(Boolean)
  const activities = (actRes.rows || []).map((r) => mapRow(r, 'activity')).filter(Boolean)

  let criteriaWeights = null
  if (subFilter) {
    try {
      const crit = await fetchSubjectGradeComponents(pool, subFilter)
      if (crit?.configured) criteriaWeights = crit
    } catch {
      criteriaWeights = null
    }
  }

  const summary = buildSummary(quizzes, assignments, activities, criteriaWeights)
  const components = Array.isArray(criteriaWeights?.components) ? criteriaWeights.components : []

  return sanitizeGradeSummary({
    ...summary,
    quizzes,
    assignments,
    activities,
    components,
  })
}

function mapCriteriaComponent(comp) {
  return {
    id: String(comp.id),
    name: String(comp.name || ''),
    percentage: Number(comp.percentage ?? 0),
    color: String(comp.color || '#3B82F6'),
    maps_to_assignment: Boolean(comp.maps_to_assignment),
    maps_to_activity: Boolean(comp.maps_to_activity),
    is_quiz: Boolean(comp.is_quiz),
  }
}

function mapScoredWorkItem(item, cell) {
  const score = toNum(cell?.score)
  const maxScore = toNum(cell?.max_points ?? item.max_points)
  if (score == null || !cell?.has_score) return null
  const percent = computePercent(score, maxScore)
  if (percent == null) return null
  const submittedAt =
    cell.submitted_at instanceof Date
      ? cell.submitted_at.toISOString()
      : cell.submitted_at ?? null
  const deadline = normalizeDeadlineIso(item.deadline)
  return {
    title: String(item.title || '').trim() || 'Untitled',
    subject: '',
    score,
    max_score: maxScore,
    percent,
    submitted_at: submittedAt,
    submission_id: cell.submission_id != null ? Number(cell.submission_id) : null,
    entity_id: Number(item.id),
    entity_type: item.type,
    grade_component_id: item.grade_component_id != null ? Number(item.grade_component_id) : null,
    deadline,
    is_locked: isDeadlinePassed(deadline),
  }
}

export async function fetchStudentSubjectGradeDetail(pool, studentId, subjectId) {
  const sid = Number(studentId)
  const subId = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(subId) || subId <= 0) {
    return null
  }

  await ensureGradesSchemas(pool)
  const subjectRow = await fetchSubjectRow(pool, subId)
  if (!subjectRow) return null

  const criteria = await fetchSubjectGradeComponents(pool, subId)
  const components = (criteria?.components || []).map(mapCriteriaComponent)
  const items = await fetchSubjectGradeItems(pool, subId, subjectRow)
  const scoreCells = await fetchStudentScoresForItems(pool, sid, items)
  const groupedItems = groupItemsByComponent(components, items)

  const scored = computeScoredStudentGradeRow(components, groupedItems, scoreCells)
  const componentAvgs = scored.componentAvgs
  const overall_avg =
    scored.finalGrade != null ? safeGrade(scored.finalGrade) : 0
  const graded_weight_total = safeGrade(scored.gradedWeightTotal)
  const graded_component_ids = Object.keys(componentAvgs)

  const quizzes = []
  const assignments = []
  const activities = []
  for (const item of items) {
    const cell = scoreCells[itemKey(item.type, item.id)]
    const mapped = mapScoredWorkItem(item, cell)
    if (!mapped) continue
    if (item.type === 'quiz') quizzes.push(mapped)
    else if (item.type === 'assignment') assignments.push(mapped)
    else if (item.type === 'activity') activities.push(mapped)
  }

  const has_scored_items = quizzes.length + assignments.length + activities.length > 0

  return {
    subject_id: subId,
    subject_name: String(subjectRow.subject_name || '').trim() || '—',
    subject_code: String(subjectRow.subject_code || '').trim(),
    grade_level: String(subjectRow.grade_level || '').trim(),
    semester: String(subjectRow.semester || '').trim(),
    overall_avg: has_scored_items ? overall_avg : 0,
    computed_overall_avg: has_scored_items ? overall_avg : 0,
    computed_component_avgs: componentAvgs,
    component_avgs: componentAvgs,
    components,
    graded_weight_total,
    graded_component_ids,
    has_scored_items,
    quizzes,
    assignments,
    activities,
    saved_final_grade: null,
    saved_component_avgs: null,
    saved_updated_at: null,
  }
}

export async function fetchFacultySubjectsForGrade(pool, facultyId, gradeLevel) {
  const facultyIdText = String(facultyId ?? '').trim()
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  if (!pool || !facultyIdText || !gradeNorm) return []

  const archive = await subjectsHasArchivedAt(pool)
  const archiveFilter = archive ? ' AND archived_at IS NULL' : ''

  const { rows } = await pool.query(
    `
      SELECT id, subject_code, subject_name, grade_level, semester
      FROM subjects
      WHERE faculty_id::text = $1
        AND lower(trim(replace(coalesce(grade_level, ''), '  ', ' '))) = $2
        ${archiveFilter}
      ORDER BY subject_name ASC, id ASC
    `,
    [facultyIdText, gradeNorm],
  )

  return (rows || []).map((row) => ({
    id: Number(row.id),
    subject_code: String(row.subject_code ?? '').trim(),
    subject_name: String(row.subject_name ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    semester: String(row.semester ?? '').trim(),
  }))
}

export async function fetchStudentGradesBySubject(pool, studentId, studentRow = null, options = {}) {
  const { facultyId = null } = options
  const sid = Number(studentId)
  if (!Number.isFinite(sid) || sid <= 0) return { subjects: [], has_any_scores: false }

  let row = studentRow
  if (!row) {
    const { rows } = await pool.query(
      `SELECT id, first_name, middle_name, last_name, grade_level, section_id FROM students WHERE id = $1 LIMIT 1`,
      [sid],
    )
    row = rows?.[0] ?? null
  }
  if (!row) return { subjects: [], has_any_scores: false }

  const facultyIdText = facultyId != null ? String(facultyId).trim() : ''
  let subjectList
  if (facultyIdText) {
    const gradeLevel = await resolveStudentGradeLevel(pool, row)
    if (!gradeLevel) return { subjects: [], has_any_scores: false }
    const facultySubjects = await fetchFacultySubjectsForGrade(pool, facultyIdText, gradeLevel)
    subjectList = facultySubjects.map((sub) => ({
      id: String(sub.id),
      subject_code: sub.subject_code,
      subject_name: sub.subject_name,
      grade_level: sub.grade_level,
      semester: sub.semester,
    }))
  } else {
    subjectList = await fetchStudentSubjects(pool, row)
  }

  const subjects = []
  let has_any_scores = false

  for (const sub of subjectList) {
    const subjectId = Number(sub.id)
    if (!Number.isFinite(subjectId) || subjectId <= 0) continue

    if (facultyIdText) {
      const owns = await facultyOwnsSubject(pool, facultyIdText, subjectId)
      if (!owns) continue
    }

    const detail = await fetchStudentSubjectGradeDetail(pool, sid, subjectId)
    if (!detail) continue

    if (detail.has_scored_items) has_any_scores = true

    subjects.push({
      subject_id: detail.subject_id,
      subject_name: detail.subject_name,
      subject_code: detail.subject_code,
      grade_level: detail.grade_level || String(sub.grade_level || '').trim(),
      semester: detail.semester || String(sub.semester || '').trim(),
      overall_avg: detail.overall_avg,
      component_avgs: detail.component_avgs || {},
      components: detail.components || [],
      graded_weight_total: detail.graded_weight_total,
      graded_component_ids: detail.graded_component_ids || [],
      has_scored_items: detail.has_scored_items,
      quizzes: detail.quizzes || [],
      assignments: detail.assignments || [],
      activities: detail.activities || [],
    })
  }

  return { subjects, has_any_scores }
}

export async function facultySectionIds(pool, facultyRow) {
  const fid = String(facultyRow?.id || '').trim()
  if (!fid || !pool) return []

  let junctionSectionIds = []
  try {
    const { rows } = await pool.query(
      `
        SELECT section_id
        FROM public.faculty_sections
        WHERE faculty_id::text = $1
        ORDER BY section_id
      `,
      [fid],
    )
    junctionSectionIds = (rows || []).map((r) => r.section_id)
  } catch {
    junctionSectionIds = []
  }

  // Mirror teacher advisory resolution: faculty_sections junction, then advisory_sections_json.
  return extractFacultySectionIdsFromRow(facultyRow, junctionSectionIds)
}

export async function facultyCanAccessSection(pool, facultyRow, sectionId) {
  const sid = Number(sectionId)
  if (!Number.isFinite(sid) || sid <= 0) return false
  const ids = await facultySectionIds(pool, facultyRow)
  return ids.includes(sid)
}

export async function facultyCanAccessStudent(pool, facultyRow, studentId) {
  const idText = String(studentId ?? '').trim()
  if (!idText) return false

  const sectionIds = await facultySectionIds(pool, facultyRow)
  if (!sectionIds.length) {
    console.warn('[grades] facultyCanAccessStudent: no advisory sections resolved for faculty', {
      facultyId: facultyRow?.id,
      studentId: idText,
    })
    return false
  }

  const archive = await studentsHasArchivedAt(pool)
  let sql = `
    SELECT st.id, st.section_id
    FROM students st
    WHERE st.id::text = $1
      AND st.section_id = ANY($2::int[])
  `
  if (archive) sql += ' AND st.archived_at IS NULL '
  sql += ' LIMIT 1'

  const { rows } = await pool.query(sql, [idText, sectionIds])
  if (rows?.length > 0) return true

  let studentSectionId = null
  try {
    const { rows: stRows } = await pool.query(
      `SELECT section_id FROM students WHERE id::text = $1 LIMIT 1`,
      [idText],
    )
    studentSectionId = stRows?.[0]?.section_id ?? null
  } catch {
    studentSectionId = null
  }

  console.warn('[grades] facultyCanAccessStudent: section mismatch', {
    facultyId: facultyRow?.id,
    studentId: idText,
    facultySectionIds: sectionIds,
    studentSectionId,
  })
  return false
}

export async function fetchSectionSubjectGradesMatrix(pool, sectionId, { facultyId = null } = {}) {
  const secId = Number(sectionId)
  if (!Number.isFinite(secId) || secId <= 0) {
    return { grade_level: '', subjects: [], students: [] }
  }

  await ensureGradesSchemas(pool)

  const { rows: secRows } = await pool.query(
    `SELECT grade_level FROM sections WHERE id = $1 LIMIT 1`,
    [secId],
  )
  const gradeLevel = normalizeGradeLevel(secRows?.[0]?.grade_level)
  const facultyIdText = facultyId != null ? String(facultyId).trim() : ''
  if (!gradeLevel || !facultyIdText) {
    return { grade_level: gradeLevel || '', subjects: [], students: [] }
  }

  const facultySubjectRows = await fetchFacultySubjectsForGrade(pool, facultyIdText, gradeLevel)
  const subjects = facultySubjectRows.map((row) => ({
    id: row.id,
    subject_code: row.subject_code,
    subject_name: row.subject_name,
  }))

  const { rows: students } = await pool.query(
    `
      SELECT st.id, st.first_name, st.middle_name, st.last_name
      FROM students st
      WHERE st.section_id = $1 AND st.archived_at IS NULL
      ORDER BY st.last_name ASC NULLS LAST, st.first_name ASC NULLS LAST
    `,
    [secId],
  )

  const studentResults = []
  for (const st of students || []) {
    const subject_grades = {}
    for (const sub of subjects) {
      const detail = await fetchStudentSubjectGradeDetail(pool, st.id, sub.id)
      const hasScored = Boolean(detail?.has_scored_items)
      subject_grades[String(sub.id)] = {
        overall_avg: hasScored ? safeGrade(detail?.overall_avg) : null,
        has_scored_items: hasScored,
      }
    }
    studentResults.push({
      student_id: Number(st.id),
      student_name: studentDisplayName(st) || `Student #${st.id}`,
      subject_grades,
    })
  }

  return {
    grade_level: gradeLevel,
    subjects,
    students: studentResults,
  }
}
