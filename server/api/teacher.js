import { getPgPool, isPgConfigured } from '../pgPool.js'
import {
  decryptStudentPiiFields,
  decryptStudentRows,
  studentDisplayName,
} from '../lib/studentPiiCrypto.js'
import { ensureFacultyTermsColumns, facultyTermsAccepted } from '../lib/facultyTerms.js'
import { isTermsExemptRequest, sendTermsNotAccepted } from '../lib/termsGate.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import fs from 'node:fs'
import path from 'node:path'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { listPublishedCurriculumGuides } from '../lib/curriculumGuidesDb.js'
import {
  enrichSubjectDetailsFields,
  resolveTeacherSubjectSectionName,
} from '../lib/subjectDetailsEnrich.js'
import {
  deleteStudyMaterialFileByUrl,
  guessMaterialFileType,
  saveStudyMaterialFile,
  studyMaterialUploadMiddleware,
  studyMaterialDocumentUploadMiddleware,
  studyMaterialEditUploadMiddleware,
  getStudyMaterialUploadFile,
  validateStudyMaterialUploadFile,
  validateDocumentStudyMaterialUploadFile,
  validateEditDocumentStudyMaterialUploadFile,
  validateSubjectMaterialEditUploadFile,
} from '../lib/studyMaterialStorage.js'
import {
  deleteSyllabusFileByUrl,
  getSyllabusUploadFile,
  saveSyllabusFile,
  syllabusUploadMiddleware,
  validateSyllabusUploadFile,
} from '../lib/syllabusStorage.js'
import {
  sendSubjectSyllabusResponse,
  syllabusDisplayFileName,
} from '../lib/syllabusResponse.js'
import { resolveSubjectImagePath } from '../lib/subjectImageStorage.js'
import {
  announcementRowToResponse,
  ensureAnnouncementsMetadataColumns,
  FACULTY_ANNOUNCEMENT_TYPES,
  maybeDeleteOldAnnouncementFile,
  readAnnouncementBodyFields,
  resolveAnnouncementImageForSave,
} from '../lib/announcementsDb.js'
import {
  assignmentUploadMiddleware,
  deleteAssignmentFileByUrl,
  getAssignmentUploadFile,
  saveAssignmentFile,
  validateAssignmentUploadFile,
  ASSIGNMENT_FILE_SIZE_MSG,
} from '../lib/assignmentStorage.js'
import {
  ASSIGNMENT_SELECT,
  ensureAssignmentsSchema,
  expireUnsubmittedForAssignment,
  fetchAssignmentById,
  fetchAssignmentFormOptions,
  fetchSubmissionsForAssignment,
  mapAssignmentRow,
  mapSubmissionRow,
  refreshSubmissionStudentNames,
  resolveSubjectIdForAssignment,
  seedSubmissionsForGradeLevel,
} from '../lib/assignmentsDb.js'
import { mountTeacherActivitiesRoutes } from './teacherActivitiesRoutes.js'
import { parseRequiredSemester } from '../lib/semesterValidation.js'
import {
  diffRecords,
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import {
  announcementAuditSnapshot,
  assignmentAuditSnapshot,
  buildTargetLabel,
  materialAuditSnapshot,
} from '../lib/teacherAuditSnapshots.js'
import { isDeadlinePassed } from '../lib/studentWorkPortal.js'
import { deleteSubmissionFileByUrl } from '../lib/submissionStorage.js'
import { validateGradeComponentForWork } from '../lib/subjectGradeCriteriaDb.js'

let facultyArchivedColumnMemo = null

async function facultiesHasArchivedAt(pool) {
  if (facultyArchivedColumnMemo != null) return facultyArchivedColumnMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'faculties'
          AND column_name = 'archived_at'
        LIMIT 1
      `,
    )
    facultyArchivedColumnMemo = rows?.length > 0
    return facultyArchivedColumnMemo
  } catch {
    facultyArchivedColumnMemo = false
    return false
  }
}

async function facultyActivePredicate(pool, alias = 'f') {
  const ok = await facultiesHasArchivedAt(pool)
  return ok ? ` AND ${alias}.archived_at IS NULL ` : ''
}

function buildFacultyDisplayName(firstName, middleName, lastName, fallback = '') {
  const composed = [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
  return composed || String(fallback || '').trim()
}

function parseAdvisorySectionsJson(row) {
  if (!row || typeof row !== 'object') return []
  const raw = row.advisory_sections_json ?? row.advisory_sections
  if (Array.isArray(raw)) return raw
  if (raw == null || raw === '') return []
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

function gradeOrdinalForSort(raw) {
  const s = String(raw || '').trim()
  let m = s.match(/^grade\s*(\d+)/i)
  if (m) return Number.parseInt(m[1], 10)
  m = s.match(/^(\d+)$/)
  if (m) return Number.parseInt(m[1], 10)
  return Number.POSITIVE_INFINITY
}

let sectionsArchiveColumnsMemo = null
async function sectionsHasArchiveColumns(pool) {
  if (sectionsArchiveColumnsMemo != null) return sectionsArchiveColumnsMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sections'
          AND column_name IN ('status', 'deleted_at')
      `,
    )
    const cols = new Set((rows || []).map((r) => r.column_name))
    sectionsArchiveColumnsMemo = {
      status: cols.has('status'),
      deleted_at: cols.has('deleted_at'),
    }
    return sectionsArchiveColumnsMemo
  } catch {
    sectionsArchiveColumnsMemo = { status: false, deleted_at: false }
    return sectionsArchiveColumnsMemo
  }
}

async function sectionsActiveFilter(pool, alias = 's') {
  const cols = await sectionsHasArchiveColumns(pool)
  const parts = []
  if (cols.deleted_at) parts.push(`${alias}.deleted_at IS NULL`)
  if (cols.status) parts.push(`(${alias}.status IS NULL OR ${alias}.status != 'archived')`)
  return parts.length ? ` AND ${parts.join(' AND ')} ` : ''
}

async function isSectionActiveById(pool, sectionId) {
  const id = Number(sectionId)
  if (!Number.isFinite(id) || id <= 0) return false
  const filter = await sectionsActiveFilter(pool, 's')
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM sections s WHERE s.id = $1 ${filter} LIMIT 1`,
      [id],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

function normalizeAdvisoryDraft(obj) {
  if (!obj || typeof obj !== 'object') return null
  const pg = Number(obj.postgresSectionId ?? obj.section_id ?? obj.id)
  const idNumeric = Number.isFinite(pg) && pg > 0
  const id = idNumeric ? String(pg) : String(obj.id ?? obj.postgresSectionId ?? '').trim()
  if (!id) return null
  const name = String(obj.name ?? obj.section_name ?? `Section`).trim() || `Section`
  let grade_level = String(obj.grade_level ?? obj.grade ?? '').trim()
  if (!grade_level) grade_level = '—'
  return {
    id,
    name,
    grade_level,
    postgresSectionId: idNumeric ? pg : null,
  }
}

async function fetchAdvisoryFromJunction(pool, facultyNumericId) {
  if (!Number.isFinite(facultyNumericId) || facultyNumericId <= 0) return []
  try {
    const activeFilter = await sectionsActiveFilter(pool, 's')
    const { rows } = await pool.query(
      `
      SELECT s.id AS id, s.section_name, s.grade_level
      FROM sections s
      INNER JOIN faculty_sections fs ON fs.section_id = s.id
      WHERE fs.faculty_id = $1
      ${activeFilter}
      ORDER BY s.grade_level ASC NULLS LAST, s.section_name ASC
      `,
      [facultyNumericId],
    )
    return rows || []
  } catch {
    return []
  }
}

async function countStudentsBySectionIds(pool, sectionIds) {
  const ids = [...new Set(sectionIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
  if (!ids.length) return new Map()

  const hasStatus = await studentsHasStatusColumn(pool)
  const statusSql = hasStatus
    ? " AND (LOWER(TRIM(st.status::text)) = 'active' OR st.status IS NULL) "
    : ''

  const buildMap = (rows) => {
    const m = new Map()
    for (const r of rows || []) {
      const sid = Number(r.sid)
      if (!Number.isFinite(sid)) continue
      m.set(sid, Number(r.cnt) || 0)
    }
    return m
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT st.section_id::int AS sid, COUNT(*)::int AS cnt
      FROM students st
      WHERE st.section_id = ANY($1::int[])
        AND st.archived_at IS NULL
        ${statusSql}
      GROUP BY st.section_id
      `,
      [ids],
    )
    return buildMap(rows)
  } catch {
    try {
      const { rows } = await pool.query(
        `
        SELECT st.section_id::int AS sid, COUNT(*)::int AS cnt
        FROM students st
        WHERE st.section_id = ANY($1::int[])
        ${statusSql}
        GROUP BY st.section_id
        `,
        [ids],
      )
      return buildMap(rows)
    } catch {
      return new Map()
    }
  }
}

async function fetchAdvisoryFromJunctionByText(pool, facultyIdStr) {
  try {
    const activeFilter = await sectionsActiveFilter(pool, 's')
    const { rows } = await pool.query(
      `
      SELECT s.id AS id, s.section_name, s.grade_level
      FROM sections s
      INNER JOIN faculty_sections fs ON fs.section_id = s.id
      WHERE fs.faculty_id::text = $1
      ${activeFilter}
      ORDER BY s.grade_level ASC NULLS LAST, s.section_name ASC
      `,
      [facultyIdStr],
    )
    return rows || []
  } catch {
    return []
  }
}

/**
 * Internal section rows (supports counts + student lists). `postgresSectionId`
 * is omitted from public profile JSON but used server-side.
 */
