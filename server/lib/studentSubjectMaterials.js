import { ensureAnnouncementsMetadataColumns } from './announcementsDb.js'
import { ensureFacultyStudyMaterialsSchema } from './facultyStudyMaterialsDb.js'
import { enrichSubjectDetailsFields } from './subjectDetailsEnrich.js'
import { withSubjectSchedules } from './subjectScheduleAttach.js'
import {
  sendStudentSubjectSyllabusResponse,
  syllabusDisplayFileName,
} from './syllabusResponse.js'
import { resolveSubjectImagePath } from './subjectImageStorage.js'

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
  COALESCE(NULLIF(TRIM(file_path), ''), NULLIF(TRIM(file_url), '')) AS file_url,
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

function mapMaterialRow(row) {
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

function studentSubjectSyllabusFileUrl(subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return ''
  return `/api/v1/student/subjects/${sid}/syllabus-file`
}

function inferSyllabusFileType(syllabusRaw) {
  return 'application/pdf'
}

function inferUnitNameFromSyllabus(fileName) {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim()
  if (base) return base.toUpperCase()
  return 'LESSON 1'
}

async function tableExists(pool, tableName) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [tableName],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

async function columnExists(pool, tableName, columnName) {
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        LIMIT 1
      `,
      [tableName, columnName],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

export async function ensureStudentSubjectMaterialsReady(pool) {
  if (!pool) return
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
        file_path TEXT,
        file_url TEXT,
        file_name VARCHAR(512),
        file_size BIGINT,
        file_type VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS unit_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS material_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_semester VARCHAR(16)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_name VARCHAR(255)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_path TEXT`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_url TEXT`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_name VARCHAR(512)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_size BIGINT`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_type VARCHAR(64)`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`)
    await pool.query(`ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`)
  } catch {
    /* non-fatal */
  }
  try {
    await ensureFacultyStudyMaterialsSchema(pool)
  } catch {
    /* non-fatal */
  }
}

