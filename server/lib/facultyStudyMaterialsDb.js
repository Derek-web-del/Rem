import { deleteStudyMaterialFileByUrl } from './studyMaterialStorage.js'

const MATERIAL_COLUMNS = `
  id, material_name, grade_level, subject, file_name, file_url, file_type, file_size,
  uploaded_by, uploaded_by_name, created_at, updated_at
`

const PDF_FILE_TYPE_CONSTRAINT = 'chk_study_materials_file_type_pdf'

const FACULTY_CATALOG_FILTER = `uploaded_by IS NOT NULL`

/** Delete legacy non-PDF faculty catalog rows (and their files) before PDF-only constraint can apply. */
export async function purgeNonPdfFacultyStudyMaterials(pool) {
  const { rows } = await pool.query(
    `
    SELECT id, file_url
    FROM study_materials
    WHERE ${FACULTY_CATALOG_FILTER}
      AND file_type IS NOT NULL AND upper(trim(file_type)) <> 'PDF'
    `,
  )
  for (const row of rows || []) {
    if (row?.file_url) {
      try {
        deleteStudyMaterialFileByUrl(row.file_url)
      } catch {
        /* best-effort file cleanup */
      }
    }
  }
  await pool.query(
    `
    DELETE FROM study_materials
    WHERE ${FACULTY_CATALOG_FILTER}
      AND file_type IS NOT NULL AND upper(trim(file_type)) <> 'PDF'
    `,
  )
  await pool.query(
    `
    UPDATE study_materials
    SET file_type = 'PDF'
    WHERE ${FACULTY_CATALOG_FILTER} AND file_type IS NULL
    `,
  )
}

async function ensurePdfFileTypeConstraint(pool) {
  await purgeNonPdfFacultyStudyMaterials(pool)
  await pool.query(
    `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = '${PDF_FILE_TYPE_CONSTRAINT}'
      ) THEN
        ALTER TABLE study_materials
          ADD CONSTRAINT ${PDF_FILE_TYPE_CONSTRAINT}
          CHECK (
            uploaded_by IS NULL
            OR file_type IS NULL
            OR file_type = 'PDF'
          );
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END $$
    `,
  )
}

export async function ensureFacultyStudyMaterialsSchema(pool) {
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
      quarter VARCHAR(16),
      grade_level VARCHAR(128),
      subject VARCHAR(128),
      uploaded_by VARCHAR(64),
      uploaded_by_name VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS file_name VARCHAR(512)`)
  await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS file_size BIGINT`)
  await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128)`)
  await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS subject VARCHAR(128)`)
  await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(64)`)
  await pool.query(
    `ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255)`,
  )
  await pool.query(
    `ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  )
  try {
    await pool.query(`ALTER TABLE study_materials ALTER COLUMN subject_id DROP NOT NULL`)
  } catch {
    /* column may not exist on very old schemas */
  }
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_study_materials_subject_id ON study_materials (subject_id)`,
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_study_materials_uploaded_by ON study_materials (uploaded_by)`,
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_study_materials_grade_level ON study_materials (grade_level)`,
  )
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_study_materials_subject ON study_materials (subject)`)
  await ensurePdfFileTypeConstraint(pool)
}

export function formatMaterialFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function mapFacultyStudyMaterialRow(row) {
  if (!row) return null
  const fileName = String(row.file_name ?? '').trim()
  const fileSize = row.file_size != null ? Number(row.file_size) : null
  const createdAt = row.created_at
  const title =
    String(row.material_name ?? row.title ?? row.file_name ?? 'Untitled Material').trim() ||
    'Untitled Material'
  return {
    id: row.id != null ? String(row.id) : '',
    title,
    grade_level: String(row.grade_level ?? '').trim(),
    subject: String(row.subject ?? '').trim(),
    file_name: fileName,
    file_url: String(row.file_url ?? '').trim(),
    file_type: 'PDF',
    file_size: fileSize,
    file_size_label: formatMaterialFileSize(fileSize),
    uploaded_by: String(row.uploaded_by ?? '').trim(),
    uploaded_by_name: String(row.uploaded_by_name ?? '').trim(),
    created_at: createdAt instanceof Date ? createdAt.toISOString() : createdAt ?? null,
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
  }
}

