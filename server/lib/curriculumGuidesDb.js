import { curriculumMimeForFileName } from './curriculumGuideStorage.js'

let publishColumnsMemo = null

const PUBLISH_COLUMN_SPECS = [
  ['title', 'VARCHAR(255) NULL'],
  ['file_url', 'TEXT NULL'],
  ['grade_level', 'VARCHAR(50) NULL'],
  ['is_published', 'BOOLEAN NOT NULL DEFAULT false'],
  ['uploaded_by_name', 'VARCHAR(255) NULL'],
  ['source', "VARCHAR(32) NOT NULL DEFAULT 'app_state'"],
  ['created_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
]

export async function ensureCurriculumGuidesPublishColumns(pool) {
  if (publishColumnsMemo) return publishColumnsMemo
  try {
    const { rows } = await pool.query(
      `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'curriculum_guides'
      `,
    )
    const existing = new Set((rows || []).map((r) => r.column_name))
    for (const [col, ddl] of PUBLISH_COLUMN_SPECS) {
      if (!existing.has(col)) {
        await pool.query(`ALTER TABLE curriculum_guides ADD COLUMN ${col} ${ddl}`)
        existing.add(col)
      }
    }
    await pool.query(`
      UPDATE curriculum_guides
      SET is_published = true
      WHERE COALESCE(source, 'app_state') = 'app_state'
        AND is_published = false
        AND COALESCE(NULLIF(TRIM(file_url), ''), NULLIF(TRIM(file_data_url), '')) <> ''
    `)
    publishColumnsMemo = true
    return true
  } catch {
    publishColumnsMemo = false
    return false
  }
}

function mapGuideRow(row) {
  if (!row) return null
  const fileUrlRaw = String(row.file_url ?? '').trim()
  const fileData = String(row.file_data_url ?? '').trim()
  const fileUrl = fileData.startsWith('data:') ? fileData : fileUrlRaw || fileData
  const gradeLevel = String(row.grade_level ?? row.grade ?? '').trim()
  const title =
    String(row.title ?? '').trim() ||
    String(row.subject ?? '').trim() ||
    String(row.file_name ?? '').trim() ||
    'Curriculum guide'
  const created = row.created_at ?? row.updated_at ?? null
  return {
    id: String(row.id),
    title,
    file_name: String(row.file_name ?? '').trim() || pathBasename(fileUrl) || 'guide.pdf',
    file_url: fileUrl,
    grade_level: gradeLevel || null,
    subject: String(row.subject ?? '').trim() || null,
    description: String(row.description ?? '').trim() || null,
    uploaded_by_name: String(row.uploaded_by_name ?? row.uploaded_by ?? '').trim() || null,
    is_published: row.is_published === true,
    source: String(row.source ?? 'app_state').trim(),
    created_at: created,
  }
}

function pathBasename(url) {
  const t = String(url || '').trim()
  if (!t) return ''
  const i = t.lastIndexOf('/')
  return i >= 0 ? t.slice(i + 1) : t
}

export async function listPublishedCurriculumGuides(pool, filters = {}) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const params = []
  let sql = `
    SELECT *
    FROM curriculum_guides
    WHERE is_published = true
  `
  const grade = String(filters.grade_level || '').trim()
  const subject = String(filters.subject || '').trim()
  if (grade && grade !== 'All Grades') {
    params.push(grade)
    sql += ` AND COALESCE(NULLIF(TRIM(grade_level), ''), NULLIF(TRIM(grade), '')) = $${params.length}`
  }
  if (subject && subject !== 'All Subjects') {
    params.push(subject)
    sql += ` AND NULLIF(TRIM(subject), '') = $${params.length}`
  }
  sql += ` ORDER BY COALESCE(created_at, updated_at) DESC NULLS LAST, id DESC`
  const { rows } = await pool.query(sql, params)
  return (rows || []).map(mapGuideRow).filter((r) => r?.file_url)
}

