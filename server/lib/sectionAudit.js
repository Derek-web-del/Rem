function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal) {
  changedFields[label] = { old: oldVal ?? null, new: newVal ?? null }
}

/**
 * @param {Record<string, unknown> | null | undefined} item
 */
export function sectionAuditSnapshot(item) {
  if (!item || typeof item !== 'object') return null
  const id = normStr(item.id)
  const pgId = item.postgresSectionId ?? item.postgres_section_id
  const postgresSectionId =
    pgId != null && Number.isFinite(Number(pgId)) && Number(pgId) > 0 ? Number(pgId) : null
  const grade = normStr(item.grade ?? item.grade_level ?? item.gradeLevel)
  const name = normStr(item.name ?? item.section_name ?? item.sectionName)
  if (!id && !postgresSectionId && !name) return null
  return {
    id: id || (postgresSectionId != null ? String(postgresSectionId) : ''),
    postgresSectionId,
    grade,
    gradeLevel: grade,
    name,
    sectionName: name,
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} oldItem
 * @param {Record<string, unknown> | null | undefined} newItem
 * @returns {Record<string, { old: unknown, new: unknown }>}
 */
export function computeSectionDetailedDiffs(oldItem, newItem) {
  const oldSnap = sectionAuditSnapshot(oldItem)
  const newSnap = sectionAuditSnapshot(newItem)
  if (!oldSnap || !newSnap) return {}

  /** @type {Record<string, { old: unknown, new: unknown }>} */
  const changedFields = {}

  if (valuesDiffer(oldSnap.name, newSnap.name)) {
    pushDiff(changedFields, 'Section name', oldSnap.name, newSnap.name)
  }
  if (valuesDiffer(oldSnap.grade, newSnap.grade)) {
    pushDiff(changedFields, 'Grade level', oldSnap.grade, newSnap.grade)
  }

  return changedFields
}

function indexSectionList(list) {
  const rawList = Array.isArray(list) ? list : []
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map()
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue
    const id = normStr(raw.id)
    if (!id) continue
    map.set(id, raw)
  }
  return map
}

/**
 * @param {unknown[]} oldList
 * @param {unknown[]} newList
 * @param {{ includeDeleted?: boolean }} [opts]
 */
export function diffSectionLists(oldList, newList, { includeDeleted = false } = {}) {
  const oldMap = indexSectionList(oldList)
  const newMap = indexSectionList(newList)

  /** @type {ReturnType<typeof sectionAuditSnapshot>[]} */
  const created = []
  /** @type {{ old: ReturnType<typeof sectionAuditSnapshot>, new: ReturnType<typeof sectionAuditSnapshot>, detailedDiffs: Record<string, { old: unknown, new: unknown }> }[]} */
  const updated = []
  /** @type {ReturnType<typeof sectionAuditSnapshot>[]} */
  const deleted = []

  for (const [id, newItem] of newMap) {
    const oldItem = oldMap.get(id)
    if (!oldItem) {
      const snap = sectionAuditSnapshot(newItem)
      if (snap) created.push(snap)
      continue
    }
    const detailedDiffs = computeSectionDetailedDiffs(oldItem, newItem)
    const updatedFields = Object.keys(detailedDiffs)
    if (updatedFields.length) {
      const oldSnap = sectionAuditSnapshot(oldItem)
      const newSnap = sectionAuditSnapshot(newItem)
      if (oldSnap && newSnap) {
        updated.push({ old: oldSnap, new: newSnap, detailedDiffs })
      }
    }
  }

  if (includeDeleted) {
    for (const [id, oldItem] of oldMap) {
      if (!newMap.has(id)) {
        const snap = sectionAuditSnapshot(oldItem)
        if (snap) deleted.push(snap)
      }
    }
  }

  return { created, updated, deleted }
}

export function sectionAuditDescription(action, snapshot) {
  const name = normStr(snapshot?.name || snapshot?.sectionName) || 'Untitled'
  const grade = normStr(snapshot?.grade || snapshot?.gradeLevel)
  const gradePart = grade ? ` (${grade})` : ''
  if (action === 'created') return `Section created: ${name}${gradePart}`
  if (action === 'updated') return `Section updated: ${name}${gradePart}`
  if (action === 'deleted') return `Section deleted: ${name}${gradePart}`
  return `Section ${action}: ${name}${gradePart}`
}

export function sectionAuditDetails(snapshot, extra = {}) {
  return {
    sectionName: normStr(snapshot?.name || snapshot?.sectionName),
    gradeLevel: normStr(snapshot?.grade || snapshot?.gradeLevel),
    recordId: normStr(snapshot?.id),
    postgresSectionId: snapshot?.postgresSectionId ?? null,
    ...extra,
  }
}

/** Map a `public.sections` DB row into an audit snapshot. */
export function sectionPgRowSnapshot(row) {
  if (!row || typeof row !== 'object') return null
  return sectionAuditSnapshot({
    id: row.id != null ? String(row.id) : '',
    postgresSectionId: row.id,
    grade: row.grade_level ?? row.grade,
    name: row.section_name ?? row.name,
  })
}