async function collectAdvisorySectionDrafts(pool, facultyRow) {
  if (!facultyRow?.id || !pool) return []

  const facultyIdStr = String(facultyRow.id).trim()
  const facultyPkNum = Number(facultyIdStr)

  let drafts = []

  if (Number.isFinite(facultyPkNum) && facultyPkNum > 0) {
    const joinRows = await fetchAdvisoryFromJunction(pool, facultyPkNum)
    drafts = (joinRows || []).map((r) => ({
      id: String(r.id),
      name: String(r.section_name ?? '').trim() || `Section ${r.id}`,
      grade_level: String(r.grade_level ?? '').trim() || '—',
      postgresSectionId: Number(r.id),
    }))
  }

  if (!drafts.length) {
    const textJoined = await fetchAdvisoryFromJunctionByText(pool, facultyIdStr)
    drafts = (textJoined || []).map((r) => ({
      id: String(r.id),
      name: String(r.section_name ?? '').trim() || `Section ${r.id}`,
      grade_level: String(r.grade_level ?? '').trim() || '—',
      postgresSectionId: Number(r.id),
    }))
  }

  if (!drafts.length) {
    for (const item of parseAdvisorySectionsJson(facultyRow)) {
      const n = normalizeAdvisoryDraft(item)
      if (!n) continue
      if (n.postgresSectionId != null) {
        const active = await isSectionActiveById(pool, n.postgresSectionId)
        if (!active) continue
      }
      drafts.push(n)
    }
  }

  const seen = new Set()
  const unique = []
  for (const d of drafts) {
    const key = d.postgresSectionId != null ? `n:${d.postgresSectionId}` : `t:${d.id}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(d)
  }

  unique.sort((a, b) => {
    const ga = gradeOrdinalForSort(a.grade_level)
    const gb = gradeOrdinalForSort(b.grade_level)
    if (ga !== gb) return ga - gb
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      sensitivity: 'base',
    })
  })

  return unique
}

async function resolveAdvisorySectionsForTeacher(pool, facultyRow) {
  const unique = await collectAdvisorySectionDrafts(pool, facultyRow)
  const pgIds = unique.map((d) => d.postgresSectionId).filter((n) => Number.isFinite(n) && n > 0)

  const counts =
    pgIds.length > 0 ? await countStudentsBySectionIds(pool, pgIds).catch(() => new Map()) : new Map()

  return unique.map((d) => ({
    id: d.id,
    name: d.name,
    grade_level: d.grade_level,
    total_students:
      d.postgresSectionId != null && counts.has(d.postgresSectionId)
        ? counts.get(d.postgresSectionId) ?? 0
        : Number(d.student_count ?? d.total_students ?? d.students ?? 0) || 0,
  }))
}

let studentsArchivedColumnMemo = null
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

let studentsStatusColumnMemo = null
async function studentsHasStatusColumn(pool) {
  if (studentsStatusColumnMemo != null) return studentsStatusColumnMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'status'
        LIMIT 1
      `,
    )
    studentsStatusColumnMemo = rows?.length > 0
    return studentsStatusColumnMemo
  } catch {
    studentsStatusColumnMemo = false
    return false
  }
}

async function fetchStudentsRowsForSection(pool, sectionPgId) {
  const sid = Number(sectionPgId)
  if (!Number.isFinite(sid) || sid <= 0) return []

  const archive = await studentsHasArchivedAt(pool)
  const hasStatus = await studentsHasStatusColumn(pool)
  let sqlActive = `
    SELECT st.*
    FROM students st
    WHERE st.section_id = $1
  `
  if (archive) sqlActive += ' AND st.archived_at IS NULL '
  if (hasStatus) sqlActive += " AND (LOWER(TRIM(st.status::text)) = 'active' OR st.status IS NULL) "

  let rows
  try {
    rows = (
      await pool.query(
        `${sqlActive} ORDER BY COALESCE(lower(st.last_name), ''), COALESCE(lower(st.first_name), ''), st.id`,
        [sid],
      )
    )?.rows
  } catch {
    rows =
      (
        await pool.query(
          `SELECT st.* FROM students st WHERE st.section_id = $1 ORDER BY COALESCE(lower(st.last_name), ''), COALESCE(lower(st.first_name), ''), st.id`,
          [sid],
        )
      )?.rows
  }

  return Array.isArray(rows) ? decryptStudentRows(rows) : []
}

function pickStudentText(row, ...keys) {
  for (const key of keys) {
    const v = row?.[key]
    if (v == null) continue
    const s = String(v).trim()
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') continue
    return s
  }
  return ''
}

/** Pass through YYYY-MM-DD from TO_CHAR — never String(Date) which shifts by timezone. */
function rawPgDateString(value) {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    return m ? m[1] : value.trim() || undefined
  }
  return undefined
}

/**
 * Map DB row → Faculty UI student object.
 * Faculty advisory views exclude PII (contact, address, DOB, email, parent info) per RA 10173 minimum-necessary access.
 */
function studentRowForTeacherUi(row, sectionMeta = {}) {
  if (!row) return null
  const idStr = row.id != null ? String(row.id) : ''
  const enrollment_no = pickStudentText(row, 'enrollment_no', 'enrollmentNo') || undefined
  const roll_no = pickStudentText(row, 'roll_no', 'rollNo') || undefined
  const semester = pickStudentText(row, 'semester') || undefined
  const sectionName =
    String(sectionMeta.section_name ?? sectionMeta.name ?? row.section_name ?? '').trim() || undefined
  const fullName = [row.first_name, row.middle_name, row.last_name]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ')
  const staleFullName = pickStudentText(row, 'full_name', 'fullName')
  const safeFullName =
    staleFullName && !staleFullName.includes('enc:v1:') ? staleFullName : ''
  const apiFullName = studentDisplayName(row) || fullName || safeFullName || pickStudentText(row, 'name')
  return {
    id: idStr,
    first_name: String(row.first_name ?? '').trim(),
    middle_name: String(row.middle_name ?? '').trim(),
    last_name: String(row.last_name ?? '').trim(),
    full_name: apiFullName || undefined,
    name: apiFullName || undefined,
    enrollment_no,
    /** Display id alias — enrollment only; never fall back to login_id (avoids "CHECK" login ids). */
    student_id: enrollment_no,
    roll_no,
    grade_level: pickStudentText(row, 'grade_level', 'gradeLevel', 'grade') || undefined,
    semester,
    section: sectionName,
    section_name: sectionName,
    gender: pickStudentText(row, 'gender') || null,
    status: pickStudentText(row, 'status') || 'active',
    photo_url: String(row.photo_url ?? row.photo_data_url ?? '').trim() || undefined,
    access_scope: 'faculty_advisory_roster',
  }
}

async function collectAdvisoryPostgresSectionIds(pool, facultyRow) {
  const drafts = await collectAdvisorySectionDrafts(pool, facultyRow)
  return drafts
    .map((d) => d.postgresSectionId)
    .filter((n) => Number.isFinite(n) && n > 0)
}

async function teacherCanAccessStudent(pool, facultyRow, studentIdRaw) {
  const idText = String(studentIdRaw ?? '').trim()
  if (!idText) return false

  /** Match advisory roster — if student appears in section list, allow profile view */
  const sections = await buildAdvisorySectionsPayloadWithStudents(pool, facultyRow)
  for (const sec of sections) {
    for (const st of sec.students || []) {
      if (String(st.id) === idText) return true
    }
  }

  const sectionIds = await collectAdvisoryPostgresSectionIds(pool, facultyRow)
  if (!sectionIds.length) return false
  const archive = await studentsHasArchivedAt(pool)
  let sql = `
    SELECT 1 FROM students st
    WHERE st.id::text = $1
      AND st.section_id = ANY($2::int[])
  `
  if (archive) sql += ' AND st.archived_at IS NULL '
  sql += ' LIMIT 1'
  const { rows } = await pool.query(sql, [idText, sectionIds])
  return rows?.length > 0
}

async function fetchStudentDetailForTeacher(pool, facultyRow, studentIdRaw) {
  const idText = String(studentIdRaw ?? '').trim()
  if (!idText) return null
  const allowed = await teacherCanAccessStudent(pool, facultyRow, idText)
  if (!allowed) return null

  const archive = await studentsHasArchivedAt(pool)
  let sql = `
    SELECT
      st.id,
      st.first_name,
      st.middle_name,
      st.last_name,
      st.enrollment_no,
      st.grade_level,
      st.semester,
      st.roll_no,
      st.section_id,
      sec.section_name AS section_name
    FROM students st
    LEFT JOIN sections sec ON sec.id = st.section_id
    WHERE st.id::text = $1
  `
  if (archive) sql += ' AND st.archived_at IS NULL '
  sql += ' LIMIT 1'

  const { rows } = await pool.query(sql, [idText])
  const row = decryptStudentPiiFields(rows?.[0])
  if (!row) return null

  const mapped = studentRowForTeacherUi(row, { section_name: row.section_name })
  return {
    ...mapped,
    section_id: row.section_id != null ? String(row.section_id) : undefined,
  }
}

async function buildAdvisorySectionsPayloadWithStudents(pool, facultyRow) {
  const drafts = await collectAdvisorySectionDrafts(pool, facultyRow)

  let sectionColSet = null
  try {
    const { rows } = await pool.query(
      `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sections'
      `,
    )
    sectionColSet = new Set((rows || []).map((r) => r.column_name))
  } catch {
    sectionColSet = new Set(['id', 'section_name', 'grade_level'])
  }

  const sel = [`s.id AS id`, `s.section_name AS section_name`, `s.grade_level AS grade_level`]
  if (sectionColSet.has('school_year')) sel.push('s.school_year AS school_year')
  else sel.push(`NULL::text AS school_year`)
  if (sectionColSet.has('strand')) sel.push(`s.strand AS strand`)
  else sel.push(`NULL::text AS strand`)
  if (sectionColSet.has('room_number')) sel.push(`s.room_number AS room_number`)
  else sel.push(`NULL::text AS room_number`)

  const activeFilter = await sectionsActiveFilter(pool, 's')
  const out = []
  for (const d of drafts) {
    const pg = d.postgresSectionId
    if (!Number.isFinite(pg) || pg <= 0) {
      continue
    }

    let sr = {}
    try {
      const { rows: srows } = await pool.query(
        `SELECT ${sel.join(', ')} FROM sections s WHERE s.id = $1 ${activeFilter} LIMIT 1`,
        [pg],
      )
      sr = srows?.[0] || {}
    } catch {
      try {
        const { rows: srows2 } = await pool.query(
          `SELECT id, section_name, grade_level FROM sections s WHERE s.id = $1 ${activeFilter} LIMIT 1`,
          [pg],
        )
        const r0 = srows2?.[0] || {}
        sr = { ...r0, school_year: null, strand: null, room_number: null }
      } catch {
        sr = {}
      }
    }

    if (!sr?.id) continue

    const sectionName = String(sr.section_name ?? '').trim() || d.name
    const gradeLvl = String(sr.grade_level ?? '').trim() || d.grade_level

      const studentRowsRaw = await fetchStudentsRowsForSection(pool, pg)
      const students = studentRowsRaw
        .map((r) => studentRowForTeacherUi(r, { section_name: sectionName, name: sectionName }))
        .filter(Boolean)

    out.push({
      id: String(pg),
      name: sectionName,
      grade_level: gradeLvl || '—',
      school_year: sr.school_year != null ? String(sr.school_year) : null,
      strand: sr.strand != null ? String(sr.strand) : null,
      room_number: sr.room_number != null ? String(sr.room_number) : null,
      total_students: students.length,
      students,
    })
  }

  return out
}

async function fetchFacultyRowForSession(pool, user) {
  const uid = String(user?.id || '').trim()
  const email = String(user?.email || '').trim().toLowerCase()
  const username = String(user?.username || '').trim()

  const active = await facultyActivePredicate(pool)

  const { rows } = await pool.query(
    `
    SELECT f.*
    FROM public.faculties f
    WHERE 1=1 ${active}
    AND (
      f.auth_user_id = $1
      OR lower(trim(coalesce(f.email, ''))) = lower(trim(coalesce($2::text, '')))
      OR ($3 <> ''
        AND (
          lower(trim(coalesce(f.faculty_username, ''))) = lower(trim($3::text))
          OR lower(trim(coalesce(f.faculty_code, ''))) = lower(trim($3::text))
          OR lower(trim(coalesce(f.employee_id, ''))) = lower(trim($3::text))
        )
      )
    )
    ORDER BY
      CASE
        WHEN f.auth_user_id = $1 THEN 0
        WHEN lower(trim(coalesce(f.email, ''))) = lower(trim(coalesce($2::text, ''))) THEN 1
        ELSE 2
      END
    LIMIT 1
    `,
    [uid, email, username],
  )
  return rows[0] || null
}

async function requireFacultyOrTeacherSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const u =
      session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
    if (!u?.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Faculty dashboard access requires teacher/faculty role',
        requiredRole: 'faculty',
      })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    if (!isTermsExemptRequest(req)) {
      const pool = getPgPool()
      if (pool) {
        await ensureFacultyTermsColumns(pool)
        const facultyRow = await fetchFacultyRowForSession(pool, u)
        if (facultyRow && !facultyTermsAccepted(facultyRow)) {
          sendTermsNotAccepted(res, 'faculty portal')
          return null
        }
      }
    }
    return session
  } catch (e) {
    sendSafeServerError(res, e, 'teacher session gate')
    return null
  }
}

function facultyRowToTeacherProfilePayload(row) {
  if (!row || typeof row !== 'object') return null
  const first_name = String(row.first_name ?? '').trim()
  const last_name = String(row.last_name ?? '').trim()
  const middle_name = String(row.middle_name ?? '').trim()
  const name =
    buildFacultyDisplayName(first_name, middle_name, last_name, '') ||
    String(row.name ?? '').trim() ||
    buildFacultyDisplayName(first_name, middle_name, last_name, 'Faculty')
  const faculty_code =
    String(row.faculty_code ?? '').trim() ||
    String(row.employee_id ?? '').trim() ||
    String(row.faculty_username ?? '').trim() ||
    ''
  const employee_id =
    String(row.employee_id ?? '').trim() ||
    String(row.faculty_code ?? '').trim() ||
    String(row.faculty_username ?? '').trim() ||
    ''
  const specialization =
    String(row.specialization ?? '').trim() ||
    String(row.qualification ?? '').trim() ||
    String(row.qualification_title ?? '').trim() ||
    ''

  const photoData = String(row.photo_data_url || '').trim()
  const photoPath = String(row.photo_url || '').trim()
  const photo_url = photoData.startsWith('data:') ? photoData : photoPath || photoData
  const grade_level = String(row.grade_level || row.grade || '').trim()

  return {
    name,
    first_name,
    middle_name,
    last_name,
    employee_id,
    faculty_code,
    faculty_username: String(row.faculty_username ?? '').trim() || faculty_code,
    photo_url,
    grade_level,
    specialization,
    contact_number:
      String(row.contact_number ?? '').trim() ||
      String(row.contact_no ?? '').trim() ||
      '',
    email: String(row.email ?? '').trim().toLowerCase(),
    faculty_row_id: String(row.id ?? '').trim(),
  }
}

/** Ensures aggregate tables used by GET /teacher/dashboard-stats exist. */
async function ensureTeacherDashboardAggregateTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id BIGSERIAL PRIMARY KEY,
      faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_faculty_id ON public.assignments (faculty_id)`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id BIGSERIAL PRIMARY KEY,
      faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_activities_faculty_id ON public.activities (faculty_id)`)
}

let studyMaterialsTableMemo = null
let subjectMaterialsTableMemo = null

async function subjectMaterialsTableExists(pool) {
  if (subjectMaterialsTableMemo != null) return subjectMaterialsTableMemo
  try {
    const { rows } = await pool.query(
      `
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'subject_materials'
      LIMIT 1
      `,
    )
    subjectMaterialsTableMemo = rows?.length > 0
    return subjectMaterialsTableMemo
  } catch {
    subjectMaterialsTableMemo = false
    return false
  }
}

async function ensureSubjectMaterialColumns(pool) {
  try {
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS unit_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS material_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_semester VARCHAR(16)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_path TEXT`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_name VARCHAR(512)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_size BIGINT`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_type VARCHAR(64)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)
  } catch {
    /* ignore */
  }
}

async function ensureSubjectMaterialsTable(pool) {
  if (await subjectMaterialsTableExists(pool)) {
    await ensureSubjectMaterialColumns(pool)
    return true
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subject_materials (
        id SERIAL PRIMARY KEY,
        subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        unit_no INT NOT NULL DEFAULT 1,
        unit_name VARCHAR(255),
        material_name VARCHAR(255),
        subject_semester VARCHAR(16),
        subject_name VARCHAR(255),
        grade_level VARCHAR(128),
        file_path TEXT NOT NULL,
        file_name VARCHAR(512),
        file_size BIGINT,
        file_type VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_subject_materials_subject_id ON subject_materials (subject_id)`,
    )
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_subject_materials_subject_unit ON subject_materials (subject_id, unit_no)`,
    )
    subjectMaterialsTableMemo = true
    await ensureSubjectMaterialColumns(pool)
    return true
  } catch {
    return false
  }
}

async function studyMaterialsTableExists(pool) {
  if (studyMaterialsTableMemo != null) return studyMaterialsTableMemo
  try {
    const { rows } = await pool.query(
      `
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'study_materials'
      LIMIT 1
      `,
    )
    studyMaterialsTableMemo = rows?.length > 0
    return studyMaterialsTableMemo
  } catch {
    studyMaterialsTableMemo = false
    return false
  }
}

async function ensureStudyMaterialColumns(pool) {
  try {
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS file_name VARCHAR(512)`)
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS file_size BIGINT`)
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128)`)
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS subject VARCHAR(128)`)
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(64)`)
    await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255)`)
    await pool.query(
      `ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    )
    try {
      await pool.query(`ALTER TABLE study_materials ALTER COLUMN subject_id DROP NOT NULL`)
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

async function ensureStudyMaterialsTable(pool) {
  if (await studyMaterialsTableExists(pool)) {
    await ensureStudyMaterialColumns(pool)
    return true
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS study_materials (
        id SERIAL PRIMARY KEY,
        subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
        unit_no VARCHAR(32) NOT NULL DEFAULT '1',
        unit_name VARCHAR(255),
        material_name VARCHAR(255),
        file_url TEXT,
        file_type VARCHAR(64),
        file_name VARCHAR(512),
        file_size BIGINT,
        semester VARCHAR(16),
        grade_level VARCHAR(128),
        subject VARCHAR(128),
        uploaded_by VARCHAR(64),
        uploaded_by_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_study_materials_subject_id ON study_materials (subject_id)`,
    )
    studyMaterialsTableMemo = true
    await ensureStudyMaterialColumns(pool)
    return true
  } catch {
    return false
  }
}

function teacherSubjectSyllabusFileUrl(subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return ''
  return `/api/teacher/subjects/${sid}/syllabus-file`
}

function mapTeacherSubjectRow(row, extras = {}) {
  if (!row) return null
  const syllabusRaw = String(row.syllabus_url ?? row.syllabus_pdf ?? '').trim()
  const code = String(row.subject_code ?? '').trim()
  const subjectName = String(row.subject_name ?? '').trim()
  const storedCover = String(row.cover_image_url ?? '').trim()
  const cover_image_url = storedCover || resolveSubjectImagePath(subjectName)
  const base = {
    id: row.id != null ? String(row.id) : '',
    subject_name: subjectName,
    subject_code: code,
    grade_level: String(row.grade_level ?? '').trim(),
    semester: row.semester != null ? String(row.semester).trim() : '',
    cover_image_url,
    subject_photo: cover_image_url,
    faculty_name: String(row.faculty_name ?? '').trim(),
    assignedFacultyName: String(row.faculty_name ?? '').trim(),
    faculty_code:
      String(row.faculty_code ?? row.employee_id ?? '').trim() ||
      String(extras.faculty_code ?? '').trim(),
    created_at: row.created_at ?? null,
    syllabus_url: syllabusRaw,
    syllabus_pdf: syllabusRaw,
    syllabus_file_name: syllabusDisplayFileName(syllabusRaw, code),
    section_name: String(extras.section_name ?? '').trim() || '—',
  }
  return enrichSubjectDetailsFields(base, extras)
}

function mapTeacherMaterialRow(row) {
  if (!row) return null
  const file_url = String(row.file_url ?? row.file_path ?? '').trim()
  if (!file_url) return null
  const material_name = String(
    row.material_name ?? row.title ?? row.unit_name ?? row.file_name ?? 'Untitled Material',
  ).trim() || 'Untitled Material'
  const file_name = String(row.file_name ?? material_name ?? 'file').trim()
  return {
    id: row.id != null ? String(row.id) : '',
    unit_no: String(row.unit_no ?? '1').trim() || '1',
    unit_name: String(row.unit_name ?? material_name ?? '').trim() || material_name,
    material_name,
    title: String(row.title ?? material_name).trim() || material_name,
    file_name,
    file_url,
    file_type: String(row.file_type ?? '').trim() || 'application/pdf',
    file_size: row.file_size != null ? Number(row.file_size) : null,
    description: String(row.description ?? '').trim(),
    semester: String(row.semester ?? row.subject_semester ?? '').trim(),
    created_at: row.created_at ?? null,
    is_admin_syllabus: Boolean(row.is_admin_syllabus),
    source_table: String(row.source_table ?? 'subject_materials').trim(),
  }
}

const MATERIAL_SELECT_FIELDS = `
  id,
  unit_no::text AS unit_no,
  unit_name,
  COALESCE(
    NULLIF(TRIM(material_name), ''),
    NULLIF(TRIM(unit_name), ''),
    NULLIF(TRIM(file_name), ''),
    'Untitled Material'
  ) AS material_name,
  file_path AS file_url,
  file_type,
  subject_semester AS semester,
  created_at,
  file_name,
  file_size,
  NULL::text AS description,
  COALESCE(
    NULLIF(TRIM(material_name), ''),
    NULLIF(TRIM(unit_name), ''),
    NULLIF(TRIM(file_name), ''),
    'Untitled Material'
  ) AS title
`

const STUDY_MATERIAL_SELECT_FIELDS = `
  id,
  COALESCE(NULLIF(TRIM(unit_no::text), ''), '1') AS unit_no,
  COALESCE(
    NULLIF(TRIM(unit_name), ''),
    NULLIF(TRIM(material_name), ''),
    NULLIF(TRIM(file_name), ''),
    'Untitled Material'
  ) AS unit_name,
  COALESCE(
    NULLIF(TRIM(material_name), ''),
    NULLIF(TRIM(file_name), ''),
    'Untitled Material'
  ) AS material_name,
  file_url,
  file_type,
  semester,
  created_at,
  file_name,
  file_size,
  NULL::text AS description,
  COALESCE(
    NULLIF(TRIM(material_name), ''),
    NULLIF(TRIM(file_name), ''),
    'Untitled Material'
  ) AS title
`

