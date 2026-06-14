import { ensureAssignmentsSchema, expireUnsubmittedForAssignment } from './assignmentsDb.js'
import { ensureActivitiesSchema, expireUnsubmittedForActivity } from './activitiesDb.js'
import { announcementRowToResponse } from './announcementsDb.js'
import { mapFacultyStudyMaterialRow, ensureFacultyStudyMaterialsSchema } from './facultyStudyMaterialsDb.js'
import { normalizeGradeLevel, resolveStudentGradeLevel } from './studentSession.js'
import { mapStudentWorkListRow } from './studentWorkPortal.js'

const ANNOUNCEMENT_SELECT = `id, title, type, message, announcement_image, image_path, image_name, uploaded_by, created_at, updated_at`

export async function fetchStudentSubjects(pool, studentRow) {
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  if (!grade) return []
  const { rows } = await pool.query(
    `
      SELECT id, subject_code, subject_name, grade_level, semester, subject_photo, faculty_id, created_at
      FROM subjects
      WHERE lower(trim(replace(coalesce(grade_level, ''), '  ', ' '))) = $1
      ORDER BY subject_name ASC, id ASC
    `,
    [grade],
  )
  return (rows || []).map((row) => ({
    id: row.id != null ? String(row.id) : '',
    subject_code: String(row.subject_code ?? '').trim(),
    subject_name: String(row.subject_name ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    semester: String(row.semester ?? '').trim(),
    subject_photo: String(row.subject_photo ?? '').trim(),
  }))
}

function submissionRowFromJoin(row) {
  if (!row?.submission_id && !row?.submission_status) return null
  return {
    id: row.submission_id,
    status: row.submission_status,
    score: row.score,
    submitted_at: row.submitted_at,
    file_path: row.submission_file_path,
    file_name: row.submission_file_name,
    feedback: row.feedback,
  }
}

export async function fetchStudentAssignments(pool, studentRow) {
  await ensureAssignmentsSchema(pool)
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  const studentId = studentRow?.id
  const params = [studentId]
  let where = '1=1'
  if (grade) {
    params.push(grade)
    where += ` AND lower(trim(replace(coalesce(a.grade_level, ''), '  ', ' '))) = $${params.length}`
  }
  const { rows } = await pool.query(
    `
      SELECT a.id, a.title, a.description, a.subject_name, a.grade_level, a.semester,
             a.submission_deadline, a.created_at, a.total_score, a.file_path, a.file_name,
             sub.subject_code,
             s.id AS submission_id, s.status AS submission_status, s.score, s.submitted_at,
             s.file_path AS submission_file_path, s.file_name AS submission_file_name, s.feedback
      FROM assignments a
      LEFT JOIN subjects sub ON sub.id = a.subject_id
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
      WHERE ${where}
      ORDER BY a.submission_deadline ASC NULLS LAST, a.created_at DESC
    `,
    params,
  )
  for (const row of rows || []) {
    try {
      await expireUnsubmittedForAssignment(pool, row.id)
    } catch {
      /* ignore */
    }
  }
  return (rows || []).map((row) =>
    mapStudentWorkListRow(row, submissionRowFromJoin(row), 'assignment'),
  )
}

export async function fetchStudentActivities(pool, studentRow) {
  await ensureActivitiesSchema(pool)
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  const studentId = studentRow?.id
  const params = [studentId]
  let where = '1=1'
  if (grade) {
    params.push(grade)
    where += ` AND lower(trim(replace(coalesce(a.grade_level, ''), '  ', ' '))) = $${params.length}`
  }
  const { rows } = await pool.query(
    `
      SELECT a.id, a.title, a.description, a.subject_name, a.grade_level, a.semester,
             a.submission_deadline, a.created_at, a.total_score, a.file_path, a.file_name,
             sub.subject_code,
             s.id AS submission_id, s.status AS submission_status, s.score, s.submitted_at,
             s.file_path AS submission_file_path, s.file_name AS submission_file_name, s.feedback
      FROM activities a
      LEFT JOIN subjects sub ON sub.id = a.subject_id
      LEFT JOIN activity_submissions s ON s.activity_id = a.id AND s.student_id = $1
      WHERE ${where}
      ORDER BY a.submission_deadline ASC NULLS LAST, a.created_at DESC
    `,
    params,
  )
  for (const row of rows || []) {
    try {
      await expireUnsubmittedForActivity(pool, row.id)
    } catch {
      /* ignore */
    }
  }
  return (rows || []).map((row) => mapStudentWorkListRow(row, submissionRowFromJoin(row), 'activity'))
}

export async function fetchStudentQuizzesForGrade(pool, studentRow) {
  const { listStudentQuizzesWithSubmissions } = await import('./quizSubmissionsDb.js')
  return listStudentQuizzesWithSubmissions(pool, studentRow)
}

export async function fetchStudentAnnouncements(pool) {
  const { ensureStudentAnnouncementsReady } = await import('./studentSubjectMaterials.js')
  await ensureStudentAnnouncementsReady(pool)
  const { rows } = await pool.query(
    `
      SELECT ${ANNOUNCEMENT_SELECT}
      FROM announcements
      ORDER BY created_at DESC, id DESC
    `,
  )
  return (rows || []).map((r) => announcementRowToResponse(r)).filter(Boolean)
}

export async function fetchStudentAnnouncementById(pool, announcementId) {
  const id = Number(announcementId)
  if (!Number.isFinite(id) || id <= 0) return null
  const { ensureStudentAnnouncementsReady } = await import('./studentSubjectMaterials.js')
  await ensureStudentAnnouncementsReady(pool)
  const { rows } = await pool.query(
    `
      SELECT ${ANNOUNCEMENT_SELECT}
      FROM announcements
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  )
  return announcementRowToResponse(rows?.[0]) || null
}

export async function fetchStudentStudyMaterials(pool, studentRow, { search } = {}) {
  await ensureFacultyStudyMaterialsSchema(pool)
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  if (!grade) return []

  const { rows: subjectRows } = await pool.query(
    `
      SELECT subject_code, subject_name
      FROM subjects
      WHERE lower(trim(replace(coalesce(grade_level, ''), '  ', ' '))) = $1
    `,
    [grade],
  )

  const subjectKeys = new Set()
  for (const row of subjectRows || []) {
    const code = String(row.subject_code ?? '').trim().toLowerCase()
    const name = String(row.subject_name ?? '').trim().toLowerCase()
    if (code) subjectKeys.add(code)
    if (name) subjectKeys.add(name)
  }
  const sectionName = String(studentRow.section_name ?? '').trim().toLowerCase()
  if (sectionName) subjectKeys.add(sectionName)

  const params = [grade, [...subjectKeys]]
  let sql = `
    SELECT id, material_name, grade_level, subject, file_name, file_url, file_type, file_size,
      uploaded_by, uploaded_by_name, created_at, updated_at
    FROM study_materials
    WHERE uploaded_by IS NOT NULL
      AND lower(trim(replace(coalesce(grade_level, ''), '  ', ' '))) = $1
      AND (
        NULLIF(trim(subject), '') IS NULL
        OR cardinality($2::text[]) = 0
        OR lower(trim(subject)) = ANY($2::text[])
      )
  `

  const q = String(search ?? '').trim()
  if (q) {
    params.push(`%${q}%`)
    sql += `
      AND (
        material_name ILIKE $3
        OR file_name ILIKE $3
        OR subject ILIKE $3
        OR grade_level ILIKE $3
        OR uploaded_by_name ILIKE $3
      )
    `
  }

  sql += ` ORDER BY created_at DESC, id DESC`

  const { rows } = await pool.query(sql, params)
  return (rows || []).map(mapFacultyStudyMaterialRow).filter(Boolean)
}

export async function getStudentPortalProfile(pool, user, studentRow = null) {
  const { enrichAuthIdentifiers, fetchStudentRowForSession, mapStudentProfile } = await import('./studentSession.js')
  const authHints = await enrichAuthIdentifiers(pool, user)
  const row = studentRow || (await fetchStudentRowForSession(pool, user))
  if (!row) return null
  return mapStudentProfile(row, authHints)
}
