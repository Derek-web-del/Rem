const DEFAULT_SEED = [
  { name: 'Written Work', percentage: 25, color: '#3B82F6', maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
  { name: 'Performance Task', percentage: 45, color: '#F59E0B', maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
  { name: 'Quizzes', percentage: 15, color: '#8B5CF6', maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
  { name: 'Activities', percentage: 15, color: '#10B981', maps_to_assignment: false, maps_to_activity: true, is_quiz: false },
]

function mapsToArray(row) {
  if (row.is_quiz) return ['Quiz']
  const m = []
  if (row.maps_to_assignment) m.push('Assignment')
  if (row.maps_to_activity) m.push('Activity')
  return m
}

function mapComponentRow(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    percentage: Number(row.percentage),
    color: String(row.color || '#3B82F6'),
    component_order: Number(row.component_order ?? 0),
    maps_to_assignment: Boolean(row.maps_to_assignment),
    maps_to_activity: Boolean(row.maps_to_activity),
    is_quiz: Boolean(row.is_quiz),
    maps_to: mapsToArray(row),
  }
}

export async function ensureSubjectGradeCriteriaSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_grade_criteria (
      subject_id INT PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
      written_work_pct INT NOT NULL DEFAULT 25,
      performance_task_pct INT NOT NULL DEFAULT 45,
      quizzes_pct INT NOT NULL DEFAULT 15,
      activities_pct INT NOT NULL DEFAULT 15,
      written_work_color VARCHAR(32) DEFAULT '#3B82F6',
      performance_task_color VARCHAR(32) DEFAULT '#F59E0B',
      quizzes_color VARCHAR(32) DEFAULT '#8B5CF6',
      activities_color VARCHAR(32) DEFAULT '#10B981',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subject_grade_components (
      id BIGSERIAL PRIMARY KEY,
      subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      percentage INT NOT NULL DEFAULT 0,
      color VARCHAR(32) DEFAULT '#3B82F6',
      component_order INT NOT NULL DEFAULT 0,
      maps_to_assignment BOOLEAN NOT NULL DEFAULT false,
      maps_to_activity BOOLEAN NOT NULL DEFAULT false,
      is_quiz BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subject_grade_components_subject
    ON subject_grade_components (subject_id, component_order)
  `)
  await pool.query(`
    ALTER TABLE assignments ADD COLUMN IF NOT EXISTS grade_component_id BIGINT
      REFERENCES subject_grade_components(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS grade_component_id BIGINT
      REFERENCES subject_grade_components(id) ON DELETE SET NULL
  `)
  await pool.query(`
    ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS grade_component_id BIGINT
      REFERENCES subject_grade_components(id) ON DELETE SET NULL
  `)
}

async function migrateLegacyCriteriaRow(pool, subjectId) {
  const sid = Number(subjectId)
  const { rows: existing } = await pool.query(
    `SELECT id FROM subject_grade_components WHERE subject_id = $1 LIMIT 1`,
    [sid],
  )
  if (existing?.length) return

  const { rows: legacy } = await pool.query(
    `SELECT * FROM subject_grade_criteria WHERE subject_id = $1 LIMIT 1`,
    [sid],
  )
  const seed = legacy?.[0]
    ? [
        { name: 'Written Work', percentage: legacy[0].written_work_pct, color: legacy[0].written_work_color, maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
        { name: 'Performance Task', percentage: legacy[0].performance_task_pct, color: legacy[0].performance_task_color, maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
        { name: 'Quizzes', percentage: legacy[0].quizzes_pct, color: legacy[0].quizzes_color, maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
        { name: 'Activities', percentage: legacy[0].activities_pct, color: legacy[0].activities_color, maps_to_assignment: false, maps_to_activity: true, is_quiz: false },
      ]
    : DEFAULT_SEED.map((r) => ({ ...r }))

  for (let i = 0; i < seed.length; i++) {
    const r = seed[i]
    await pool.query(
      `
      INSERT INTO subject_grade_components (
        subject_id, name, percentage, color, component_order,
        maps_to_assignment, maps_to_activity, is_quiz
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [sid, r.name, Number(r.percentage), String(r.color), i, Boolean(r.maps_to_assignment), Boolean(r.maps_to_activity), Boolean(r.is_quiz)],
    )
  }
}

export function validateComponentsPayload(components) {
  if (!Array.isArray(components) || !components.length) {
    return { ok: false, message: 'At least one grading component is required.' }
  }
  const names = new Set()
  let total = 0
  for (const row of components) {
    const name = String(row?.name || '').trim()
    if (!name) return { ok: false, message: 'Each component needs a name.' }
    const key = name.toLowerCase()
    if (names.has(key)) return { ok: false, message: `Duplicate component name: ${name}` }
    names.add(key)
    const pct = Number(row.percentage ?? row.percent ?? 0)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, message: 'Each percentage must be between 0 and 100.' }
    }
    total += pct
    if (!row.maps_to_assignment && !row.maps_to_activity && !row.is_quiz) {
      return { ok: false, message: `${name} must map to Assignment, Activity, and/or Quiz.` }
    }
  }
  if (total !== 100) {
    return { ok: false, message: `Grade criteria must sum to 100% (currently ${total}%).` }
  }
  return { ok: true, components }
}

export function validateGradeCriteriaPercents(criteria) {
  const w = Number(criteria?.written_work_pct ?? 0)
  const p = Number(criteria?.performance_task_pct ?? 0)
  const q = Number(criteria?.quizzes_pct ?? 0)
  const a = Number(criteria?.activities_pct ?? 0)
  if (![w, p, q, a].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
    return { ok: false, message: 'Each percentage must be between 0 and 100.' }
  }
  const sum = w + p + q + a
  if (sum !== 100) {
    return { ok: false, message: `Grade criteria must sum to 100% (currently ${sum}%).` }
  }
  return { ok: true, written_work_pct: w, performance_task_pct: p, quizzes_pct: q, activities_pct: a }
}

export function criteriaToArray(criteria) {
  const c = criteria || {}
  return [
    { name: 'Written Work', percentage: Number(c.written_work_pct ?? 25), color: c.written_work_color || '#3B82F6', maps_to: ['Assignment'] },
    { name: 'Performance Task', percentage: Number(c.performance_task_pct ?? 45), color: c.performance_task_color || '#F59E0B', maps_to: ['Assignment', 'Activity'] },
    { name: 'Quizzes', percentage: Number(c.quizzes_pct ?? 15), color: c.quizzes_color || '#8B5CF6', maps_to: ['Quiz'] },
    { name: 'Activities', percentage: Number(c.activities_pct ?? 15), color: c.activities_color || '#10B981', maps_to: ['Activity'] },
  ]
}

export async function fetchSubjectGradeComponents(pool, subjectId) {
  await ensureSubjectGradeCriteriaSchema(pool)
  const sid = Number(subjectId)
  await migrateLegacyCriteriaRow(pool, sid)
  const { rows } = await pool.query(
    `SELECT * FROM subject_grade_components WHERE subject_id = $1 ORDER BY component_order ASC, id ASC`,
    [sid],
  )
  const components = (rows || []).map(mapComponentRow)
  const total_pct = components.reduce((s, r) => s + r.percentage, 0)
  return {
    subject_id: sid,
    configured: components.length > 0,
    components,
    criteria: components,
    total_pct,
  }
}

export async function fetchSubjectGradeCriteria(pool, subjectId) {
  return fetchSubjectGradeComponents(pool, subjectId)
}

export function mergeIncludedComponentForWorkType(filtered, includeComponentId, includedRow) {
  const list = Array.isArray(filtered) ? filtered : []
  const includeId = Number(includeComponentId)
  if (!Number.isFinite(includeId) || includeId <= 0) return list
  if (list.some((c) => Number(c.id) === includeId)) return list
  if (!includedRow) return list
  return [...list, mapComponentRow(includedRow)]
}

export async function fetchComponentsForWorkType(pool, subjectId, workType, { includeComponentId = null } = {}) {
  const data = await fetchSubjectGradeComponents(pool, subjectId)
  const wt = String(workType || '').toLowerCase()
  const filtered = data.components.filter((c) => {
    if (wt === 'assignment') return c.maps_to_assignment && !c.is_quiz
    if (wt === 'activity') return c.maps_to_activity && !c.is_quiz
    if (wt === 'quiz') return c.is_quiz
    return false
  })

  const includeId = Number(includeComponentId)
  if (!Number.isFinite(includeId) || includeId <= 0) return filtered

  const sid = Number(subjectId)
  if (filtered.some((c) => Number(c.id) === includeId)) return filtered

  const { rows } = await pool.query(
    `SELECT * FROM subject_grade_components WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [includeId, sid],
  )
  return mergeIncludedComponentForWorkType(filtered, includeId, rows?.[0] ?? null)
}

async function countComponentUsage(pool, componentId) {
  const cid = Number(componentId)
  const [a, b, c] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS cnt FROM assignments WHERE grade_component_id = $1`, [cid]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM activities WHERE grade_component_id = $1`, [cid]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM quizzes WHERE grade_component_id = $1`, [cid]),
  ])
  return Number(a.rows?.[0]?.cnt ?? 0) + Number(b.rows?.[0]?.cnt ?? 0) + Number(c.rows?.[0]?.cnt ?? 0)
}