async function fetchSubjectRowBrief(pool, subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return null
  const { rows } = await pool.query(
    `SELECT id, subject_code, subject_name, grade_level, faculty_id FROM subjects WHERE id = $1 LIMIT 1`,
    [sid],
  )
  return rows?.[0] || null
}

async function appendStudyMaterialsForSubject(pool, subjectId, subjectRow, pushMaterial) {
  if (!(await studyMaterialsTableExists(pool))) return
  await ensureStudyMaterialColumns(pool)
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return

  const runQuery = async (sql, params) => {
    const { rows } = await pool.query(sql, params)
    for (const r of rows || []) {
      pushMaterial({ ...r, source_table: 'study_materials' })
    }
  }

  await runQuery(
    `
    SELECT ${STUDY_MATERIAL_SELECT_FIELDS}
    FROM study_materials
    WHERE subject_id = $1
    ORDER BY created_at DESC, id DESC
    `,
    [sid],
  )

  if (!subjectRow) return
  const facultyId = String(subjectRow.faculty_id ?? '').trim()
  if (!facultyId) return

  await runQuery(
    `
    SELECT ${STUDY_MATERIAL_SELECT_FIELDS}
    FROM study_materials
    WHERE subject_id IS NULL
      AND uploaded_by::text = $1::text
      AND (
        COALESCE(TRIM(subject), '') IN ($2, $3)
        OR (
          COALESCE(TRIM(grade_level), '') <> ''
          AND grade_level = $4
          AND (
            COALESCE(TRIM(subject), '') = ''
            OR subject IN ($2, $3)
          )
        )
      )
    ORDER BY created_at DESC, id DESC
    `,
    [
      facultyId,
      String(subjectRow.subject_code ?? '').trim(),
      String(subjectRow.subject_name ?? '').trim(),
      String(subjectRow.grade_level ?? '').trim(),
    ],
  )
}

