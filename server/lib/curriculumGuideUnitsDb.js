let schemaMemo = null

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
  schemaMemo = true
  return schemaMemo
}

export async function listUnitsForGuide(pool, guideId) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const { rows } = await pool.query(
    `SELECT id, curriculum_guide_id, title, description, unit_order, created_at, updated_at
     FROM curriculum_guide_units WHERE curriculum_guide_id = $1 ORDER BY unit_order ASC, id ASC`,
    [String(guideId)],
  )
  return rows
}

export async function listUnitsForGuides(pool, guideIds) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const ids = (guideIds || []).map(String).filter(Boolean)
  if (!ids.length) return {}
  const { rows } = await pool.query(
    `SELECT id, curriculum_guide_id, title, description, unit_order, created_at, updated_at
     FROM curriculum_guide_units WHERE curriculum_guide_id = ANY($1::varchar[]) ORDER BY unit_order ASC, id ASC`,
    [ids],
  )
  const byGuide = {}
  for (const row of rows) {
    const key = row.curriculum_guide_id
    if (!byGuide[key]) byGuide[key] = []
    byGuide[key].push(row)
  }
  return byGuide
}

export async function createUnit(pool, guideId, { title, description, unit_order }) {
  await ensureCurriculumGuideUnitsSchema(pool)
  const { rows: guide } = await pool.query(
    `SELECT id FROM curriculum_guides WHERE id = $1 LIMIT 1`,
    [String(guideId)],
  )
  if (!guide[0]) return null
  const { rows } = await pool.query(
    `INSERT INTO curriculum_guide_units (curriculum_guide_id, title, description, unit_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [String(guideId), String(title).trim(), description != null ? String(description).trim() : null, Number(unit_order ?? 0)],
  )
  return rows[0]
}

export async function updateUnit(pool, unitId, guideId, { title, description, unit_order }) {
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
  if (sets.length === 1) return null
  params.push(Number(unitId), String(guideId))
  const { rows } = await pool.query(
    `UPDATE curriculum_guide_units SET ${sets.join(', ')}
     WHERE id = $${n++} AND curriculum_guide_id = $${n}
     RETURNING *`,
    params,
  )
  return rows[0] || null
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

/** Normalizes written_work_pct/performance_task_pct/exam_pct from a request body. Returns null fields untouched. */
export function readGradingWeights(body) {
  const pick = (v) => {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null
  }
  return {
    written_work_pct: pick(body?.written_work_pct ?? body?.writtenWorkPct),
    performance_task_pct: pick(body?.performance_task_pct ?? body?.performanceTaskPct),
    exam_pct: pick(body?.exam_pct ?? body?.examPct),
  }
}