export async function validateGradeComponentForWork(pool, subjectId, componentId, workType) {
  const sid = Number(subjectId)
  const cid = Number(componentId)
  if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(cid) || cid <= 0) {
    return { ok: false, message: 'Invalid grade component.' }
  }
  const { rows } = await pool.query(
    `SELECT * FROM subject_grade_components WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [cid, sid],
  )
  const row = rows?.[0]
  if (!row) return { ok: false, message: 'Grade component not found for this subject.' }
  const wt = String(workType || '').toLowerCase()
  if (wt === 'assignment' && (!row.maps_to_assignment || row.is_quiz)) {
    return { ok: false, message: 'This component cannot be used for assignments.' }
  }
  if (wt === 'activity' && (!row.maps_to_activity || row.is_quiz)) {
    return { ok: false, message: 'This component cannot be used for activities.' }
  }
  if (wt === 'quiz' && !row.is_quiz) {
    return { ok: false, message: 'This component cannot be used for quizzes.' }
  }
  return { ok: true, component: mapComponentRow(row) }
}

export async function replaceSubjectGradeComponents(pool, subjectId, payload) {
  await ensureSubjectGradeCriteriaSchema(pool)
  const sid = Number(subjectId)
  const incoming = Array.isArray(payload?.components) ? payload.components : Array.isArray(payload?.criteria) ? payload.criteria : null
  if (!incoming) {
    return { ok: false, message: 'components array is required.' }
  }
  const validated = validateComponentsPayload(incoming)
  if (!validated.ok) return validated

  const { rows: existing } = await pool.query(
    `SELECT id FROM subject_grade_components WHERE subject_id = $1`,
    [sid],
  )
  const existingIds = new Set((existing || []).map((r) => String(r.id)))
  const keptIds = new Set()

  for (let i = 0; i < incoming.length; i++) {
    const row = incoming[i]
    const id = row.id != null && String(row.id).trim() !== '' ? Number(row.id) : null
    const name = String(row.name || '').trim()
    const pct = Number(row.percentage ?? 0)
    const color = String(row.color || '#3B82F6').trim()
    const mapsA = Boolean(row.maps_to_assignment)
    const mapsAct = Boolean(row.maps_to_activity)
    const isQuiz = Boolean(row.is_quiz)

    if (id && existingIds.has(String(id))) {
      await pool.query(
        `
        UPDATE subject_grade_components SET
          name = $1, percentage = $2, color = $3, component_order = $4,
          maps_to_assignment = $5, maps_to_activity = $6, is_quiz = $7
        WHERE id = $8 AND subject_id = $9
        `,
        [name, pct, color, i, mapsA, mapsAct, isQuiz, id, sid],
      )
      keptIds.add(String(id))
    } else {
      const { rows: ins } = await pool.query(
        `
        INSERT INTO subject_grade_components (
          subject_id, name, percentage, color, component_order,
          maps_to_assignment, maps_to_activity, is_quiz
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        `,
        [sid, name, pct, color, i, mapsA, mapsAct, isQuiz],
      )
      keptIds.add(String(ins[0].id))
    }
  }

  for (const eid of existingIds) {
    if (keptIds.has(eid)) continue
    const usage = await countComponentUsage(pool, eid)
    if (usage > 0) {
      return { ok: false, message: `Component is used by ${usage} assignment(s)/activity(ies)/quiz(zes). Reassign them first.` }
    }
    await pool.query(`DELETE FROM subject_grade_components WHERE id = $1 AND subject_id = $2`, [Number(eid), sid])
  }

  const criteria = await fetchSubjectGradeComponents(pool, sid)
  return { ok: true, criteria }
}

export async function upsertSubjectGradeCriteria(pool, subjectId, payload) {
  if (Array.isArray(payload?.components) || Array.isArray(payload?.criteria)) {
    return replaceSubjectGradeComponents(pool, subjectId, payload)
  }
  const legacy = validateGradeCriteriaPercents(payload)
  if (!legacy.ok) return legacy
  const components = [
    { name: 'Written Work', percentage: legacy.written_work_pct, color: payload.written_work_color || '#3B82F6', maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
    { name: 'Performance Task', percentage: legacy.performance_task_pct, color: payload.performance_task_color || '#F59E0B', maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
    { name: 'Quizzes', percentage: legacy.quizzes_pct, color: payload.quizzes_color || '#8B5CF6', maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
    { name: 'Activities', percentage: legacy.activities_pct, color: payload.activities_color || '#10B981', maps_to_assignment: false, maps_to_activity: true, is_quiz: false },
  ]
  return replaceSubjectGradeComponents(pool, subjectId, { components })
}
