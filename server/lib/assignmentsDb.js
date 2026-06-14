import { deleteAssignmentFileByUrl } from './assignmentStorage.js'
import { filterGradeLevelsForDropdown, isAllowedHighSchoolGradeLevel } from './gradeLevels.js'
import {
  decryptStudentRows,
  studentDisplayName,
  submissionStudentDisplayName,
} from './studentPiiCrypto.js'

const ASSIGNMENT_SELECT = `
  a.id,
  a.faculty_id,
  a.title,
  a.description,
  a.subject_id,
  a.subject_name AS assignment_subject_name,
  a.grade_level AS assignment_grade_level,
  a.semester,
  a.file_path,
  a.file_name,
  a.file_size,
  a.grade_component_id,
  a.total_score,
  a.submission_deadline,
  a.uploaded_by,
  a.created_at,
  a.updated_at,
  sub.subject_name,
  sub.subject_code,
  sub.grade_level,
  sgc.name AS grade_component_name
`

export const DEFAULT_ASSIGNMENT_SUBJECTS = ['English', 'Math', 'Science', 'Filipino']
export const DEFAULT_GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

export function normalizeGradeLevel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export async function ensureAssignmentsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id BIGSERIAL PRIMARY KEY,
      faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_faculty_id ON public.assignments (faculty_id)`)

  const cols = [
    ['title', 'VARCHAR(255)'],
    ['description', 'TEXT'],
    ['subject_id', 'INT REFERENCES public.subjects(id) ON DELETE SET NULL'],
    ['subject_name', 'VARCHAR(100)'],
    ['grade_level', 'VARCHAR(50)'],
    ['semester', 'INT'],
    ['file_path', 'VARCHAR(512)'],
    ['file_name', 'VARCHAR(512)'],
    ['file_size', 'BIGINT'],
    ['total_score', 'INT DEFAULT 100'],
    ['submission_deadline', 'TIMESTAMPTZ'],
    ['uploaded_by', 'VARCHAR(255)'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()'],
  ]
  for (const [name, type] of cols) {
    await pool.query(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS ${name} ${type}`)
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_subject_id ON public.assignments (subject_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_grade_level ON public.assignments (grade_level)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_subject_name ON public.assignments (subject_name)`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_assignments_submission_deadline ON public.assignments (submission_deadline)`,
  )

  const curriculumCols = [
    ['module_id', 'BIGINT'],
    ['topic_id', 'BIGINT'],
    ['module_order', 'INT NOT NULL DEFAULT 0'],
    ['status', "VARCHAR(20) NOT NULL DEFAULT 'published'"],
  ]
  for (const [name, type] of curriculumCols) {
    await pool.query(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS ${name} ${type}`)
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id BIGSERIAL PRIMARY KEY,
      assignment_id BIGINT NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
      student_id INT REFERENCES public.students(id) ON DELETE CASCADE,
      student_name VARCHAR(255),
      file_path VARCHAR(512),
      file_name VARCHAR(512),
      score INT,
      status VARCHAR(32) NOT NULL DEFAULT 'not_submitted',
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (assignment_id, student_id)
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON public.assignment_submissions (assignment_id)`,
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON public.assignment_submissions (student_id)`,
  )
  await pool.query(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS feedback TEXT`)
}

