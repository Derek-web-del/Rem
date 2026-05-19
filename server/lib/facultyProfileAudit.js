function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal, { redact = false } = {}) {
  if (redact) {
    changedFields[label] = { old: '[redacted]', new: '[changed]' }
    return
  }
  const o = typeof oldVal === 'string' && oldVal.length > 120 ? `${oldVal.slice(0, 80)}…` : oldVal
  const n = typeof newVal === 'string' && newVal.length > 120 ? `${newVal.slice(0, 80)}…` : newVal
  changedFields[label] = { old: o ?? null, new: n ?? null }
}

function parseAdvisorySectionsFromRow(row) {
  if (Array.isArray(row?.sections)) return row.sections
  const raw = row?.advisory_sections_json
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Normalize to sorted unique Postgres section ids (ints). */
export function normalizeSectionIds(ids) {
  const list = Array.isArray(ids) ? ids : []
  const out = []
  for (const item of list) {
    if (item == null) continue
    if (typeof item === 'object') {
      const pg = Number(item.postgresSectionId ?? item.section_id ?? item.id)
      if (Number.isFinite(pg) && pg > 0) out.push(pg)
      continue
    }
    const n = Number(item)
    if (Number.isFinite(n) && n > 0) out.push(n)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Section ids stored on a faculty row (junction table and/or advisory_sections_json). */
export function extractFacultySectionIdsFromRow(row, junctionSectionIds = []) {
  const fromJunction = normalizeSectionIds(junctionSectionIds)
  if (fromJunction.length) return fromJunction
  const sections = parseAdvisorySectionsFromRow(row)
  return normalizeSectionIds(
    sections.map((s) => s?.postgresSectionId ?? s?.section_id ?? s?.id),
  )
}

export function sectionIdSetsEqual(a, b) {
  const left = normalizeSectionIds(a)
  const right = normalizeSectionIds(b)
  if (left.length !== right.length) return false
  return left.every((id, i) => id === right[i])
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} facultyId
 */
export async function fetchFacultyPriorState(pool, facultyId) {
  const id = String(facultyId || '').trim()
  if (!pool || !id) return null

  const { rows } = await pool.query(
    `SELECT * FROM public.faculties WHERE id = $1 AND archived_at IS NULL`,
    [id],
  )
  if (!rows?.[0]) return null

  const row = rows[0]
  let junctionSectionIds = []
  const fid = String(id).trim()
  if (fid) {
    try {
      const { rows: secRows } = await pool.query(
        `SELECT section_id FROM public.faculty_sections WHERE faculty_id::text = $1 ORDER BY section_id`,
        [fid],
      )
      junctionSectionIds = (secRows || []).map((r) => r.section_id)
    } catch {
      /* junction table may be absent */
    }
  }

  const sectionIds = extractFacultySectionIdsFromRow(row, junctionSectionIds)
  return { row, sectionIds }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number[]} sectionIds
 */
async function formatSectionLabels(pool, sectionIds) {
  const ids = normalizeSectionIds(sectionIds)
  if (!ids.length) return ''
  const { rows } = await pool.query(
    `SELECT id, section_name, grade_level FROM sections WHERE id = ANY($1::int[]) ORDER BY section_name`,
    [ids],
  )
  return (rows || [])
    .map((r) => {
      const g = normStr(r.grade_level)
      const n = normStr(r.section_name)
      return g && n ? `${g} — ${n}` : n || String(r.id)
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * Normalized compare payload from PUT body.
 * @param {Record<string, unknown>} b
 * @param {number[]} sectionIds
 */
export function buildFacultyComparePayload(b, sectionIds = []) {
  const facultyCode =
    normStr(b?.facultyCodeId) ||
    normStr(b?.facultyUsername) ||
    normStr(b?.facultyCode) ||
    normStr(b?.faculty_code_id)
  return {
    firstName: normStr(b?.firstName ?? b?.first_name),
    middleName: normStr(b?.middleName ?? b?.middle_name),
    lastName: normStr(b?.lastName ?? b?.last_name),
    email: normStr(b?.email).toLowerCase(),
    contactNumber:
      normStr(b?.contactNumber) || normStr(b?.contact_number) || normStr(b?.contact_no),
    qualification: normStr(b?.qualification),
    facultyCode,
    gradeLevel:
      normStr(b?.gradeLevel) || normStr(b?.grade_level) || normStr(b?.grade),
    photoUrl: normStr(b?.photo_url ?? b?.photoDataUrl ?? b?.photo_data_url),
    sectionIds: normalizeSectionIds(sectionIds),
  }
}

/**
 * @param {Record<string, unknown>} oldRow
 * @param {ReturnType<typeof buildFacultyComparePayload>} newData
 * @param {{
 *   pool: import('pg').Pool,
 *   oldSectionIds?: number[],
 *   newSectionIds?: number[],
 *   passwordChanged?: boolean,
 *   appPasswordInBody?: boolean,
 *   photoChanged?: boolean,
 * }} ctx
 */
export async function computeFacultyProfileDetailedDiffs(oldRow, newData, ctx) {
  if (!oldRow || !newData) return {}
  const { pool, oldSectionIds = [], newSectionIds = [] } = ctx
  /** @type {Record<string, { old: unknown, new: unknown }>} */
  const changedFields = {}

  if (valuesDiffer(newData.firstName, oldRow.first_name)) {
    pushDiff(changedFields, 'First name', oldRow.first_name, newData.firstName)
  }
  if (valuesDiffer(newData.middleName, oldRow.middle_name)) {
    pushDiff(changedFields, 'Middle name', oldRow.middle_name, newData.middleName)
  }
  if (valuesDiffer(newData.lastName, oldRow.last_name)) {
    pushDiff(changedFields, 'Last name', oldRow.last_name, newData.lastName)
  }
  if (valuesDiffer(newData.email, oldRow.email)) {
    pushDiff(changedFields, 'Email address', oldRow.email, newData.email)
  }

  const oldContact = normStr(oldRow.contact_number ?? oldRow.contact_no)
  if (valuesDiffer(newData.contactNumber, oldContact)) {
    pushDiff(changedFields, 'Contact number', oldContact, newData.contactNumber)
  }
  if (valuesDiffer(newData.qualification, oldRow.qualification)) {
    pushDiff(changedFields, 'Qualification', oldRow.qualification, newData.qualification)
  }

  const oldCode = normStr(oldRow.faculty_code_id ?? oldRow.faculty_code ?? oldRow.faculty_username)
  if (valuesDiffer(newData.facultyCode, oldCode)) {
    pushDiff(changedFields, 'Faculty code', oldCode, newData.facultyCode)
  }

  const oldGrade = normStr(oldRow.grade_level ?? oldRow.grade)
  if (valuesDiffer(newData.gradeLevel, oldGrade)) {
    pushDiff(changedFields, 'Grade level', oldGrade, newData.gradeLevel)
  }

  if (ctx.photoChanged) {
    const oldPhoto = normStr(oldRow.photo_url ?? oldRow.photo_data_url)
    const labelPhoto = (v) => {
      const t = normStr(v)
      if (!t) return null
      if (t.startsWith('/uploads/faculties/')) return t
      if (t.startsWith('data:')) return '[photo]'
      return t.length > 80 ? `${t.slice(0, 80)}…` : t
    }
    pushDiff(
      changedFields,
      'Student/Faculty Photo',
      labelPhoto(oldPhoto),
      labelPhoto(newData.photoUrl) || '[updated]',
    )
  }

  const oldIds = normalizeSectionIds(oldSectionIds)
  const newIds = normalizeSectionIds(newSectionIds.length ? newSectionIds : newData.sectionIds)
  if (!sectionIdSetsEqual(oldIds, newIds)) {
    const oldKey = oldIds.join(',') || '(none)'
    const newKey = newIds.join(',') || '(none)'
    let oldLabel = oldKey
    let newLabel = newKey
    if (pool) {
      oldLabel = (await formatSectionLabels(pool, oldIds)) || oldKey
      newLabel = (await formatSectionLabels(pool, newIds)) || newKey
    }
    pushDiff(changedFields, 'Advisory sections', oldLabel, newLabel)
  }

  if (ctx.passwordChanged) {
    pushDiff(changedFields, 'Password', null, null, { redact: true })
  }
  if (ctx.appPasswordInBody) {
    pushDiff(changedFields, 'App password', null, null, { redact: true })
  }

  return changedFields
}

export function buildFacultyAuditTargetName(row) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name].map((p) => normStr(p)).filter(Boolean)
  return parts.join(' ') || normStr(row?.name) || normStr(row?.email) || `Faculty #${row?.id ?? ''}`
}
