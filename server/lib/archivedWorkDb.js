import fs from 'node:fs'
import path from 'node:path'
import { fetchStudentGrades } from './gradesDb.js'
import { mapFacultyStudyMaterialRow } from './facultyStudyMaterialsDb.js'
import { mapAssignmentRow } from './assignmentsDb.js'
import { mapActivityRow } from './activitiesDb.js'
import { announcementRowToResponse, ensureAnnouncementsMetadataColumns } from './announcementsDb.js'
import { decryptStudentPiiFields, studentDisplayName } from './studentPiiCrypto.js'

function resolveUploadDiskPath(filePath) {
  const t = String(filePath ?? '').trim()
  if (!t || t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) {
    return null
  }
  let rel = t
  if (t.startsWith('/uploads/')) rel = t.slice('/uploads/'.length)
  else if (t.startsWith('uploads/')) rel = t.slice('uploads/'.length)
  return path.resolve(process.cwd(), 'public', 'uploads', ...rel.split('/').filter(Boolean))
}

export function fileAvailableOnDisk(filePath) {
  const resolved = resolveUploadDiskPath(filePath)
  if (!resolved) return false
  try {
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile()
  } catch {
    return false
  }
}

function attachFileAvailability(row, pathKey = 'file_path', urlKey = 'file_url') {
  const filePath = String(row[pathKey] ?? row[urlKey] ?? '').trim()
  return {
    ...row,
    file_available: filePath ? fileAvailableOnDisk(filePath) : false,
  }
}

function mapStudentProfileRow(row) {
  const decrypted = decryptStudentPiiFields(row)
  const archived_at = decrypted.archived_at ?? null
  const name = studentDisplayName(decrypted)
  return {
    ...decrypted,
    name,
    full_name: name,
    section_name: String(row.section_name ?? '').trim(),
    is_archived: archived_at != null,
    archivedAt: archived_at,
  }
}

function mapAssignmentSubmissionRow(row) {
  const subject =
    String(row.subject_name ?? row.assignment_subject_name ?? '').trim() ||
    (row.subject_id != null ? `Subject #${row.subject_id}` : '—')
  return attachFileAvailability({
    id: row.id != null ? String(row.id) : '',
    assignment_id: row.assignment_id != null ? String(row.assignment_id) : '',
    assignment_title: String(row.assignment_title ?? row.title ?? '').trim() || 'Untitled',
    subject,
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    score: row.score != null ? Number(row.score) : null,
    max_score: row.total_score != null ? Number(row.total_score) : 100,
    status: String(row.status ?? '').trim(),
    submitted_at: row.submitted_at ?? row.created_at ?? null,
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
  })
}

function mapActivitySubmissionRow(row) {
  const subject =
    String(row.subject_name ?? row.activity_subject_name ?? '').trim() ||
    (row.subject_id != null ? `Subject #${row.subject_id}` : '—')
  return attachFileAvailability({
    id: row.id != null ? String(row.id) : '',
    activity_id: row.activity_id != null ? String(row.activity_id) : '',
    activity_title: String(row.activity_title ?? row.title ?? '').trim() || 'Untitled',
    subject,
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    score: row.score != null ? Number(row.score) : null,
    max_score: row.total_score != null ? Number(row.total_score) : 100,
    status: String(row.status ?? '').trim(),
    submitted_at: row.submitted_at ?? row.created_at ?? null,
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
  })
}