async function buildStudyMaterialSelectFields(pool) {
  const hasUnitNo = await columnExists(pool, 'study_materials', 'unit_no')
  const hasUnitName = await columnExists(pool, 'study_materials', 'unit_name')
  const hasSemester = await columnExists(pool, 'study_materials', 'semester')
  const unitNoExpr = hasUnitNo
    ? `COALESCE(NULLIF(TRIM(unit_no::text), ''), '1')`
    : `'1'`
  const unitNameExpr = hasUnitName
    ? `COALESCE(
        NULLIF(TRIM(unit_name), ''),
        NULLIF(TRIM(material_name), ''),
        NULLIF(TRIM(file_name), ''),
        'Untitled Material'
      )`
    : `COALESCE(
        NULLIF(TRIM(material_name), ''),
        NULLIF(TRIM(file_name), ''),
        'Untitled Material'
      )`
  const semesterSelect = hasSemester ? 'semester' : `NULL::text AS semester`
  return `
    id,
    ${unitNoExpr} AS unit_no,
    ${unitNameExpr} AS unit_name,
    COALESCE(
      NULLIF(TRIM(material_name), ''),
      NULLIF(TRIM(file_name), ''),
      'Untitled Material'
    ) AS material_name,
    file_url,
    file_type,
    ${semesterSelect},
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
}
function mapSubjectRow(row, extras = {}) {
  if (!row) return null
  const subjectName = String(row.subject_name ?? '').trim()
  const storedCover = String(row.cover_image_url ?? row.subject_photo ?? '').trim()
  const cover = storedCover || resolveSubjectImagePath(subjectName)
  const base = {
    id: row.id != null ? String(row.id) : '',
    faculty_id: row.faculty_id != null ? String(row.faculty_id) : '',
    subject_name: subjectName,
    subject_code: String(row.subject_code ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    semester: row.semester != null ? String(row.semester).trim() : '',
    cover_image_url: cover,
    subject_photo: cover,
    faculty_name: String(row.faculty_name ?? '').trim(),
    assignedFacultyName: String(row.faculty_name ?? '').trim(),
    faculty_code: String(row.faculty_code ?? row.employee_id ?? '').trim(),
    created_at: row.created_at ?? null,
    syllabus_url: String(row.syllabus_url ?? row.syllabus_pdf ?? '').trim(),
    syllabus_pdf: String(row.syllabus_pdf ?? '').trim(),
    syllabus_file_name: syllabusDisplayFileName(row.syllabus_pdf, row.subject_code),
    section_name: String(extras.section_name ?? '').trim() || '—',
    curriculumGuideId: String(row.curriculum_guide_id ?? '').trim(),
    curriculum_guide_id: String(row.curriculum_guide_id ?? '').trim(),
    curriculumGuideTitle: String(row.curriculum_guide_title ?? '').trim(),
    curriculumGuideGrade: String(row.curriculum_guide_grade ?? '').trim(),
    curriculumGuideLabel: String(row.curriculum_guide_label ?? '').trim(),
    curriculumGuideFileUrl: String(row.curriculum_guide_file_url ?? '').trim(),
    curriculum_guide_file_url: String(row.curriculum_guide_file_url ?? '').trim(),
    curriculumGuideFileName: String(row.curriculum_guide_file_name ?? '').trim(),
  }
  return enrichSubjectDetailsFields(base, extras)
}

const SUBJECT_DETAIL_SELECT = `
  sub.id,
  sub.subject_name,
  sub.subject_code,
  sub.grade_level,
  sub.semester,
  sub.faculty_id,
  sub.curriculum_guide_id,
  sub.subject_photo AS cover_image_url,
  sub.subject_photo,
  sub.syllabus_pdf AS syllabus_url,
  sub.syllabus_pdf,
  cg.subject AS curriculum_guide_title,
  cg.grade AS curriculum_guide_grade,
  cg.title AS curriculum_guide_label,
  COALESCE(NULLIF(trim(cg.file_url), ''), NULLIF(trim(cg.file_data_url), '')) AS curriculum_guide_file_url,
  cg.file_name AS curriculum_guide_file_name,
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

/** Load subject row by primary key (no access check). */
export async function fetchStudentSubjectDetails(pool, subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return null
  if (!pool) return null

  try {
    const { rows } = await pool.query(
      `
        SELECT ${SUBJECT_DETAIL_SELECT}
        FROM subjects sub
        LEFT JOIN faculties f ON f.id::text = sub.faculty_id::text
        LEFT JOIN curriculum_guides cg ON cg.id::text = sub.curriculum_guide_id::text
        WHERE sub.id = $1
        LIMIT 1
      `,
      [sid],
    )
    return withSubjectSchedules(pool, mapSubjectRow(rows?.[0]))
  } catch (err) {
    console.error('[studentSubjectMaterials] fetchStudentSubjectDetails join failed:', err?.message || err)
    try {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            subject_name,
            subject_code,
            grade_level,
            semester,
            faculty_id,
            subject_photo AS cover_image_url,
            subject_photo,
            syllabus_pdf AS syllabus_url,
            syllabus_pdf,
            created_at
          FROM subjects
          WHERE id = $1
          LIMIT 1
        `,
        [sid],
      )
      return withSubjectSchedules(pool, mapSubjectRow(rows?.[0]))
    } catch (fallbackErr) {
      console.error('[studentSubjectMaterials] fetchStudentSubjectDetails fallback failed:', fallbackErr?.message || fallbackErr)
      return null
    }
  }
}

export async function assertStudentCanAccessSubject(pool, studentRow, subjectId) {
  const subject = await fetchStudentSubjectDetails(pool, subjectId)
  if (!subject) return null

  const { resolveStudentGradeLevel, normalizeGradeLevel } = await import('./studentSession.js')
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  if (!grade) return null

  const subjectGrade = normalizeGradeLevel(subject.grade_level)
  if (subjectGrade !== grade) return null

  return subject
}

async function appendAdminSyllabusMaterial(pool, subjectId, pushMaterial) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return
  try {
    const { rows } = await pool.query(
      `SELECT syllabus_pdf, subject_code, subject_name FROM subjects WHERE id = $1 LIMIT 1`,
      [sid],
    )
    const row = rows?.[0]
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
      file_url: studentSubjectSyllabusFileUrl(sid),
      file_name: fileName,
      file_type: inferSyllabusFileType(syllabusRaw),
      file_size: null,
      semester: '',
      created_at: null,
      description: '',
      is_admin_syllabus: true,
    })
  } catch {
    /* non-fatal */
  }
}

async function appendStudyMaterialsForSubject(pool, subjectId, subjectRow, pushMaterial) {
  if (!(await tableExists(pool, 'study_materials'))) return
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return

  let selectFields = STUDY_MATERIAL_SELECT_FIELDS
  try {
    selectFields = await buildStudyMaterialSelectFields(pool)
  } catch {
    /* keep default */
  }

  const runQuery = async (sql, params) => {
    const { rows } = await pool.query(sql, params)
    for (const r of rows || []) pushMaterial({ ...r, source_table: 'study_materials' })
  }

  try {
    await runQuery(
      `
        SELECT ${selectFields}
        FROM study_materials
        WHERE subject_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [sid],
    )
  } catch (err) {
    console.error('[studentSubjectMaterials] study_materials by subject_id failed:', err?.message || err)
  }

  if (!subjectRow) return
  const facultyId = String(subjectRow.faculty_id ?? '').trim()
  if (!facultyId) return

  const hasUploadedBy = await columnExists(pool, 'study_materials', 'uploaded_by')
  if (!hasUploadedBy) return

  try {
    await runQuery(
      `
        SELECT ${selectFields}
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
  } catch (err) {
    console.error('[studentSubjectMaterials] study_materials by faculty failed:', err?.message || err)
  }
}

export async function fetchStudentSubjectMaterials(pool, subjectId, subjectRow = null) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return []

  await ensureStudentSubjectMaterialsReady(pool)

  const out = []
  const seenUrls = new Set()
  const pushMaterial = (row) => {
    const mapped = mapMaterialRow(row)
    if (!mapped || seenUrls.has(mapped.file_url)) return
    seenUrls.add(mapped.file_url)
    out.push(mapped)
  }

  let brief = subjectRow
  if (!brief) {
    try {
      const { rows } = await pool.query(
        `SELECT id, subject_code, subject_name, grade_level, faculty_id FROM subjects WHERE id = $1 LIMIT 1`,
        [sid],
      )
      brief = rows?.[0] || null
    } catch {
      brief = null
    }
  }

  await appendAdminSyllabusMaterial(pool, sid, pushMaterial)

  if (await tableExists(pool, 'subject_materials')) {
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
    } catch (err) {
      console.error('[studentSubjectMaterials] subject_materials query failed:', err?.message || err)
    }
  }

  try {
    await appendStudyMaterialsForSubject(pool, sid, brief, pushMaterial)
  } catch (err) {
    console.error('[studentSubjectMaterials] appendStudyMaterialsForSubject failed:', err?.message || err)
  }

  return out
}

export { sendStudentSubjectSyllabusResponse } from './syllabusResponse.js'

export async function ensureStudentAnnouncementsReady(pool) {
  await ensureAnnouncementsMetadataColumns(pool)
}