function inferSyllabusFileType(syllabusRaw) {
  const t = String(syllabusRaw || '').trim().toLowerCase()
  if (!t) return 'application/pdf'
  if (t.startsWith('data:')) {
    if (t.includes('pdf')) return 'application/pdf'
    if (t.includes('wordprocessingml') || t.includes('msword')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    return 'application/pdf'
  }
  if (t.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (t.endsWith('.doc')) return 'application/msword'
  return 'application/pdf'
}

function inferUnitNameFromSyllabus(fileName) {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim()
  if (base) return base.toUpperCase()
  return 'LESSON 1'
}

async function appendAdminSyllabusMaterial(pool, subjectId, out, seenUrls, pushMaterial) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return
  try {
    const { rows: subRows } = await pool.query(
      `SELECT syllabus_pdf, subject_code, subject_name FROM subjects WHERE id = $1 LIMIT 1`,
      [sid],
    )
    const row = subRows?.[0]
    const syllabusRaw = String(row?.syllabus_pdf ?? '').trim()
    if (!syllabusRaw) return

    const code = String(row?.subject_code ?? '').trim()
    const fileName = syllabusDisplayFileName(syllabusRaw, code)
    pushMaterial({
      id: `admin-syllabus-${sid}`,
      unit_no: '1',
      unit_name: inferUnitNameFromSyllabus(fileName),
      material_name: fileName,
      title: fileName,
      file_url: teacherSubjectSyllabusFileUrl(sid),
      file_name: fileName,
      file_type: inferSyllabusFileType(syllabusRaw),
      file_size: null,
      semester: '',
      created_at: null,
      description: '',
      is_admin_syllabus: true,
    })
  } catch (e) {
    console.warn('[teacher] appendAdminSyllabusMaterial:', e?.message || e)
  }
}

async function publicTableExists(pool, tableName) {
  try {
    const { rows } = await pool.query(
      `
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1
      `,
      [tableName],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

/** subject_materials + study_materials rows plus admin syllabus from subjects.syllabus_pdf. */
async function fetchTeacherSubjectMaterials(pool, subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return []

  const out = []
  const seenUrls = new Set()

  const pushMaterial = (row) => {
    const mapped = mapTeacherMaterialRow(row)
    if (!mapped || seenUrls.has(mapped.file_url)) return
    seenUrls.add(mapped.file_url)
    out.push(mapped)
  }

  const subjectRow = await fetchSubjectRowBrief(pool, sid)

  await appendAdminSyllabusMaterial(pool, subjectId, out, seenUrls, pushMaterial)

  if (await ensureSubjectMaterialsTable(pool)) {
    try {
      const { rows } = await pool.query(
        `
        SELECT ${MATERIAL_SELECT_FIELDS}
        FROM subject_materials
        WHERE subject_id = $1
        ORDER BY unit_no ASC, id ASC
        `,
        [sid],
      )
      for (const r of rows || []) pushMaterial({ ...r, source_table: 'subject_materials' })
    } catch {
      /* ignore */
    }
  }

  await appendStudyMaterialsForSubject(pool, sid, subjectRow, pushMaterial)

  return out
}

async function teacherOwnsMaterial(pool, facultyId, materialId) {
  const mid = Number(materialId)
  if (!Number.isFinite(mid) || mid <= 0) return false
  const fid = String(facultyId ?? '').trim()
  if (!fid) return false

  if (await ensureSubjectMaterialsTable(pool)) {
    try {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM subject_materials m
        INNER JOIN subjects s ON s.id = m.subject_id
        WHERE m.id = $1 AND s.faculty_id::text = $2::text
        LIMIT 1
        `,
        [mid, fid],
      )
      if (rows?.length > 0) return true
    } catch {
      /* ignore */
    }
  }

  if (await studyMaterialsTableExists(pool)) {
    try {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM study_materials m
        WHERE m.id = $1 AND m.uploaded_by::text = $2::text
        LIMIT 1
        `,
        [mid, fid],
      )
      if (rows?.length > 0) return true
    } catch {
      /* ignore */
    }
  }

  return false
}

async function fetchStudyMaterialById(pool, materialId) {
  const mid = Number(materialId)
  if (!Number.isFinite(mid) || mid <= 0) return null

  if (await ensureSubjectMaterialsTable(pool)) {
    const { rows } = await pool.query(
      `
      SELECT
        m.id,
        m.subject_id,
        m.unit_no::text AS unit_no,
        m.unit_name,
        COALESCE(
          NULLIF(TRIM(m.material_name), ''),
          NULLIF(TRIM(m.unit_name), ''),
          NULLIF(TRIM(m.file_name), ''),
          'Untitled Material'
        ) AS material_name,
        m.file_path AS file_url,
        m.file_type,
        m.file_name,
        m.file_size,
        m.subject_semester AS semester,
        m.created_at,
        COALESCE(NULLIF(TRIM(m.subject_name), ''), s.subject_name) AS subject_name,
        s.subject_code,
        COALESCE(NULLIF(TRIM(m.grade_level), ''), s.grade_level) AS grade_level,
        'subject_materials'::text AS source_table
      FROM subject_materials m
      INNER JOIN subjects s ON s.id = m.subject_id
      WHERE m.id = $1
      LIMIT 1
      `,
      [mid],
    )
    const row = rows?.[0]
    if (row) {
      const mapped = mapTeacherMaterialRow(row)
      if (!mapped) return null
      return {
        ...mapped,
        subject_id: String(row.subject_id),
        subject_name: String(row.subject_name ?? '').trim(),
        subject_code: String(row.subject_code ?? '').trim(),
        grade_level: String(row.grade_level ?? '').trim(),
      }
    }
  }

  if (await studyMaterialsTableExists(pool)) {
    await ensureStudyMaterialColumns(pool)
    const { rows } = await pool.query(
      `
      SELECT
        m.id,
        m.subject_id,
        COALESCE(NULLIF(TRIM(m.unit_no::text), ''), '1') AS unit_no,
        COALESCE(
          NULLIF(TRIM(m.unit_name), ''),
          NULLIF(TRIM(m.material_name), ''),
          NULLIF(TRIM(m.file_name), ''),
          'Untitled Material'
        ) AS unit_name,
        COALESCE(
          NULLIF(TRIM(m.material_name), ''),
          NULLIF(TRIM(m.file_name), ''),
          'Untitled Material'
        ) AS material_name,
        m.file_url,
        m.file_type,
        m.file_name,
        m.file_size,
        m.semester,
        m.created_at,
        COALESCE(NULLIF(TRIM(m.subject), ''), s.subject_name) AS subject_name,
        s.subject_code,
        COALESCE(NULLIF(TRIM(m.grade_level), ''), s.grade_level) AS grade_level,
        'study_materials'::text AS source_table
      FROM study_materials m
      LEFT JOIN subjects s ON s.id = m.subject_id
      WHERE m.id = $1
      LIMIT 1
      `,
      [mid],
    )
    const row = rows?.[0]
    if (row) {
      const mapped = mapTeacherMaterialRow(row)
      if (!mapped) return null
      return {
        ...mapped,
        subject_id: row.subject_id != null ? String(row.subject_id) : '',
        subject_name: String(row.subject_name ?? row.subject ?? '').trim(),
        subject_code: String(row.subject_code ?? row.subject ?? '').trim(),
        grade_level: String(row.grade_level ?? '').trim(),
      }
    }
  }

  return null
}

async function deleteTeacherMaterialById(pool, materialId) {
  const mid = Number(materialId)
  if (!Number.isFinite(mid) || mid <= 0) return null
  const existing = await fetchStudyMaterialById(pool, mid)
  if (!existing) return null
  const table = existing.source_table === 'study_materials' ? 'study_materials' : 'subject_materials'
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [mid])
  if (existing.file_url) deleteStudyMaterialFileByUrl(existing.file_url)
  return existing
}

async function updateTeacherSubjectFields(pool, subjectId, facultyId, fields) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return
  const fid = String(facultyId ?? '').trim()
  const subject_name = String(fields?.subject_name ?? '').trim()
  const grade_level = String(fields?.grade_level ?? fields?.gradeLevel ?? '').trim()
  const semester = String(fields?.semester ?? '').trim()
  if (!subject_name && !grade_level && !semester) return
  await pool.query(
    `
    UPDATE subjects
    SET
      subject_name = CASE WHEN $1 <> '' THEN $1 ELSE subject_name END,
      grade_level = CASE WHEN $2 <> '' THEN $2 ELSE grade_level END,
      semester = CASE WHEN $3 <> '' THEN $3 ELSE semester END
    WHERE id = $4 AND faculty_id::text = $5::text
    `,
    [subject_name, grade_level, semester, sid, fid],
  )
}

async function teacherOwnsSubject(pool, facultyId, subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return false
  const fid = String(facultyId ?? '').trim()
  if (!fid) return false
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM subjects WHERE id = $1 AND faculty_id::text = $2::text LIMIT 1`,
      [sid, fid],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

const TEACHER_SUBJECT_SELECT = `
  sub.id,
  sub.subject_name,
  sub.subject_code,
  sub.grade_level,
  sub.semester,
  sub.faculty_id,
  sub.subject_photo AS cover_image_url,
  sub.syllabus_pdf AS syllabus_url,
  sub.syllabus_pdf,
  COALESCE(
    NULLIF(trim(concat_ws(' ',
      nullif(trim(f.first_name), ''),
      nullif(trim(f.middle_name), ''),
      nullif(trim(f.last_name), '')
    )), ''),
    NULLIF(trim(f.name), '')
  ) AS faculty_name,
  COALESCE(NULLIF(trim(f.faculty_code), ''), NULLIF(trim(f.employee_id), '')) AS faculty_code,
  sub.created_at
`

const TEACHER_SUBJECT_FACULTY_JOIN = `LEFT JOIN faculties f ON f.id::text = sub.faculty_id::text`

/** Public GET /api/teacher/* helpers for signed-in Better Auth faculty. */
export function createTeacherApiRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Faculty roster APIs require PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/teacher/profile', svc503)
    router.get('/teacher/dashboard-stats', svc503)
    router.get('/teacher/advisory-sections', svc503)
    router.get('/teacher/curriculum-guides', svc503)
    router.get('/teacher/student/:studentId', svc503)
    router.get('/teacher/subjects', svc503)
    router.get('/teacher/subjects/:subjectId/materials', svc503)
    router.get('/teacher/subjects/:subjectId/syllabus-file', svc503)
    router.get('/teacher/subjects/:subjectId', svc503)
    router.patch('/teacher/subjects/:subjectId/syllabus', svc503)
    router.delete('/teacher/subjects/:subjectId/syllabus', svc503)
    router.post('/teacher/materials', svc503)
    router.get('/teacher/materials/:materialId', svc503)
    router.patch('/teacher/materials/:materialId', svc503)
    router.delete('/teacher/materials/:materialId', svc503)
    router.get('/teacher/announcements', svc503)
    router.get('/teacher/announcements/:id', svc503)
    router.post('/teacher/announcements', svc503)
    router.put('/teacher/announcements/:id', svc503)
    router.get('/teacher/assignments/form-options', svc503)
    router.get('/teacher/assignments', svc503)
    router.get('/teacher/assignments/:id', svc503)
    router.get('/teacher/assignments/:id/submissions', svc503)
    router.post('/teacher/assignments', svc503)
    router.put('/teacher/assignments/:id', svc503)
    router.delete('/teacher/assignments/:id', svc503)
    router.patch('/teacher/assignments/:id/submissions/:submissionId/score', svc503)
    router.get('/teacher/activities/form-options', svc503)
    router.get('/teacher/activities', svc503)
    router.get('/teacher/activities/:id', svc503)
    router.get('/teacher/activities/:id/submissions', svc503)
    router.post('/teacher/activities', svc503)
    router.put('/teacher/activities/:id', svc503)
    router.delete('/teacher/activities/:id', svc503)
    router.patch('/teacher/activities/:id/submissions/:submissionId/score', svc503)
    return router
  }

  router.get('/teacher/profile', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const row = await fetchFacultyRowForSession(pool, user)
      if (!row) {
        res.status(404).json({
          error: 'FACULTY_NOT_FOUND',
          message:
            'Faculty profile not found. Make sure your account is linked to a faculty roster record (auth_user_id, email, or faculty code).',
        })
        return
      }
      const payload = facultyRowToTeacherProfilePayload(row)
      const advisory_sections = await resolveAdvisorySectionsForTeacher(pool, row)
      res.json({
        id: payload.faculty_row_id,
        ...payload,
        advisory_sections,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/profile')
    }
  })

  router.get('/teacher/dashboard-stats', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const row = await fetchFacultyRowForSession(pool, user)
      if (!row?.id) {
        res.status(404).json({
          error: 'FACULTY_NOT_FOUND',
          message: 'No faculty roster row matched this signed-in account.',
        })
        return
      }

      await ensureTeacherDashboardAggregateTables(pool)

      const facultyId = String(row.id).trim()
      const uploadedBy =
        buildFacultyDisplayName(row.first_name, row.middle_name, row.last_name, row.name) || 'Faculty'
      const [qcnt, acnt, actcnt, advisorySections] = await Promise.all([
        pool.query(
          'SELECT COUNT(*)::text AS count FROM study_materials WHERE uploaded_by::text = $1::text',
          [facultyId],
        ),
        pool.query(
          'SELECT COUNT(*)::text AS count FROM assignments WHERE faculty_id::text = $1::text',
          [facultyId],
        ),
        pool.query(
          `
          SELECT COUNT(*)::text AS count FROM activities
          WHERE faculty_id::text = $1::text
             OR lower(trim(COALESCE(uploaded_by, ''))) = lower(trim($2))
          `,
          [facultyId, uploadedBy],
        ),
        resolveAdvisorySectionsForTeacher(pool, row),
      ])
      const totalQuery = Number.parseInt(String(qcnt.rows[0]?.count ?? '0'), 10)
      const totalAssignment = Number.parseInt(String(acnt.rows[0]?.count ?? '0'), 10)
      const totalActivity = Number.parseInt(String(actcnt.rows[0]?.count ?? '0'), 10)
      const totalSections = Array.isArray(advisorySections) ? advisorySections.length : 0
      res.json({
        totalQuery: Number.isFinite(totalQuery) ? totalQuery : 0,
        totalAssignment: Number.isFinite(totalAssignment) ? totalAssignment : 0,
        totalActivity: Number.isFinite(totalActivity) ? totalActivity : 0,
        totalSections: Number.isFinite(totalSections) ? totalSections : 0,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/dashboard-stats')
    }
  })

  router.get('/teacher/advisory-sections', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const row = await fetchFacultyRowForSession(pool, user)
      if (!row) {
        /** Consistent empty list when roster not linked — UI can prompt admin */
        res.json([])
        return
      }
      const sections = await buildAdvisorySectionsPayloadWithStudents(pool, row)
      res.json(sections)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/advisory-sections')
    }
  })

  router.get('/teacher/curriculum-guides', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const pool = getPgPool()
      const grade_level = String(req.query?.grade_level || '').trim()
      const subject = String(req.query?.subject || '').trim()
      const guides = await listPublishedCurriculumGuides(pool, { grade_level, subject })
      res.json(guides)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/curriculum-guides')
    }
  })

  router.get('/teacher/student/:studentId', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const studentId = String(req.params.studentId || '').trim()
      if (!studentId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing student id.' })
        return
      }
      const detail = await fetchStudentDetailForTeacher(pool, facultyRow, studentId)
      if (!detail) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }
      await logTeacherAuditEvent(req, {
        event_type: 'STUDENT_PROFILE_VIEWED',
        module: 'Advisory',
        action: 'view',
        user,
        facultyRow,
        target_id: detail.id,
        target_label: detail.full_name || detail.name || `Student ${detail.id}`,
        summary: `Faculty viewed advisory student profile (roster scope, PII excluded): ${detail.full_name || detail.name || detail.id}`,
        new_values: {
          student_id: detail.id,
          enrollment_no: detail.enrollment_no || null,
          section: detail.section_name || detail.section || null,
          fields_exposed: ['name', 'enrollment_no', 'roll_no', 'grade_level', 'semester', 'section'],
        },
      })
      res.json(detail)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/student/:studentId')
    }
  })

  router.get('/teacher/subjects', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.json([])
        return
      }
      const facultyId = String(facultyRow.id).trim()
      const { rows } = await pool.query(
        `
        SELECT ${TEACHER_SUBJECT_SELECT}
        FROM subjects sub
        ${TEACHER_SUBJECT_FACULTY_JOIN}
        WHERE sub.faculty_id::text = $1
        ORDER BY sub.subject_name ASC
        `,
        [facultyId],
      )
      res.json((rows || []).map(mapTeacherSubjectRow).filter(Boolean))
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects')
    }
  })

  router.get('/teacher/subjects/:subjectId/materials', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const subjectId = Number(req.params.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const owns = await teacherOwnsSubject(pool, facultyRow.id, subjectId)
      if (!owns) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const materials = await fetchTeacherSubjectMaterials(pool, subjectId)
      res.json(materials)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:subjectId/materials')
    }
  })

  router.get('/teacher/subjects/:subjectId/syllabus-file', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const subjectId = Number(req.params.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      if (!(await teacherOwnsSubject(pool, facultyRow.id, subjectId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT syllabus_pdf, subject_code FROM subjects WHERE id = $1 LIMIT 1`,
        [subjectId],
      )
      const syllabusRaw = String(rows?.[0]?.syllabus_pdf ?? '').trim()
      const fileName = syllabusDisplayFileName(syllabusRaw, rows?.[0]?.subject_code)
      sendSubjectSyllabusResponse(res, syllabusRaw, fileName)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:subjectId/syllabus-file')
    }
  })

  router.get('/teacher/subjects/:subjectId', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const subjectId = Number(req.params.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const owns = await teacherOwnsSubject(pool, facultyRow.id, subjectId)
      if (!owns) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const { rows } = await pool.query(
        `
        SELECT ${TEACHER_SUBJECT_SELECT}
        FROM subjects sub
        ${TEACHER_SUBJECT_FACULTY_JOIN}
        WHERE sub.id = $1 AND sub.faculty_id::text = $2
        LIMIT 1
        `,
        [subjectId, String(facultyRow.id).trim()],
      )
      const row = rows?.[0]
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const section_name = await resolveTeacherSubjectSectionName(pool, facultyRow, row.grade_level)
      res.json(mapTeacherSubjectRow(row, { section_name }))
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:subjectId')
    }
  })

  router.patch('/teacher/subjects/:subjectId/syllabus', syllabusUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const subjectId = Number(req.params.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      if (!(await teacherOwnsSubject(pool, facultyRow.id, subjectId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const b = req.body || {}
      const file = getSyllabusUploadFile(req)
      await updateTeacherSubjectFields(pool, subjectId, facultyRow.id, {
        subject_name: b.subject_name ?? b.subjectName,
        grade_level: b.grade_level ?? b.gradeLevel,
        semester: b.semester,
      })
      if (!file) {
        const { rows } = await pool.query(
          `
          SELECT ${TEACHER_SUBJECT_SELECT}
          FROM subjects sub
          ${TEACHER_SUBJECT_FACULTY_JOIN}
          WHERE sub.id = $1
          LIMIT 1
          `,
          [subjectId],
        )
        res.json({
          success: true,
          message: 'Subject updated successfully.',
          subject: mapTeacherSubjectRow(rows?.[0]),
        })
        return
      }
      const fileErr = validateSyllabusUploadFile(file)
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      const { rows: existingRows } = await pool.query(
        `SELECT syllabus_pdf FROM subjects WHERE id = $1 LIMIT 1`,
        [subjectId],
      )
      const oldSyllabus = String(existingRows?.[0]?.syllabus_pdf ?? '').trim()
      const saved = saveSyllabusFile(file.buffer, file.originalname)
      const upd = await pool.query(
        `UPDATE subjects SET syllabus_pdf = $1 WHERE id = $2 AND faculty_id = $3`,
        [saved.syllabus_pdf, subjectId, String(facultyRow.id).trim()],
      )
      if (!upd.rowCount) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      if (oldSyllabus) deleteSyllabusFileByUrl(oldSyllabus)
      const { rows } = await pool.query(
        `
        SELECT ${TEACHER_SUBJECT_SELECT}
        FROM subjects sub
        ${TEACHER_SUBJECT_FACULTY_JOIN}
        WHERE sub.id = $1
        LIMIT 1
        `,
        [subjectId],
      )
      res.json({
        success: true,
        message: 'Syllabus updated successfully.',
        subject: mapTeacherSubjectRow(rows?.[0]),
        syllabus_file_name: saved.file_name,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/subjects/:subjectId/syllabus')
    }
  })

  router.delete('/teacher/subjects/:subjectId/syllabus', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const subjectId = Number(req.params.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      if (!(await teacherOwnsSubject(pool, facultyRow.id, subjectId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const { rows: existingRows } = await pool.query(
        `SELECT syllabus_pdf FROM subjects WHERE id = $1 AND faculty_id = $2 LIMIT 1`,
        [subjectId, String(facultyRow.id).trim()],
      )
      const oldSyllabus = String(existingRows?.[0]?.syllabus_pdf ?? '').trim()
      await pool.query(
        `UPDATE subjects SET syllabus_pdf = NULL WHERE id = $1 AND faculty_id = $2`,
        [subjectId, String(facultyRow.id).trim()],
      )
      if (oldSyllabus) deleteSyllabusFileByUrl(oldSyllabus)
      res.json({ success: true, message: 'Syllabus deleted.' })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/subjects/:subjectId/syllabus')
    }
  })

  router.post('/teacher/materials', studyMaterialEditUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const b = req.body || {}
      const subjectId = Number(b.subject_id ?? b.subjectId)
      if (!Number.isFinite(subjectId) || subjectId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'subject_id is required.' })
        return
      }
      if (!(await teacherOwnsSubject(pool, facultyRow.id, subjectId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const unit_no = String(b.unit_no ?? b.unitNo ?? '1').trim() || '1'
      const unit_name = String(b.unit_name ?? b.unitName ?? '').trim()
      const material_name = String(b.material_name ?? b.materialName ?? unit_name).trim()
      const semester = String(b.semester ?? '').trim()
      const subject_name = String(b.subject_name ?? b.subjectName ?? '').trim()
      const grade_level = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      if (!material_name) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Material name is required.' })
        return
      }
      const file = getStudyMaterialUploadFile(req)
      if (!file) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Study material file is required.' })
        return
      }
      const fileErr = validateEditDocumentStudyMaterialUploadFile(file)
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      await ensureSubjectMaterialsTable(pool)
      const saved = saveStudyMaterialFile(file.buffer, file.originalname)
      const file_type = guessMaterialFileType(file.originalname, file.mimetype)
      const unitNoInt = Number.parseInt(unit_no, 10)
      await updateTeacherSubjectFields(pool, subjectId, facultyRow.id, {
        subject_name,
        grade_level,
        semester,
      })
      const { rows } = await pool.query(
        `
        INSERT INTO subject_materials (
          subject_id, unit_no, unit_name, material_name,
          subject_semester, subject_name, grade_level,
          file_path, file_type, file_name, file_size, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING
          id,
          unit_no::text AS unit_no,
          unit_name,
          material_name,
          file_path AS file_url,
          file_type,
          file_name,
          file_size,
          subject_semester AS semester,
          created_at
        `,
        [
          subjectId,
          Number.isFinite(unitNoInt) && unitNoInt > 0 ? unitNoInt : 1,
          unit_name || material_name,
          material_name || unit_name,
          semester || null,
          subject_name || null,
          grade_level || null,
          saved.file_url,
          file_type,
          saved.file_name,
          saved.file_size,
        ],
      )
      const mapped = mapTeacherMaterialRow(rows?.[0])
      await logTeacherAuditEvent(req, {
        event_type: 'material_created',
        module: TEACHER_AUDIT_MODULES.STUDY_MATERIALS,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user,
        facultyRow,
        target_id: mapped?.id,
        target_label: buildTargetLabel(mapped?.material_name, subject_name),
        new_values: materialAuditSnapshot(mapped),
      })
      res.status(201).json({ success: true, material: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/materials')
    }
  })

  router.get('/teacher/materials/:materialId', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const materialId = Number(req.params.materialId)
      if (!Number.isFinite(materialId) || materialId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      if (!(await teacherOwnsMaterial(pool, facultyRow.id, materialId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const material = await fetchStudyMaterialById(pool, materialId)
      if (!material) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      res.json(material)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/materials/:materialId')
    }
  })

  router.patch('/teacher/materials/:materialId', studyMaterialEditUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const materialId = Number(req.params.materialId)
      if (!Number.isFinite(materialId) || materialId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      if (!(await teacherOwnsMaterial(pool, facultyRow.id, materialId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const existing = await fetchStudyMaterialById(pool, materialId)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const oldMaterialSnap = materialAuditSnapshot(existing)
      const b = req.body || {}
      const unit_no = String(b.unit_no ?? b.unitNo ?? existing.unit_no).trim() || '1'
      const unit_name = String(b.unit_name ?? b.unitName ?? existing.unit_name).trim()
      const material_name = String(b.material_name ?? b.materialName ?? existing.material_name).trim()
      const semester = String(b.semester ?? existing.semester ?? '').trim()
      const subject_name = String(b.subject_name ?? b.subjectName ?? '').trim()
      const grade_level = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const file = getStudyMaterialUploadFile(req)
      let file_url = existing.file_url
      let file_type = existing.file_type
      let file_name = existing.file_name
      let file_size = existing.file_size
      if (file) {
        const fileErr = validateSubjectMaterialEditUploadFile(file)
        if (fileErr) {
          res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
          return
        }
        deleteStudyMaterialFileByUrl(existing.file_url)
        const saved = saveStudyMaterialFile(file.buffer, file.originalname)
        file_url = saved.file_url
        file_name = saved.file_name
        file_size = saved.file_size
        file_type = guessMaterialFileType(file.originalname, file.mimetype)
      }
      const subjectIdNum = Number(existing.subject_id)
      if (Number.isFinite(subjectIdNum) && subjectIdNum > 0) {
        await updateTeacherSubjectFields(pool, subjectIdNum, facultyRow.id, {
          subject_name,
          grade_level,
          semester,
        })
      }
      const unitNoInt = Number.parseInt(unit_no, 10)
      const safeMaterialName =
        material_name || unit_name || file_name || existing.material_name || 'Untitled Material'

      if (existing.source_table === 'study_materials') {
        const { rows } = await pool.query(
          `
          UPDATE study_materials
          SET unit_no = $1, unit_name = $2, material_name = $3, semester = $4,
              grade_level = COALESCE(NULLIF($5, ''), grade_level),
              file_url = $6, file_type = $7, file_name = $8, file_size = $9,
              updated_at = NOW()
          WHERE id = $10
          RETURNING
            id,
            COALESCE(NULLIF(TRIM(unit_no::text), ''), '1') AS unit_no,
            COALESCE(NULLIF(TRIM(unit_name), ''), material_name) AS unit_name,
            material_name,
            file_url,
            file_type,
            file_name,
            file_size,
            semester,
            created_at
          `,
          [
            String(Number.isFinite(unitNoInt) && unitNoInt > 0 ? unitNoInt : 1),
            unit_name || safeMaterialName,
            safeMaterialName,
            semester || null,
            grade_level || null,
            file_url,
            file_type,
            file_name,
            file_size,
            materialId,
          ],
        )
        const mapped = mapTeacherMaterialRow({ ...rows?.[0], source_table: 'study_materials' })
        const diff = diffRecords(oldMaterialSnap, materialAuditSnapshot(mapped))
        await logTeacherAuditEvent(req, {
          event_type: 'material_updated',
          module: TEACHER_AUDIT_MODULES.STUDY_MATERIALS,
          action: TEACHER_AUDIT_ACTIONS.EDIT,
          user,
          facultyRow,
          target_id: mapped?.id,
          target_label: buildTargetLabel(mapped?.material_name),
          ...diff,
        })
        res.json({ success: true, material: mapped })
        return
      }

      const { rows } = await pool.query(
        `
        UPDATE subject_materials
        SET unit_no = $1, unit_name = $2, material_name = $3,
            subject_semester = $4, subject_name = $5, grade_level = $6,
            file_path = $7, file_type = $8, file_name = $9, file_size = $10,
            updated_at = NOW()
        WHERE id = $11
        RETURNING
          id,
          unit_no::text AS unit_no,
          unit_name,
          material_name,
          file_path AS file_url,
          file_type,
          file_name,
          file_size,
          subject_semester AS semester,
          created_at
        `,
        [
          Number.isFinite(unitNoInt) && unitNoInt > 0 ? unitNoInt : 1,
          unit_name || safeMaterialName,
          safeMaterialName,
          semester || null,
          subject_name || null,
          grade_level || null,
          file_url,
          file_type,
          file_name,
          file_size,
          materialId,
        ],
      )
      const mapped = mapTeacherMaterialRow(rows?.[0])
      const diff = diffRecords(oldMaterialSnap, materialAuditSnapshot(mapped))
      await logTeacherAuditEvent(req, {
        event_type: 'material_updated',
        module: TEACHER_AUDIT_MODULES.STUDY_MATERIALS,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user,
        facultyRow,
        target_id: mapped?.id,
        target_label: buildTargetLabel(mapped?.material_name),
        ...diff,
      })
      res.json({ success: true, material: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/materials/:materialId')
    }
  })

  router.delete('/teacher/materials/:materialId', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const materialId = Number(req.params.materialId)
      if (!Number.isFinite(materialId) || materialId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      if (!(await teacherOwnsMaterial(pool, facultyRow.id, materialId))) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const existing = await fetchStudyMaterialById(pool, materialId)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const deletedSnap = materialAuditSnapshot(existing)
      await deleteTeacherMaterialById(pool, materialId)
      await logTeacherAuditEvent(req, {
        event_type: 'material_deleted',
        module: TEACHER_AUDIT_MODULES.STUDY_MATERIALS,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user,
        facultyRow,
        target_id: materialId,
        target_label: buildTargetLabel(existing.material_name ?? existing.title),
        old_values: deletedSnap,
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/materials/:materialId')
    }
  })

  const ANNOUNCEMENT_SELECT =
    'id, announcement_image, image_path, image_name, uploaded_by, title, type, message, created_at, updated_at'

  function facultyUploadedByLabel(facultyRow) {
    return (
      buildFacultyDisplayName(
        facultyRow?.first_name,
        facultyRow?.middle_name,
        facultyRow?.last_name,
        facultyRow?.name,
      ) || 'Faculty'
    )
  }

  function isAllowedAnnouncementType(type) {
    const t = String(type || '').trim()
    if (!t) return false
    if (FACULTY_ANNOUNCEMENT_TYPES.includes(t)) return true
    return ['Announcement', 'Event', 'News'].includes(t)
  }

  router.get('/teacher/announcements', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const pool = getPgPool()
      await ensureAnnouncementsMetadataColumns(pool)
      const { rows } = await pool.query(`
        SELECT ${ANNOUNCEMENT_SELECT}
        FROM announcements
        WHERE archived_at IS NULL
        ORDER BY created_at DESC
      `)
      res.json({ ok: true, announcements: (rows || []).map((r) => announcementRowToResponse(r)) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/announcements')
    }
  })

  router.get('/teacher/announcements/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid announcement id.' })
        return
      }
      const pool = getPgPool()
      await ensureAnnouncementsMetadataColumns(pool)
      const { rows } = await pool.query(
        `SELECT ${ANNOUNCEMENT_SELECT} FROM announcements WHERE id = $1 LIMIT 1`,
        [id],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Announcement not found.' })
        return
      }
      res.json({ ok: true, announcement: announcementRowToResponse(rows[0]) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/announcements/:id')
    }
  })

  router.post('/teacher/announcements', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureAnnouncementsMetadataColumns(pool)
      const { title, type, message, announcement_image, image_name } = readAnnouncementBodyFields(req.body)
      if (!title || !type || !message) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Required: title, type (or updateType), and message (or description).',
        })
        return
      }
      if (!isAllowedAnnouncementType(type)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid announcement type.' })
        return
      }
      const imageFields = resolveAnnouncementImageForSave({
        announcement_image,
        image_name,
        title,
      })
      const uploadedBy = facultyUploadedByLabel(facultyRow)
      const { rows } = await pool.query(
        `
        INSERT INTO announcements (
          announcement_image, image_path, image_name, title, type, message, uploaded_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING ${ANNOUNCEMENT_SELECT}
        `,
        [
          imageFields.announcement_image || null,
          imageFields.image_path || null,
          imageFields.image_name || null,
          title,
          type,
          message,
          uploadedBy,
        ],
      )
      const created = announcementRowToResponse(rows?.[0])
      await logTeacherAuditEvent(req, {
        event_type: 'announcement_created',
        module: TEACHER_AUDIT_MODULES.ANNOUNCEMENTS,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user,
        facultyRow,
        target_id: created?.id,
        target_label: buildTargetLabel(created?.title),
        new_values: announcementAuditSnapshot(created),
      })
      res.status(201).json({ ok: true, announcement: created })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/announcements')
    }
  })

  router.put('/teacher/announcements/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid announcement id.' })
        return
      }
      await ensureAnnouncementsMetadataColumns(pool)
      const { rows: existingRows } = await pool.query(
        `SELECT ${ANNOUNCEMENT_SELECT} FROM announcements WHERE id = $1 LIMIT 1`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Announcement not found.' })
        return
      }
      const oldAnnouncementSnap = announcementAuditSnapshot(announcementRowToResponse(existing))
      const { title, type, message, announcement_image, image_name } = readAnnouncementBodyFields(req.body)
      if (!title || !type || !message) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Required: title, type (or updateType), and message (or description).',
        })
        return
      }
      if (!isAllowedAnnouncementType(type)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid announcement type.' })
        return
      }
      const imageFields = resolveAnnouncementImageForSave({
        announcement_image,
        image_name,
        title,
        existingPath: existing.image_path,
        existingDataUrl: existing.announcement_image,
      })
      maybeDeleteOldAnnouncementFile(imageFields.deleteOldPath, imageFields.image_path)
      const { rows } = await pool.query(
        `
        UPDATE announcements
        SET title = $1, type = $2, message = $3,
            announcement_image = $4, image_path = $5, image_name = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING ${ANNOUNCEMENT_SELECT}
        `,
        [
          title,
          type,
          message,
          imageFields.announcement_image || null,
          imageFields.image_path || null,
          imageFields.image_name || null,
          id,
        ],
      )
      const updated = announcementRowToResponse(rows?.[0])
      const diff = diffRecords(oldAnnouncementSnap, announcementAuditSnapshot(updated))
      await logTeacherAuditEvent(req, {
        event_type: 'announcement_updated',
        module: TEACHER_AUDIT_MODULES.ANNOUNCEMENTS,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(updated?.title),
        ...diff,
      })
      res.json({ ok: true, announcement: updated })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/announcements/:id')
    }
  })

  router.delete('/teacher/announcements/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid announcement id.' })
        return
      }
      await ensureAnnouncementsMetadataColumns(pool)
      const { rows: existingRows } = await pool.query(
        `SELECT ${ANNOUNCEMENT_SELECT} FROM announcements WHERE id = $1 AND archived_at IS NULL LIMIT 1`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Announcement not found.' })
        return
      }
      const ownerLabel = facultyUploadedByLabel(facultyRow)
      if (String(existing.uploaded_by || '').trim() !== String(ownerLabel || '').trim()) {
        res.status(403).json({ error: 'FORBIDDEN', message: 'You can only delete your own announcements.' })
        return
      }
      const { rows } = await pool.query(
        `UPDATE announcements SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING ${ANNOUNCEMENT_SELECT}`,
        [id],
      )
      const removed = announcementRowToResponse(rows?.[0])
      await logTeacherAuditEvent(req, {
        event_type: 'announcement_deleted',
        module: TEACHER_AUDIT_MODULES.ANNOUNCEMENTS,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(removed?.title),
        old_values: announcementAuditSnapshot(removed),
      })
      res.json({ ok: true, id, announcement: removed })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/announcements/:id')
    }
  })

  function parseAssignmentDeadline(raw) {
    const s = String(raw ?? '').trim()
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  function formatStudentDisplayName(row) {
    const parts = [
      pickStudentText(row, 'first_name', 'firstName'),
      pickStudentText(row, 'middle_name', 'middleName'),
      pickStudentText(row, 'last_name', 'lastName'),
    ].filter(Boolean)
    if (parts.length) return parts.join(' ')
    return pickStudentText(row, 'name', 'student_name') || 'Student'
  }

  async function seedSubmissionsForAssignment(pool, assignmentId, gradeLevel) {
    await seedSubmissionsForGradeLevel(pool, assignmentId, gradeLevel)
  }

  router.get('/teacher/assignments/form-options', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const pool = getPgPool()
      await ensureAssignmentsSchema(pool)
      const options = await fetchAssignmentFormOptions(pool)
      res.json({ ok: true, ...options })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/assignments/form-options')
    }
  })

  router.get('/teacher/assignments', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureAssignmentsSchema(pool)

      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '5'), 10) || 5))
      const q = String(req.query.q ?? req.query.search ?? '').trim()
      const sortKey = String(req.query.sort ?? req.query.sortKey ?? 'created_at').trim()
      const sortDir = String(req.query.dir ?? req.query.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

      const sortColumnMap = {
        name: 'a.title',
        subject: 'COALESCE(a.subject_name, sub.subject_name)',
        grade_level: 'COALESCE(a.grade_level, sub.grade_level)',
        semester: 'a.semester',
        upload_date: 'a.created_at',
        submission_date: 'a.submission_deadline',
        created_at: 'a.created_at',
      }
      const orderBy = sortColumnMap[sortKey] || sortColumnMap.created_at

      const params = [String(facultyRow.id)]
      let whereSql = 'WHERE a.faculty_id::text = $1::text'
      if (q) {
        params.push(`%${q.toLowerCase()}%`)
        const qi = params.length
        whereSql += ` AND (
          lower(a.title) LIKE $${qi}
          OR lower(COALESCE(a.subject_name, sub.subject_name, '')) LIKE $${qi}
          OR lower(COALESCE(a.grade_level, sub.grade_level, '')) LIKE $${qi}
          OR lower(COALESCE(a.semester::text, '')) LIKE $${qi}
        )`
      }

      const { rows: countRows } = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM assignments a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        ${whereSql}
        `,
        params,
      )
      const total = Number(countRows?.[0]?.total ?? 0)
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const safePage = Math.min(page, totalPages)
      const offset = (safePage - 1) * limit

      const { rows } = await pool.query(
        `
        SELECT ${ASSIGNMENT_SELECT}
        FROM assignments a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        LEFT JOIN subject_grade_components sgc ON sgc.id = a.grade_component_id
        ${whereSql}
        ORDER BY ${orderBy} ${sortDir} NULLS LAST, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, limit, offset],
      )
      const data = (rows || []).map((r) => mapAssignmentRow(r))
      res.json({
        ok: true,
        data,
        assignments: data,
        total,
        page: safePage,
        limit,
        totalPages,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/assignments')
    }
  })

  router.get('/teacher/assignments/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const row = await fetchAssignmentById(pool, id, facultyRow.id)
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      res.json({ ok: true, assignment: mapAssignmentRow(row) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/assignments/:id')
    }
  })

  router.get('/teacher/assignments/:id/submissions', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const assignmentRow = await fetchAssignmentById(pool, id, facultyRow.id)
      if (!assignmentRow) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      const gradeLevel = String(assignmentRow.assignment_grade_level ?? assignmentRow.grade_level ?? '').trim()
      if (!gradeLevel) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Assignment grade level is not set.' })
        return
      }
      await seedSubmissionsForAssignment(pool, id, gradeLevel)
      await refreshSubmissionStudentNames(pool, id)
      const expiredCount = await expireUnsubmittedForAssignment(pool, id)
      const totalScore = Number(assignmentRow.total_score) || 100
      const rows = await fetchSubmissionsForAssignment(pool, id, gradeLevel)
      const submissions = rows
        .map((r) => mapSubmissionRow(r, totalScore))
        .sort((a, b) => String(a.student_name || '').localeCompare(String(b.student_name || '')))
      res.json({
        ok: true,
        expiredUpdated: expiredCount > 0,
        assignment: mapAssignmentRow(assignmentRow),
        submissions,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/assignments/:id/submissions')
    }
  })

  router.post('/teacher/assignments', assignmentUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const b = req.body || {}
      const title = String(b.title ?? '').trim()
      const description = String(b.description ?? '').trim()
      const subjectName = String(b.subject_name ?? b.subjectName ?? '').trim()
      const gradeLevel = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const totalScore = Number(b.total_score ?? b.totalScore ?? 100)
      const bodySubjectId = Number(b.subject_id)
      const parsedGradeComponentId =
        b.grade_component_id == null || String(b.grade_component_id).trim() === ''
          ? null
          : Number(b.grade_component_id)
      const deadline = parseAssignmentDeadline(b.submission_deadline ?? b.submissionDeadline)
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Assignment title is required.' })
        return
      }
      if (!subjectName) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      if (!gradeLevel) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      const semester = parseRequiredSemester(b.semester)
      if (!semester) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Semester.' })
        return
      }
      if (!deadline) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Submission date is required.' })
        return
      }
      if (!Number.isFinite(totalScore) || totalScore <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Total score must be a positive number.' })
        return
      }
      const linked = await resolveSubjectIdForAssignment(pool, facultyRow.id, subjectName, gradeLevel)
      const subjectId =
        Number.isFinite(bodySubjectId) && bodySubjectId > 0 ? bodySubjectId : linked?.subjectId ?? null
      const gradeComponentId =
        Number.isFinite(parsedGradeComponentId) && parsedGradeComponentId > 0
          ? parsedGradeComponentId
          : null
      if (subjectId && !gradeComponentId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Grade component is required for subject-linked work.',
        })
        return
      }
      if (subjectId && gradeComponentId) {
        const check = await validateGradeComponentForWork(pool, subjectId, gradeComponentId, 'assignment')
        if (!check.ok) {
          res.status(400).json({ error: 'BAD_REQUEST', message: check.message })
          return
        }
      }
      const file = getAssignmentUploadFile(req)
      const fileErr = validateAssignmentUploadFile(file, { required: true })
      if (fileErr) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: fileErr === ASSIGNMENT_FILE_SIZE_MSG ? fileErr : fileErr,
        })
        return
      }
      const saved = saveAssignmentFile(file.buffer, file.originalname)
      const uploadedBy = facultyUploadedByLabel(facultyRow)
      const { rows } = await pool.query(
        `
        INSERT INTO assignments (
          faculty_id, title, description, subject_id, subject_name, grade_level, semester,
          file_path, file_name, file_size, grade_component_id, total_score, submission_deadline,
          uploaded_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING id
        `,
        [
          facultyRow.id,
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          semester,
          saved.file_path,
          saved.file_name,
          saved.file_size,
          gradeComponentId,
          totalScore,
          deadline.toISOString(),
          uploadedBy,
        ],
      )
      const inserted = rows?.[0]
      if (!inserted) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create assignment.' })
        return
      }
      await seedSubmissionsForAssignment(pool, inserted.id, gradeLevel)
      const full = await fetchAssignmentById(pool, inserted.id, facultyRow.id)
      const mapped = mapAssignmentRow(full || inserted)
      await logTeacherAuditEvent(req, {
        event_type: 'assignment_created',
        module: TEACHER_AUDIT_MODULES.ASSIGNMENTS,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user,
        facultyRow,
        target_id: mapped?.id,
        target_label: buildTargetLabel(mapped?.title, mapped?.subject_name),
        new_values: assignmentAuditSnapshot(mapped),
      })
      res.status(201).json({ ok: true, assignment: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/assignments')
    }
  })

  router.put('/teacher/assignments/:id', assignmentUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const existing = await fetchAssignmentById(pool, id, facultyRow.id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      if (isDeadlinePassed(existing.submission_deadline)) {
        res.status(403).json({
          error: 'ITEM_OVERDUE_LOCKED',
          message: 'This assignment is past its deadline and can no longer be edited.',
        })
        return
      }
      const oldAssignmentSnap = assignmentAuditSnapshot(mapAssignmentRow(existing))
      const b = req.body || {}
      const title = String(b.title ?? '').trim()
      const description = String(b.description ?? '').trim()
      const subjectName = String(b.subject_name ?? b.subjectName ?? '').trim()
      const gradeLevel = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const totalScore = Number(b.total_score ?? b.totalScore ?? existing.total_score ?? 100)
      const bodySubjectId = Number(b.subject_id)
      const parsedGradeComponentId =
        b.grade_component_id == null || String(b.grade_component_id).trim() === ''
          ? null
          : Number(b.grade_component_id)
      const deadline = parseAssignmentDeadline(b.submission_deadline ?? b.submissionDeadline)
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Assignment title is required.' })
        return
      }
      if (!subjectName) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      if (!gradeLevel) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      const semester = parseRequiredSemester(b.semester)
      if (!semester) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Semester.' })
        return
      }
      if (!deadline) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Submission date is required.' })
        return
      }
      if (!Number.isFinite(totalScore) || totalScore <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Total score must be a positive number.' })
        return
      }
      const linked = await resolveSubjectIdForAssignment(pool, facultyRow.id, subjectName, gradeLevel)
      const subjectId =
        Number.isFinite(bodySubjectId) && bodySubjectId > 0 ? bodySubjectId : linked?.subjectId ?? null
      const gradeComponentId =
        Number.isFinite(parsedGradeComponentId) && parsedGradeComponentId > 0
          ? parsedGradeComponentId
          : null
      if (subjectId && !gradeComponentId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Grade component is required for subject-linked work.',
        })
        return
      }
      if (subjectId && gradeComponentId) {
        const existingComponentId =
          existing.grade_component_id != null ? Number(existing.grade_component_id) : null
        const componentChanged = existingComponentId !== gradeComponentId
        if (componentChanged) {
          const check = await validateGradeComponentForWork(pool, subjectId, gradeComponentId, 'assignment')
          if (!check.ok) {
            res.status(400).json({ error: 'BAD_REQUEST', message: check.message })
            return
          }
        }
      }
      const file = getAssignmentUploadFile(req)
      const fileErr = validateAssignmentUploadFile(file, { required: false })
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      let file_path = existing.file_path
      let file_name = existing.file_name
      let file_size = existing.file_size
      if (file) {
        deleteAssignmentFileByUrl(existing.file_path)
        const saved = saveAssignmentFile(file.buffer, file.originalname)
        file_path = saved.file_path
        file_name = saved.file_name
        file_size = saved.file_size
      }
      await pool.query(
        `
        UPDATE assignments
        SET title = $1, description = $2, subject_id = $3, subject_name = $4, grade_level = $5, semester = $6,
            file_path = $7, file_name = $8, file_size = $9, grade_component_id = $10,
            total_score = $11, submission_deadline = $12, updated_at = NOW()
        WHERE id = $13 AND faculty_id::text = $14::text
        `,
        [
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          semester,
          file_path,
          file_name,
          file_size,
          gradeComponentId,
          totalScore,
          deadline.toISOString(),
          id,
          String(facultyRow.id),
        ],
      )
      await seedSubmissionsForAssignment(pool, id, gradeLevel)
      const full = await fetchAssignmentById(pool, id, facultyRow.id)
      const mapped = mapAssignmentRow(full)
      const diff = diffRecords(oldAssignmentSnap, assignmentAuditSnapshot(mapped))
      await logTeacherAuditEvent(req, {
        event_type: 'assignment_updated',
        module: TEACHER_AUDIT_MODULES.ASSIGNMENTS,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(mapped?.title, mapped?.subject_name),
        ...diff,
      })
      res.json({ ok: true, assignment: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/assignments/:id')
    }
  })

  router.delete('/teacher/assignments/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid assignment id.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const existing = await fetchAssignmentById(pool, id, facultyRow.id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      const { rows: subFiles } = await pool.query(
        `SELECT file_path FROM assignment_submissions WHERE assignment_id = $1 AND file_path IS NOT NULL`,
        [id],
      )
      for (const sf of subFiles || []) {
        if (sf?.file_path) {
          if (String(sf.file_path).startsWith('/uploads/submissions/')) {
            deleteSubmissionFileByUrl(sf.file_path)
          } else {
            deleteAssignmentFileByUrl(sf.file_path)
          }
        }
      }
      deleteAssignmentFileByUrl(existing.file_path)
      const deletedSnap = assignmentAuditSnapshot(mapAssignmentRow(existing))
      await pool.query(`DELETE FROM assignments WHERE id = $1 AND faculty_id::text = $2::text`, [
        id,
        String(facultyRow.id),
      ])
      await logTeacherAuditEvent(req, {
        event_type: 'assignment_deleted',
        module: TEACHER_AUDIT_MODULES.ASSIGNMENTS,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(existing.title, existing.subject_name),
        old_values: deletedSnap,
      })
      res.json({ ok: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/assignments/:id')
    }
  })

  router.patch('/teacher/assignments/:id/submissions/:submissionId/score', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const assignmentId = Number(req.params.id)
      const submissionId = Number(req.params.submissionId)
      if (!Number.isFinite(assignmentId) || assignmentId <= 0 || !Number.isFinite(submissionId) || submissionId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid id.' })
        return
      }
      await ensureAssignmentsSchema(pool)
      const assignmentRow = await fetchAssignmentById(pool, assignmentId, facultyRow.id)
      if (!assignmentRow) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Assignment not found.' })
        return
      }
      if (isDeadlinePassed(assignmentRow.submission_deadline)) {
        res.status(403).json({
          error: 'SCORE_LOCKED',
          message: 'Deadline has passed. Score is locked. Contact admin to request a grade correction.',
        })
        return
      }
      const totalScore = Number(assignmentRow.total_score) || 100
      const score = Number(req.body?.score ?? req.body?.value)
      const feedback = String(req.body?.feedback ?? '').trim()
      if (!Number.isFinite(score) || score < 0 || score > totalScore) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `Score must be between 0 and ${totalScore}.`,
        })
        return
      }
      const { rows: priorRows } = await pool.query(
        `SELECT score, feedback, student_id FROM assignment_submissions WHERE id = $1 AND assignment_id = $2 LIMIT 1`,
        [submissionId, assignmentId],
      )
      const prior = priorRows?.[0]
      const { rows } = await pool.query(
        `
        UPDATE assignment_submissions s
        SET score = $1, feedback = $2, status = 'graded', updated_at = NOW()
        FROM assignments a
        WHERE s.id = $3 AND s.assignment_id = $4 AND a.id = s.assignment_id
          AND a.faculty_id::text = $5::text
        RETURNING s.*
        `,
        [Math.round(score), feedback || null, submissionId, assignmentId, String(facultyRow.id)],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      try {
        await customActivityLogger.logAssignmentGraded(String(user.id), assignmentId, submissionId, {
          userEmail: String(user.email || '').trim(),
          userRole: 'teacher',
        })
        await logTeacherAuditEvent(req, {
          event_type: 'grade_score_saved',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: TEACHER_AUDIT_ACTIONS.GRADE,
          user,
          facultyRow,
          target_id: submissionId,
          target_label: buildTargetLabel(assignmentRow.title, `Student ${prior?.student_id ?? ''}`),
          old_values: {
            score: prior?.score ?? null,
            feedback: prior?.feedback ?? null,
            student_id: prior?.student_id ?? null,
            assignment_id: assignmentId,
          },
          new_values: {
            score: Math.round(score),
            feedback: feedback || null,
            student_id: prior?.student_id ?? null,
            assignment_id: assignmentId,
          },
          changed_fields: ['score', ...(String(prior?.feedback || '') !== String(feedback || '') ? ['feedback'] : [])],
        })
      } catch {
        /* non-fatal */
      }
      res.json({ ok: true, submission: mapSubmissionRow(rows[0], totalScore) })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/assignments/:id/submissions/:submissionId/score')
    }
  })

  mountTeacherActivitiesRoutes(router, {
    auth,
    requireFacultyOrTeacherSession,
    fetchFacultyRowForSession,
    facultyUploadedByLabel,
  })

  return router
}