async function resolveSubjectIdForFacultyMaterial(pool, data) {
  const facultyId = String(data.uploaded_by ?? '').trim()
  const grade = String(data.grade_level ?? '').trim()
  const subj = String(data.subject ?? '').trim()
  if (!facultyId) return null
  try {
    const { rows } = await pool.query(
      `
      SELECT id FROM subjects
      WHERE faculty_id::text = $1::text
        AND (
          ($2 <> '' AND subject_code = $2)
          OR ($2 <> '' AND subject_name = $2)
          OR (
            $3 <> '' AND grade_level = $3
            AND ($2 = '' OR subject_code = $2 OR subject_name = $2)
          )
        )
      ORDER BY
        CASE
          WHEN $2 <> '' AND subject_code = $2 THEN 0
          WHEN $2 <> '' AND subject_name = $2 THEN 1
          ELSE 2
        END
      LIMIT 1
      `,
      [facultyId, subj, grade],
    )
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

export async function listFacultyStudyMaterials(pool, facultyId) {
  const { rows } = await pool.query(
    `
    SELECT ${MATERIAL_COLUMNS}
    FROM study_materials
    WHERE uploaded_by::text = $1::text
    ORDER BY created_at DESC, id DESC
    `,
    [String(facultyId)],
  )
  return (rows || []).map(mapFacultyStudyMaterialRow).filter(Boolean)
}

export async function fetchFacultyStudyMaterialById(pool, id, facultyId) {
  const { rows } = await pool.query(
    `
    SELECT ${MATERIAL_COLUMNS}
    FROM study_materials
    WHERE id = $1 AND uploaded_by::text = $2::text
    LIMIT 1
    `,
    [id, String(facultyId)],
  )
  return mapFacultyStudyMaterialRow(rows?.[0])
}

export async function insertFacultyStudyMaterial(pool, data) {
  const subjectId = await resolveSubjectIdForFacultyMaterial(pool, data)
  const title = String(data.title ?? data.file_name ?? 'Untitled Material').trim() || 'Untitled Material'
  const { rows } = await pool.query(
    `
    INSERT INTO study_materials (
      subject_id, material_name, grade_level, subject, file_name, file_url, file_type, file_size,
      uploaded_by, uploaded_by_name, unit_no, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'PDF', $7, $8, $9, '1', NOW())
    RETURNING ${MATERIAL_COLUMNS}
    `,
    [
      subjectId,
      title,
      data.grade_level,
      data.subject,
      data.file_name,
      data.file_url,
      data.file_size,
      String(data.uploaded_by),
      data.uploaded_by_name || null,
    ],
  )
  return mapFacultyStudyMaterialRow(rows?.[0])
}

export async function updateFacultyStudyMaterial(pool, id, facultyId, data) {
  const subjectId = await resolveSubjectIdForFacultyMaterial(pool, {
    uploaded_by: facultyId,
    grade_level: data.grade_level,
    subject: data.subject,
  })
  const title = String(data.title ?? data.file_name ?? 'Untitled Material').trim() || 'Untitled Material'
  const { rows } = await pool.query(
    `
    UPDATE study_materials
    SET subject_id = $1, material_name = $2, grade_level = $3, subject = $4, file_name = $5, file_url = $6,
        file_type = 'PDF', file_size = $7, updated_at = NOW()
    WHERE id = $8 AND uploaded_by::text = $9::text
    RETURNING ${MATERIAL_COLUMNS}
    `,
    [
      subjectId,
      title,
      data.grade_level,
      data.subject,
      data.file_name,
      data.file_url,
      data.file_size,
      id,
      String(facultyId),
    ],
  )
  return mapFacultyStudyMaterialRow(rows?.[0])
}

export async function deleteFacultyStudyMaterial(pool, id, facultyId) {
  const existing = await fetchFacultyStudyMaterialById(pool, id, facultyId)
  if (!existing) return null
  await pool.query(`DELETE FROM study_materials WHERE id = $1 AND uploaded_by::text = $2::text`, [
    id,
    String(facultyId),
  ])
  if (existing.file_url) deleteStudyMaterialFileByUrl(existing.file_url)
  return existing
}
