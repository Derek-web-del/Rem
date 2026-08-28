import { listUnitsForGuide } from './curriculumGuideUnitsDb.js'

let schemaMemo = null

export async function ensureSubjectSyllabusWeeksSchema(pool) {
  if (schemaMemo) return schemaMemo
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_syllabus_weeks (
      id BIGSERIAL PRIMARY KEY,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      source_unit_id BIGINT REFERENCES curriculum_guide_units(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      week_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  schemaMemo = true
  return schemaMemo
}

export async function listWeeksForSubject(pool, subjectId) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const { rows } = await pool.query(
    `SELECT id, subject_id, source_unit_id, title, content, week_order, created_at, updated_at
     FROM subject_syllabus_weeks WHERE subject_id = $1 ORDER BY week_order ASC, id ASC`,
    [Number(subjectId)],
  )
  return rows
}

/** The subject's linked curriculum guide, for the "derived from" label and generation source. */
async function fetchLinkedCurriculumGuide(pool, subjectId) {
  const { rows } = await pool.query(
    `
    SELECT cg.id, cg.title, cg.subject, cg.grade_level
    FROM subjects s
    JOIN curriculum_guides cg ON cg.id::text = s.curriculum_guide_id::text
    WHERE s.id = $1
    LIMIT 1
    `,
    [Number(subjectId)],
  )
  return rows[0] || null
}

/**
 * If this subject has no syllabus weeks yet and its linked curriculum guide has units,
 * copy those units in as the initial week list (one-time — later edits are the teacher's own).
 * Returns { weeks, derivedFrom } either way.
 */
export async function generateFromCurriculumIfEmpty(pool, subjectId) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const existing = await listWeeksForSubject(pool, subjectId)
  const guide = await fetchLinkedCurriculumGuide(pool, subjectId)
  const derivedFrom = guide ? [guide.grade_level, guide.subject || guide.title].filter(Boolean).join(' ') : null

  if (existing.length > 0 || !guide) {
    return { weeks: existing, derivedFrom: existing.length > 0 ? derivedFrom : null }
  }

  const guideUnits = await listUnitsForGuide(pool, guide.id)
  // A grade-level guide can hold units for several subjects — once any unit in it is
  // connected to a specific subject, only that subject's units seed its syllabus. A guide
  // with no subject-connected units at all falls back to the old one-guide-one-subject
  // behavior of using every unit.
  const subjectUnits = guideUnits.filter((u) => Number(u.subject_id) === Number(subjectId))
  const hasAnyConnectedUnit = guideUnits.some((u) => u.subject_id != null)
  const units = hasAnyConnectedUnit ? subjectUnits : guideUnits
  if (!units.length) {
    return { weeks: [], derivedFrom: null }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < units.length; i += 1) {
      await client.query(
        `INSERT INTO subject_syllabus_weeks (subject_id, source_unit_id, title, content, week_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [Number(subjectId), units[i].id, units[i].title, units[i].description || null, i],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return { weeks: await listWeeksForSubject(pool, subjectId), derivedFrom }
}

export async function createWeek(pool, subjectId, { title, content, week_order }) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const { rows } = await pool.query(
    `INSERT INTO subject_syllabus_weeks (subject_id, title, content, week_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [Number(subjectId), String(title).trim(), content != null ? String(content).trim() : null, Number(week_order ?? 0)],
  )
  return rows[0]
}

export async function updateWeek(pool, weekId, subjectId, { title, content, week_order }) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const sets = ['updated_at = NOW()']
  const params = []
  let n = 1
  if (title != null) {
    sets.push(`title = $${n++}`)
    params.push(String(title).trim())
  }
  if (content !== undefined) {
    sets.push(`content = $${n++}`)
    params.push(content != null ? String(content).trim() : null)
  }
  if (week_order != null) {
    sets.push(`week_order = $${n++}`)
    params.push(Number(week_order))
  }
  if (sets.length === 1) return null
  params.push(Number(weekId), Number(subjectId))
  const { rows } = await pool.query(
    `UPDATE subject_syllabus_weeks SET ${sets.join(', ')}
     WHERE id = $${n++} AND subject_id = $${n}
     RETURNING *`,
    params,
  )
  return rows[0] || null
}

export async function deleteWeek(pool, weekId, subjectId) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const r = await pool.query(
    `DELETE FROM subject_syllabus_weeks WHERE id = $1 AND subject_id = $2`,
    [Number(weekId), Number(subjectId)],
  )
  return Number(r.rowCount ?? 0) > 0
}

export async function reorderWeeks(pool, subjectId, orderedWeekIds) {
  await ensureSubjectSyllabusWeeksSchema(pool)
  const ids = (orderedWeekIds || []).map(Number).filter(Number.isFinite)
  if (!ids.length) return []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE subject_syllabus_weeks SET week_order = $1, updated_at = NOW()
         WHERE id = $2 AND subject_id = $3`,
        [i, ids[i], Number(subjectId)],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return listWeeksForSubject(pool, subjectId)
}
