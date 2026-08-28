import { normalizeGradingCriteria } from './curriculumGuidesDb.js'

let schemaMemo = null

const UNIT_COLUMNS = `id, curriculum_guide_id, subject_id, title, description, grading_criteria, unit_order, created_at, updated_at`

function mapUnitRow(row) {
  if (!row) return row
  return { ...row, grading_criteria: normalizeGradingCriteria(row.grading_criteria) }
}

export async function ensureCurriculumGuideUnitsSchema(pool) {
  if (schemaMemo) return schemaMemo
  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculum_guide_units (
      id BIGSERIAL PRIMARY KEY,
      curriculum_guide_id VARCHAR(64) NOT NULL REFERENCES curriculum_guides(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      unit_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  const weightCols = [
    ['written_work_pct', 'INT'],
    ['performance_task_pct', 'INT'],
    ['exam_pct', 'INT'],
  ]
  for (const [col, typ] of weightCols) {
    await pool.query(`ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS ${col} ${typ}`)
  }
  // Grade-level guides can now hold units tied to a specific subject with their own grading
  // template, instead of the whole guide being locked to one subject.
  await pool.query(
    `ALTER TABLE curriculum_guide_units ADD COLUMN IF NOT EXISTS subject_id INT REFERENCES subjects(id) ON DELETE SET NULL`,
  )
  await pool.query(`ALTER TABLE curriculum_guide_units ADD COLUMN IF NOT EXISTS grading_criteria JSONB`)
  // The guide-level "subject" requirement predates units — a guide can now be created for a
  // whole grade level with each unit connected to its own subject.
  await pool.query(`ALTER TABLE curriculum_guides ALTER COLUMN subject DROP NOT NULL`)
  schemaMemo = true
  return schemaMemo
}

export async function listUnitsForGuide(pool, guideId) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const { rows } = await pool.query(
    `SELECT ${UNIT_COLUMNS}
     FROM curriculum_guide_units WHERE curriculum_guide_id = $1 ORDER BY unit_order ASC, id ASC`,
    [String(guideId)],
  )
  return rows.map(mapUnitRow)
}

export async function listUnitsForGuides(pool, guideIds) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const ids = (guideIds || []).map(String).filter(Boolean)
  if (!ids.length) return {}
  const { rows } = await pool.query(
    `SELECT ${UNIT_COLUMNS}
     FROM curriculum_guide_units WHERE curriculum_guide_id = ANY($1::varchar[]) ORDER BY unit_order ASC, id ASC`,
    [ids],
  )
  const byGuide = {}
  for (const row of rows.map(mapUnitRow)) {
    const key = row.curriculum_guide_id
    if (!byGuide[key]) byGuide[key] = []
    byGuide[key].push(row)
  }
  return byGuide
}

/** List every unit connected to a subject, across all guides — used to resolve a subject's active template. */
export async function listUnitsForSubject(pool, subjectId) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const { rows } = await pool.query(
    `SELECT ${UNIT_COLUMNS} FROM curriculum_guide_units WHERE subject_id = $1 ORDER BY unit_order ASC, id ASC`,
    [Number(subjectId)],
  )
  return rows.map(mapUnitRow)
}

export async function createUnit(pool, guideId, { title, description, unit_order, subject_id, grading_criteria }) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const { rows: guide } = await pool.query(
    `SELECT id FROM curriculum_guides WHERE id = $1 LIMIT 1`,
    [String(guideId)],
  )
  if (!guide[0]) return null
  const criteria = normalizeGradingCriteria(grading_criteria)
  const { rows } = await pool.query(
    `INSERT INTO curriculum_guide_units (curriculum_guide_id, title, description, unit_order, subject_id, grading_criteria)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${UNIT_COLUMNS}`,
    [
      String(guideId),
      String(title).trim(),
      description != null ? String(description).trim() : null,
      Number(unit_order ?? 0),
      subject_id != null && subject_id !== '' ? Number(subject_id) : null,
      criteria.length ? JSON.stringify(criteria) : null,
    ],
  )
  return mapUnitRow(rows[0])
}

export async function updateUnit(pool, unitId, guideId, { title, description, unit_order, subject_id, grading_criteria }) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const sets = ['updated_at = NOW()']
  const params = []
  let n = 1
  if (title != null) {
    sets.push(`title = $${n++}`)
    params.push(String(title).trim())
  }
  if (description !== undefined) {
    sets.push(`description = $${n++}`)
    params.push(description != null ? String(description).trim() : null)
  }
  if (unit_order != null) {
    sets.push(`unit_order = $${n++}`)
    params.push(Number(unit_order))
  }
  if (subject_id !== undefined) {
    sets.push(`subject_id = $${n++}`)
    params.push(subject_id != null && subject_id !== '' ? Number(subject_id) : null)
  }
  if (grading_criteria !== undefined) {
    const criteria = normalizeGradingCriteria(grading_criteria)
    sets.push(`grading_criteria = $${n++}`)
    params.push(criteria.length ? JSON.stringify(criteria) : null)
  }
  if (sets.length === 1) return null
  params.push(Number(unitId), String(guideId))
  const { rows } = await pool.query(
    `UPDATE curriculum_guide_units SET ${sets.join(', ')}
     WHERE id = $${n++} AND curriculum_guide_id = $${n}
     RETURNING ${UNIT_COLUMNS}`,
    params,
  )
  return mapUnitRow(rows[0]) || null
}

export async function deleteUnit(pool, unitId, guideId) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const r = await pool.query(
    `DELETE FROM curriculum_guide_units WHERE id = $1 AND curriculum_guide_id = $2`,
    [Number(unitId), String(guideId)],
  )
  return Number(r.rowCount ?? 0) > 0
}

/** Bulk-set unit_order from an ordered array of unit ids. Ignores ids that don't belong to this guide. */
export async function reorderUnits(pool, guideId, orderedUnitIds) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const ids = (orderedUnitIds || []).map(Number).filter(Number.isFinite)
  if (!ids.length) return []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE curriculum_guide_units SET unit_order = $1, updated_at = NOW()
         WHERE id = $2 AND curriculum_guide_id = $3`,
        [i, ids[i], String(guideId)],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return listUnitsForGuide(pool, guideId)
}