function mapQuizSubmissionRow(row) {
  return {
    id: row.id != null ? String(row.id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    quiz_title: String(row.quiz_title ?? row.title ?? '').trim() || 'Untitled',
    subject: String(row.subject ?? '').trim() || '—',
    score: row.score != null ? Number(row.score) : null,
    total_points: row.total_points != null ? Number(row.total_points) : null,
    submitted_at: row.submitted_at ?? row.updated_at ?? null,
  }
}

function mapFacultyAssignmentRow(row) {
  const mapped = mapAssignmentRow(row)
  if (!mapped) return null
  return {
    ...mapped,
    subject_name: mapped.subject_name || '—',
    due_date: mapped.submission_deadline ?? null,
    submissions_count: Number(row.submissions_count ?? 0),
  }
}

function mapFacultyActivityRow(row) {
  const mapped = mapActivityRow(row)
  if (!mapped) return null
  return {
    ...mapped,
    subject_name: mapped.subject_name || '—',
  }
}

function mapFacultyQuizRow(row) {
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : '',
    title: String(row.title ?? '').trim() || 'Untitled',
    subject: String(row.subject ?? '').trim() || '—',
    subject_name: String(row.subject ?? '').trim() || '—',
    grade_level: String(row.grade_level ?? '').trim(),
    total_points: row.total_points != null ? Number(row.total_points) : 0,
    created_at: row.created_at ?? null,
    questions_count: Number(row.questions_count ?? 0),
  }
}

/**
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, message: string }>}
 */
