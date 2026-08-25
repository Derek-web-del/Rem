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

/** Normalize a stored grading_criteria value (JSONB, already parsed by `pg`) to a clean array. */
export function normalizeGradingCriteria(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((row) => ({
      name: String(row?.name ?? '').trim(),
      percentage: Number(row?.percentage ?? 0),
    }))
    .filter((row) => row.name)
}

/**
 * Validates a custom criteria list: {name, percentage}[] — unique names, each
 * percentage 0-100, summing to exactly 100. Mirrors the same rule already used
 * for subject-level grade components, minus the assignment/activity/quiz
 * mapping fields (curriculum guides don't route work items, so they don't need it).
 */
export function validateGradingCriteria(list) {
  if (!Array.isArray(list) || !list.length) {
    return { ok: false, message: 'At least one grading criterion is required.' }
  }
  const names = new Set()
  let total = 0
  const cleaned = []
  for (const row of list) {
    const name = String(row?.name ?? '').trim()
    if (!name) return { ok: false, message: 'Each criterion needs a title.' }
    const key = name.toLowerCase()
    if (names.has(key)) return { ok: false, message: `Duplicate criterion title: ${name}` }
    names.add(key)
    const pct = Number(row?.percentage ?? row?.percent ?? 0)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, message: 'Each percentage must be between 0 and 100.' }
    }
    total += pct
    cleaned.push({ name, percentage: pct })
  }
  if (total !== 100) {
    return { ok: false, message: `Grading criteria must sum to 100% (currently ${total}%).` }
  }
  return { ok: true, criteria: cleaned }
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
    // Only ever a real name — never a fabricated placeholder like "guide.pdf" that reads
    // as a real file when none is actually attached (e.g. after a Spaces storage failure).
    file_name: String(row.file_name ?? '').trim() || (fileUrl ? pathBasename(fileUrl) : '') || null,
    file_url: fileUrl,
    grade_level: gradeLevel || null,
    subject: String(row.subject ?? '').trim() || null,
    description: String(row.description ?? '').trim() || null,
    uploaded_by_name: String(row.uploaded_by_name ?? row.uploaded_by ?? '').trim() || null,
    is_published: row.is_published === true,
    source: String(row.source ?? 'app_state').trim(),
    created_at: created,
    grading_criteria: normalizeGradingCriteria(row.grading_criteria),
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
  return (rows || []).map(mapGuideRow).filter(Boolean)
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
    grading_criteria,
  } = payload
  const descriptionText = String(description ?? title ?? subject ?? file_name ?? '').trim()
  const criteria = normalizeGradingCriteria(grading_criteria)
  await pool.query(
    `
    INSERT INTO curriculum_guides (
      id, grade, subject, description, file_name, file_type, file_data_url,
      uploaded_at, uploaded_by, updated_at,
      title, file_url, grade_level, is_published, uploaded_by_name, source, created_at,
      grading_criteria
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, NOW(),
      $10, $11, $12, $13, $14, 'admin_upload', NOW(),
      $15
    )
    `,
    [
      id,
      grade_level || '',
      subject || '',
      descriptionText,
      file_name || null,
      file_name ? curriculumMimeForFileName(file_name) : null,
      file_url || null,
      new Date().toISOString(),
      uploaded_by || null,
      title,
      file_url || null,
      grade_level || null,
      is_published === true,
      uploaded_by_name || null,
      criteria.length ? JSON.stringify(criteria) : null,
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
    grading_criteria: criteria,
  })
}

export async function updateAdminCurriculumGuide(pool, id, payload) {
  await ensureCurriculumGuidesPublishColumns(pool)
  const existing = await fetchCurriculumGuideById(pool, id)
  if (!existing) return null

  const title = String(payload.title ?? payload.subject ?? existing.title ?? '').trim()
  const subject = String(payload.subject ?? existing.subject ?? title).trim()
  const grade_level = String(payload.grade_level ?? payload.grade ?? existing.grade_level ?? '').trim()
  const description = String(payload.description ?? existing.description ?? title).trim()
  const file_name = String(payload.file_name ?? existing.file_name ?? '').trim()
  const file_url = String(payload.file_url ?? existing.file_url ?? '').trim()
  const file_type = file_name ? curriculumMimeForFileName(file_name) : null
  const criteria = normalizeGradingCriteria(
    payload.grading_criteria !== undefined ? payload.grading_criteria : existing.grading_criteria,
  )
  const uploaded_by_name = payload.uploaded_by_name ?? existing.uploaded_by_name ?? null

  /** Any admin edit claims ownership from the legacy app_state mirror so it can't be silently resurrected/overwritten by a future state sync. */
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
        source = 'admin_upload',
        grading_criteria = $11,
        uploaded_by_name = $12,
        updated_at = NOW()
    WHERE id = $1
    `,
    [
      String(id),
      grade_level,
      subject,
      description,
      file_name || null,
      file_type,
      file_url || null,
      title,
      file_url || null,
      grade_level,
      criteria.length ? JSON.stringify(criteria) : null,
      uploaded_by_name,
    ],
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
  await pool.query(`DELETE FROM curriculum_guides WHERE id = $1`, [String(id)])
  return row
}