export async function listAdminCurriculumGuides(pool) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const { rows } = await pool.query(
    `
    SELECT *
    FROM curriculum_guides
    WHERE archived_at IS NULL
    ORDER BY COALESCE(created_at, updated_at) DESC NULLS LAST, id DESC
    `,
  )
  return (rows || []).map(mapGuideRow).filter(Boolean)
}

export async function insertAdminCurriculumGuide(pool, payload) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const id = payload.id
  const {
    title,
    file_name,
    file_url,
    grade_level,
    subject,
    description,
    uploaded_by,
    uploaded_by_name,
    is_published,
  } = payload
  const descriptionText = String(description ?? title ?? subject ?? file_name ?? '').trim()
  await pool.query(
    `
    INSERT INTO curriculum_guides (
      id, grade, subject, description, file_name, file_type, file_data_url,
      uploaded_at, uploaded_by, updated_at,
      title, file_url, grade_level, is_published, uploaded_by_name, source, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, NOW(),
      $10, $11, $12, $13, $14, 'admin_upload', NOW()
    )
    `,
    [
      id,
      grade_level || '',
      subject || '',
      descriptionText,
      file_name,
      curriculumMimeForFileName(file_name),
      file_url,
      new Date().toISOString(),
      uploaded_by || null,
      title,
      file_url,
      grade_level || null,
      is_published === true,
      uploaded_by_name || null,
    ],
  )
  return mapGuideRow({
    id,
    title,
    file_name,
    file_url,
    grade_level,
    subject,
    description: descriptionText,
    uploaded_by_name,
    is_published,
    source: 'admin_upload',
    created_at: new Date(),
  })
}

export async function updateAdminCurriculumGuide(pool, id, payload) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const existing = await fetchCurriculumGuideById(pool, id)
  if (!existing) return null
  if (existing.source === 'app_state') {
    const err = new Error('APP_STATE_SYNCED')
    err.code = 'APP_STATE_SYNCED'
    throw err
  }

  const title = String(payload.title ?? payload.subject ?? existing.title ?? '').trim()
  const subject = String(payload.subject ?? existing.subject ?? title).trim()
  const grade_level = String(payload.grade_level ?? payload.grade ?? existing.grade_level ?? '').trim()
  const description = String(payload.description ?? existing.description ?? title).trim()
  const file_name = String(payload.file_name ?? existing.file_name ?? '').trim()
  const file_url = String(payload.file_url ?? existing.file_url ?? '').trim()
  const file_type = String(payload.file_type ?? curriculumMimeForFileName(file_name)).trim()

  await pool.query(
    `
    UPDATE curriculum_guides
    SET grade = $2,
        subject = $3,
        description = $4,
        file_name = $5,
        file_type = $6,
        file_data_url = $7,
        title = $8,
        file_url = $9,
        grade_level = $10,
        updated_at = NOW()
    WHERE id = $1
    `,
    [String(id), grade_level, subject, description, file_name, file_type, file_url, title, file_url, grade_level],
  )
  return fetchCurriculumGuideById(pool, id)
}

export async function setCurriculumGuidePublished(pool, id, isPublished) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const { rowCount } = await pool.query(
    `UPDATE curriculum_guides SET is_published = $2, updated_at = NOW() WHERE id = $1`,
    [String(id), isPublished === true],
  )
  return rowCount > 0
}

export async function fetchCurriculumGuideById(pool, id) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const { rows } = await pool.query(`SELECT * FROM curriculum_guides WHERE id = $1 LIMIT 1`, [String(id)])
  return mapGuideRow(rows?.[0])
}

export async function deleteCurriculumGuideById(pool, id) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const row = await fetchCurriculumGuideById(pool, id)
  if (!row) return null
  if (row.source === 'app_state') {
    const err = new Error('APP_STATE_SYNCED')
    err.code = 'APP_STATE_SYNCED'
    throw err
  }
  await pool.query(`DELETE FROM curriculum_guides WHERE id = $1`, [String(id)])
  return row
}