export async function fetchArchivedStudentWork(pool, studentId, { omitStudentPassword }) {
  const sid = Number(studentId)
  if (!Number.isFinite(sid) || sid <= 0) {
    return { ok: false, status: 400, message: 'Invalid student id.' }
  }

  const { rows: studentRows } = await pool.query(
    `
      SELECT s.*, sec.section_name
      FROM students s
      LEFT JOIN sections sec ON sec.id = s.section_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [sid],
  )
  if (!studentRows?.length) {
    return { ok: false, status: 404, message: 'Student not found.' }
  }

  const student = omitStudentPassword(mapStudentProfileRow(studentRows[0]))
  const is_archived = student.archived_at != null

  const [assignRes, actRes, quizRes, grades] = await Promise.all([
    pool.query(
      `
        SELECT asub.*, a.title AS assignment_title, a.subject_id, a.subject_name,
               a.total_score, a.submission_deadline
        FROM assignment_submissions asub
        JOIN assignments a ON a.id = asub.assignment_id
        WHERE asub.student_id = $1
        ORDER BY asub.submitted_at DESC NULLS LAST, asub.updated_at DESC
      `,
      [sid],
    ),
    pool.query(
      `
        SELECT acsub.*, ac.title AS activity_title, ac.subject_id, ac.subject_name,
               ac.total_score
        FROM activity_submissions acsub
        JOIN activities ac ON ac.id = acsub.activity_id
        WHERE acsub.student_id = $1
        ORDER BY acsub.submitted_at DESC NULLS LAST, acsub.updated_at DESC
      `,
      [sid],
    ),
    pool.query(
      `
        SELECT qs.*, q.title AS quiz_title, q.subject, q.total_points
        FROM quiz_submissions qs
        JOIN quizzes q ON q.id = qs.quiz_id
        WHERE qs.student_id = $1
        ORDER BY qs.submitted_at DESC NULLS LAST, qs.updated_at DESC
      `,
      [sid],
    ),
    fetchStudentGrades(pool, sid),
  ])

  const assignment_submissions = (assignRes.rows || []).map(mapAssignmentSubmissionRow)
  const activity_submissions = (actRes.rows || []).map(mapActivitySubmissionRow)
  const quiz_submissions = (quizRes.rows || []).map(mapQuizSubmissionRow)

  return {
    ok: true,
    data: {
      student,
      status: is_archived ? 'archived' : 'active',
      is_archived,
      work: {
        assignment_submissions,
        activity_submissions,
        quiz_submissions,
      },
      grades: {
        overall_avg: grades?.overall_avg ?? null,
        quiz_avg: grades?.quiz_avg ?? null,
        assignment_avg: grades?.assignment_avg ?? null,
        activity_avg: grades?.activity_avg ?? null,
      },
    },
  }
}

/**
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, message: string }>}
 */
export async function fetchArchivedFacultyWork(pool, facultyId, { facultyRowToResponse, FACULTIES_FROM }) {
  const fid = String(facultyId ?? '').trim()
  if (!fid) {
    return { ok: false, status: 400, message: 'Invalid faculty id.' }
  }

  const { rows: facultyRows } = await pool.query(`SELECT * ${FACULTIES_FROM} WHERE id = $1 LIMIT 1`, [fid])
  if (!facultyRows?.length) {
    return { ok: false, status: 404, message: 'Faculty not found.' }
  }

  const faculty = facultyRowToResponse(facultyRows[0])
  const is_archived = facultyRows[0].archived_at != null
  faculty.archived_at = facultyRows[0].archived_at ?? null
  faculty.archivedAt = faculty.archived_at
  faculty.is_archived = is_archived

  await ensureAnnouncementsMetadataColumns(pool)

  const ASSIGNMENT_SELECT = `
    a.id, a.faculty_id, a.title, a.description, a.subject_id,
    a.subject_name AS assignment_subject_name, a.grade_level AS assignment_grade_level,
    a.semester, a.file_path, a.file_name, a.file_size, a.total_score,
    a.submission_deadline, a.uploaded_by, a.created_at, a.updated_at,
    sub.subject_name, sub.subject_code, sub.grade_level,
    (
      SELECT COUNT(*)::int FROM assignment_submissions s
      WHERE s.assignment_id = a.id AND s.status = 'submitted'
    ) AS submissions_count
  `

  const ACTIVITY_SELECT = `
    a.id, a.faculty_id, a.title, a.description, a.subject_id,
    a.subject_name AS activity_subject_name, a.grade_level AS activity_grade_level,
    a.semester, a.file_path, a.file_name, a.file_size, a.total_score,
    a.submission_deadline, a.uploaded_by, a.created_at, a.updated_at,
    sub.subject_name, sub.subject_code, sub.grade_level
  `

  const [assignRes, actRes, matRes, annRes, quizRes] = await Promise.all([
    pool.query(
      `
        SELECT ${ASSIGNMENT_SELECT}
        FROM assignments a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE a.faculty_id::text = $1::text
        ORDER BY a.created_at DESC, a.id DESC
      `,
      [fid],
    ),
    pool.query(
      `
        SELECT ${ACTIVITY_SELECT}
        FROM activities a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE a.faculty_id::text = $1::text
        ORDER BY a.created_at DESC, a.id DESC
      `,
      [fid],
    ),
    pool.query(
      `
        SELECT id, material_name, grade_level, subject, file_name, file_url, file_type, file_size,
               uploaded_by, uploaded_by_name, created_at, updated_at
        FROM study_materials
        WHERE uploaded_by::text = $1::text
        ORDER BY created_at DESC, id DESC
      `,
      [fid],
    ),
    pool.query(
      `
        SELECT id, title, type, message, announcement_image, image_path, image_name,
               uploaded_by, created_at, updated_at
        FROM announcements
        WHERE uploaded_by::text = $1::text
        ORDER BY created_at DESC NULLS LAST, id DESC
      `,
      [fid],
    ),
    pool.query(
      `
        SELECT q.*,
          (
            SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id
          ) AS questions_count
        FROM quizzes q
        WHERE q.created_by::text = $1::text
        ORDER BY q.created_at DESC, q.id DESC
      `,
      [fid],
    ),
  ])

  const assignments = (assignRes.rows || []).map(mapFacultyAssignmentRow).filter(Boolean)
  const activities = (actRes.rows || []).map(mapFacultyActivityRow).filter(Boolean)
  const study_materials = (matRes.rows || [])
    .map((r) => {
      const mapped = mapFacultyStudyMaterialRow(r)
      return mapped ? attachFileAvailability(mapped, 'file_url', 'file_url') : null
    })
    .filter(Boolean)
  const announcements = (annRes.rows || []).map(announcementRowToResponse).filter(Boolean)
  const quizzes = (quizRes.rows || []).map(mapFacultyQuizRow).filter(Boolean)

  return {
    ok: true,
    data: {
      faculty,
      status: is_archived ? 'archived' : 'active',
      is_archived,
      work: {
        assignments,
        activities,
        study_materials,
        announcements,
        quizzes,
      },
      stats: {
        total_assignments: assignments.length,
        total_activities: activities.length,
        total_materials: study_materials.length,
        total_announcements: announcements.length,
        total_quizzes: quizzes.length,
      },
    },
  }
}