export function mapAssignmentRow(row) {
  if (!row) return null
  const subjectName = String(row.assignment_subject_name ?? row.subject_name ?? '').trim()
  const gradeLevel = String(row.assignment_grade_level ?? row.grade_level ?? '').trim()
  return {
    id: row.id != null ? String(row.id) : '',
    faculty_id: String(row.faculty_id ?? '').trim(),
    title: String(row.title ?? '').trim(),
    description: String(row.description ?? '').trim(),
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    subject_name: subjectName,
    subject_code: String(row.subject_code ?? '').trim(),
    grade_level: gradeLevel,
    semester: row.semester != null ? Number(row.semester) : null,
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    file_size: row.file_size != null ? Number(row.file_size) : null,
    grade_component_id: row.grade_component_id != null ? Number(row.grade_component_id) : null,
    grade_component_name: String(row.grade_component_name ?? '').trim(),
    total_score: row.total_score != null ? Number(row.total_score) : 100,
    submission_deadline: row.submission_deadline ?? null,
    uploaded_by: String(row.uploaded_by ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export function mapSubmissionRow(row, totalScore = 100) {
  if (!row) return null
  const score = row.score != null ? Number(row.score) : null
  const status = String(row.status ?? 'not_submitted').trim().toLowerCase()
  return {
    id: row.id != null ? String(row.id) : '',
    assignment_id: row.assignment_id != null ? String(row.assignment_id) : '',
    student_id: row.student_id != null ? String(row.student_id) : '',
    student_name:
      submissionStudentDisplayName(row) ||
      (row.student_id != null ? `Student #${row.student_id}` : ''),
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    score,
    status,
    submitted_at: row.submitted_at ?? null,
    feedback: String(row.feedback ?? '').trim(),
    total_score: totalScore,
  }
}

export async function expireUnsubmittedForAssignment(pool, assignmentId) {
  const { rowCount } = await pool.query(
    `
    UPDATE assignment_submissions AS s
    SET score = 0, status = 'expired', updated_at = NOW()
    WHERE s.assignment_id = $1
      AND s.status = 'not_submitted'
      AND s.submitted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id = s.assignment_id AND a.submission_deadline < NOW()
      )
    `,
    [assignmentId],
  )
  return rowCount ?? 0
}

async function studentsArchiveFilterSql(pool) {
  try {
    const { rows } = await pool.query(
      `
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'archived_at'
      LIMIT 1
      `,
    )
    return rows?.length ? ' AND st.archived_at IS NULL ' : ''
  } catch {
    return ''
  }
}

async function fetchStudentRowsForGradeLevel(pool, gradeNorm) {
  const archiveSql = await studentsArchiveFilterSql(pool)
  const { rows } = await pool.query(
    `
    SELECT st.id, st.first_name, st.middle_name, st.last_name
    FROM students st
    JOIN sections sec ON st.section_id = sec.id
    WHERE (
      lower(trim(coalesce(sec.grade_level, ''))) = $1
      OR lower(trim(coalesce(st.grade_level, ''))) = $1
    )
    ${archiveSql}
    `,
    [gradeNorm],
  )
  return decryptStudentRows(rows || [])
}

export async function seedSubmissionsForGradeLevel(pool, assignmentId, gradeLevel) {
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  if (!gradeNorm || !isAllowedHighSchoolGradeLevel(gradeLevel)) return 0

  const students = await fetchStudentRowsForGradeLevel(pool, gradeNorm)
  let inserted = 0
  for (const st of students) {
    const studentName = studentDisplayName(st)
    const { rowCount } = await pool.query(
      `
      INSERT INTO assignment_submissions (assignment_id, student_id, student_name, status, score, created_at)
      VALUES ($1, $2, $3, 'not_submitted', NULL, NOW())
      ON CONFLICT (assignment_id, student_id) DO NOTHING
      `,
      [assignmentId, st.id, studentName || `Student #${st.id}`],
    )
    inserted += rowCount ?? 0
  }
  return inserted
}

export async function refreshSubmissionStudentNames(pool, assignmentId) {
  const { rows } = await pool.query(
    `
    SELECT s.id AS submission_id, s.student_name, st.first_name, st.middle_name, st.last_name
    FROM assignment_submissions s
    JOIN students st ON st.id = s.student_id
    WHERE s.assignment_id = $1
      AND (
        s.student_name IS NULL
        OR trim(s.student_name) = ''
        OR s.student_name LIKE '%enc:v1:%'
      )
    `,
    [assignmentId],
  )
  let updated = 0
  for (const row of rows || []) {
    const name = submissionStudentDisplayName(row)
    if (!name) continue
    await pool.query(
      `UPDATE assignment_submissions SET student_name = $1, updated_at = NOW() WHERE id = $2`,
      [name, row.submission_id],
    )
    updated += 1
  }
  return updated
}

export async function fetchSubmissionsForAssignment(pool, assignmentId, gradeLevel) {
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  const { rows } = await pool.query(
    `
    SELECT s.*, st.first_name, st.middle_name, st.last_name
    FROM assignment_submissions s
    JOIN students st ON s.student_id = st.id
    JOIN sections sec ON st.section_id = sec.id
    WHERE s.assignment_id = $1
      AND (
        lower(trim(coalesce(sec.grade_level, ''))) = $2
        OR lower(trim(coalesce(st.grade_level, ''))) = $2
      )
    ORDER BY s.id
    `,
    [assignmentId, gradeNorm],
  )
  return rows || []
}

export async function fetchAssignmentById(pool, assignmentId, facultyId) {
  const { rows } = await pool.query(
    `
    SELECT ${ASSIGNMENT_SELECT}
    FROM assignments a
    LEFT JOIN subjects sub ON sub.id = a.subject_id
    LEFT JOIN subject_grade_components sgc ON sgc.id = a.grade_component_id
    WHERE a.id = $1 AND a.faculty_id::text = $2::text
    LIMIT 1
    `,
    [assignmentId, String(facultyId)],
  )
  return rows?.[0] ?? null
}

export async function fetchAssignmentFormOptions(pool) {
  const subjects = new Set(DEFAULT_ASSIGNMENT_SUBJECTS)
  const gradeLevels = new Set(DEFAULT_GRADE_LEVELS)

  try {
    const { rows: subjectRows } = await pool.query(
      `
      SELECT DISTINCT trim(subject_name) AS name
      FROM subjects
      WHERE subject_name IS NOT NULL AND trim(subject_name) <> ''
      ORDER BY name
      `,
    )
    for (const row of subjectRows || []) {
      const name = String(row.name ?? '').trim()
      if (name) subjects.add(name)
    }
  } catch {
    /* ignore */
  }

  try {
    const { rows: gradeRows } = await pool.query(
      `
      SELECT DISTINCT trim(grade_level) AS grade_level
      FROM (
        SELECT grade_level FROM sections WHERE grade_level IS NOT NULL AND trim(grade_level) <> ''
        UNION
        SELECT grade_level FROM students WHERE grade_level IS NOT NULL AND trim(grade_level) <> ''
      ) g
      ORDER BY grade_level
      `,
    )
    for (const row of gradeRows || []) {
      const grade = String(row.grade_level ?? '').trim()
      if (grade) gradeLevels.add(grade)
    }
  } catch {
    /* ignore */
  }

  return {
    subjects: [...subjects].sort((a, b) => a.localeCompare(b)),
    gradeLevels: filterGradeLevelsForDropdown([...gradeLevels]),
  }
}

export async function resolveSubjectIdForAssignment(pool, facultyId, subjectName, gradeLevel) {
  const name = String(subjectName ?? '').trim()
  const grade = String(gradeLevel ?? '').trim()
  if (!name || !grade) return { subjectId: null }
  try {
    const { rows: facultyRows } = await pool.query(
      `
      SELECT id FROM subjects
      WHERE faculty_id::text = $1::text
        AND lower(trim(subject_name)) = lower(trim($2::text))
        AND lower(trim(grade_level)) = lower(trim($3::text))
      ORDER BY id
      LIMIT 1
      `,
      [String(facultyId), name, grade],
    )
    if (facultyRows?.[0]?.id != null) {
      return { subjectId: Number(facultyRows[0].id) }
    }
    const { rows } = await pool.query(
      `
      SELECT id FROM subjects
      WHERE lower(trim(subject_name)) = lower(trim($1::text))
        AND lower(trim(grade_level)) = lower(trim($2::text))
      ORDER BY id
      LIMIT 1
      `,
      [name, grade],
    )
    const row = rows?.[0]
    return { subjectId: row?.id != null ? Number(row.id) : null }
  } catch {
    return { subjectId: null }
  }
}

export function deleteAssignmentFiles(row) {
  if (row?.file_path) deleteAssignmentFileByUrl(row.file_path)
}

export async function upsertStudentAssignmentSubmission(pool, { assignmentId, studentId, studentName, fileMeta }) {
  const { rows } = await pool.query(
    `
      INSERT INTO assignment_submissions (
        assignment_id, student_id, student_name, file_path, file_name, status, submitted_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'submitted', NOW(), NOW())
      ON CONFLICT (assignment_id, student_id) DO UPDATE SET
        file_path = EXCLUDED.file_path,
        file_name = EXCLUDED.file_name,
        status = 'submitted',
        score = NULL,
        feedback = NULL,
        submitted_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
    [
      assignmentId,
      studentId,
      studentName,
      fileMeta.file_path,
      fileMeta.file_name,
    ],
  )
  return rows?.[0] ?? null
}

export async function fetchAssignmentByIdForStudent(pool, assignmentId) {
  const { rows } = await pool.query(
    `
      SELECT ${ASSIGNMENT_SELECT}
      FROM assignments a
      LEFT JOIN subjects sub ON sub.id = a.subject_id
      LEFT JOIN subject_grade_components sgc ON sgc.id = a.grade_component_id
      WHERE a.id = $1
      LIMIT 1
    `,
    [assignmentId],
  )
  return rows?.[0] ?? null
}

export { ASSIGNMENT_SELECT }
