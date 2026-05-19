import { deleteAssignmentFileByUrl } from './assignmentStorage.js'
import { filterGradeLevelsForDropdown, isAllowedHighSchoolGradeLevel } from './gradeLevels.js'

const ASSIGNMENT_SELECT = `
  a.id,
  a.faculty_id,
  a.title,
  a.description,
  a.subject_id,
  a.subject_name AS assignment_subject_name,
  a.grade_level AS assignment_grade_level,
  a.quarter,
  a.file_path,
  a.file_name,
  a.file_size,
  a.total_score,
  a.submission_deadline,
  a.uploaded_by,
  a.created_at,
  a.updated_at,
  sub.subject_name,
  sub.subject_code,
  sub.grade_level
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
    ['quarter', 'INT'],
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
    quarter: row.quarter != null ? Number(row.quarter) : null,
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    file_size: row.file_size != null ? Number(row.file_size) : null,
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
    student_name: String(row.student_name ?? '').trim(),
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    score,
    status,
    submitted_at: row.submitted_at ?? null,
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

export async function seedSubmissionsForGradeLevel(pool, assignmentId, gradeLevel) {
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  if (!gradeNorm || !isAllowedHighSchoolGradeLevel(gradeLevel)) return 0

  let archiveSql = ''
  try {
    const { rows } = await pool.query(
      `
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'archived_at'
      LIMIT 1
      `,
    )
    if (rows?.length) archiveSql = ' AND st.archived_at IS NULL '
  } catch {
    /* ignore */
  }

  const { rowCount } = await pool.query(
    `
    INSERT INTO assignment_submissions (assignment_id, student_id, student_name, status, score, created_at)
    SELECT
      $1,
      st.id,
      trim(concat_ws(' ',
        nullif(trim(st.first_name), ''),
        nullif(trim(st.middle_name), ''),
        nullif(trim(st.last_name), '')
      )),
      'not_submitted',
      NULL,
      NOW()
    FROM students st
    JOIN sections sec ON st.section_id = sec.id
    WHERE (
      lower(trim(coalesce(sec.grade_level, ''))) = $2
      OR lower(trim(coalesce(st.grade_level, ''))) = $2
    )
    ${archiveSql}
    AND NOT EXISTS (
      SELECT 1 FROM assignment_submissions s
      WHERE s.assignment_id = $1 AND s.student_id = st.id
    )
    `,
    [assignmentId, gradeNorm],
  )
  return rowCount ?? 0
}

export async function fetchSubmissionsForAssignment(pool, assignmentId, gradeLevel) {
  const gradeNorm = normalizeGradeLevel(gradeLevel)
  const { rows } = await pool.query(
    `
    SELECT s.*
    FROM assignment_submissions s
    JOIN students st ON s.student_id = st.id
    JOIN sections sec ON st.section_id = sec.id
    WHERE s.assignment_id = $1
      AND (
        lower(trim(coalesce(sec.grade_level, ''))) = $2
        OR lower(trim(coalesce(st.grade_level, ''))) = $2
      )
    ORDER BY COALESCE(lower(s.student_name), ''), s.id
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

export { ASSIGNMENT_SELECT }
