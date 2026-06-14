import { normalizeCurriculumFromState, curriculumFileDisplayName } from '../api/state/shared.js'

function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal) {
  const o = typeof oldVal === 'string' && oldVal.length > 120 ? `${oldVal.slice(0, 80)}…` : oldVal
  const n = typeof newVal === 'string' && newVal.length > 120 ? `${newVal.slice(0, 80)}…` : newVal
  changedFields[label] = { old: o ?? null, new: n ?? null }
}

/**
 * Normalize a curriculum item from app_state or DB row for audit comparison.
 * @param {Record<string, unknown> | null | undefined} raw
 * @param {number} [index]
 */
export function normalizeCurriculumAuditItem(raw, index = 0) {
  return normalizeCurriculumFromState(raw, index)
}

/**
 * Lightweight snapshot for audit logs (excludes fileDataUrl).
 * @param {Record<string, unknown> | null | undefined} item
 */
export function curriculumAuditSnapshot(item) {
  const c = normalizeCurriculumAuditItem(item, 0)
  if (!c) return null
  return {
    id: c.id,
    grade: c.grade,
    gradeLevel: c.grade,
    subject: c.subject,
    description: c.description,
    fileName: curriculumFileDisplayName(c) || c.fileName || '',
    fileType: c.fileType || '',
    uploadedAt: c.uploadedAt || '',
    uploadedBy: c.uploadedBy || '',
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} oldItem
 * @param {Record<string, unknown> | null | undefined} newItem
 * @returns {Record<string, { old: unknown, new: unknown }>}
 */
export function computeCurriculumDetailedDiffs(oldItem, newItem) {
  const oldSnap = curriculumAuditSnapshot(oldItem)
  const newSnap = curriculumAuditSnapshot(newItem)
  if (!oldSnap || !newSnap) return {}

  /** @type {Record<string, { old: unknown, new: unknown }>} */
  const changedFields = {}

  if (valuesDiffer(oldSnap.subject, newSnap.subject)) {
    pushDiff(changedFields, 'Subject', oldSnap.subject, newSnap.subject)
  }
  if (valuesDiffer(oldSnap.grade, newSnap.grade)) {
    pushDiff(changedFields, 'Grade level', oldSnap.grade, newSnap.grade)
  }
  if (valuesDiffer(oldSnap.description, newSnap.description)) {
    pushDiff(changedFields, 'Description', oldSnap.description, newSnap.description)
  }
  if (valuesDiffer(oldSnap.fileName, newSnap.fileName)) {
    pushDiff(changedFields, 'File name', oldSnap.fileName, newSnap.fileName)
  }

  const oldUrl = normStr(oldItem?.fileDataUrl ?? oldItem?.file_data_url)
  const newUrl = normStr(newItem?.fileDataUrl ?? newItem?.file_data_url)
  if (oldUrl !== newUrl && (oldUrl || newUrl) && !changedFields['File name']) {
    pushDiff(
      changedFields,
      'Curriculum file',
      oldSnap.fileName || '(previous file)',
      newSnap.fileName || '(replaced file)',
    )
  }

  return changedFields
}

function indexCurriculumList(list) {
  const rawList = Array.isArray(list) ? list : []
  /** @type {Map<string, ReturnType<typeof normalizeCurriculumAuditItem>>} */
  const map = new Map()
  rawList.forEach((raw, i) => {
    const item = normalizeCurriculumAuditItem(raw, i)
    if (!item?.id) return
    map.set(String(item.id), item)
  })
  return map
}

/**
 * Diff two curriculum arrays by id.
 * @param {unknown[]} oldList
 * @param {unknown[]} newList
 * @param {{ includeDeleted?: boolean }} [opts]
 */
export function diffCurriculumLists(oldList, newList, { includeDeleted = false } = {}) {
  const oldMap = indexCurriculumList(oldList)
  const newMap = indexCurriculumList(newList)

  /** @type {ReturnType<typeof curriculumAuditSnapshot>[]} */
  const created = []
  /** @type {{ old: ReturnType<typeof curriculumAuditSnapshot>, new: ReturnType<typeof curriculumAuditSnapshot>, detailedDiffs: Record<string, { old: unknown, new: unknown }> }[]} */
  const updated = []
  /** @type {ReturnType<typeof curriculumAuditSnapshot>[]} */
  const deleted = []

  for (const [id, newItem] of newMap) {
    const oldItem = oldMap.get(id)
    if (!oldItem) {
      const snap = curriculumAuditSnapshot(newItem)
      if (snap) created.push(snap)
      continue
    }
    const detailedDiffs = computeCurriculumDetailedDiffs(oldItem, newItem)
    const updatedFields = Object.keys(detailedDiffs)
    if (updatedFields.length) {
      const oldSnap = curriculumAuditSnapshot(oldItem)
      const newSnap = curriculumAuditSnapshot(newItem)
      if (oldSnap && newSnap) {
        updated.push({ old: oldSnap, new: newSnap, detailedDiffs })
      }
    }
  }

  if (includeDeleted) {
    for (const [id, oldItem] of oldMap) {
      if (!newMap.has(id)) {
        const snap = curriculumAuditSnapshot(oldItem)
        if (snap) deleted.push(snap)
      }
    }
  }

  return { created, updated, deleted }
}

export function curriculumAuditDescription(action, snapshot) {
  const subject = normStr(snapshot?.subject) || 'Untitled'
  const grade = normStr(snapshot?.grade || snapshot?.gradeLevel)
  const gradePart = grade ? ` (${grade})` : ''
  if (action === 'created') return `Curriculum guide uploaded: ${subject}${gradePart}`
  if (action === 'updated') return `Curriculum guide updated: ${subject}${gradePart}`
  if (action === 'deleted') return `Curriculum guide deleted: ${subject}${gradePart}`
  return `Curriculum guide ${action}: ${subject}${gradePart}`
}

export function curriculumAuditDetails(snapshot, extra = {}) {
  return {
    gradeLevel: normStr(snapshot?.grade || snapshot?.gradeLevel),
    subject: normStr(snapshot?.subject),
    fileName: normStr(snapshot?.fileName),
    recordId: normStr(snapshot?.id),
    ...extra,
  }
}

/** Map a `curriculum_guides` or `curriculum` DB row into an audit snapshot. */
export function curriculumGuideRowSnapshot(row) {
  if (!row || typeof row !== 'object') return null
  return curriculumAuditSnapshot({
    id: row.id ?? row.source_id,
    grade: row.grade_level ?? row.grade,
    subject: row.subject ?? row.title,
    description: row.description,
    fileName: row.file_name,
    fileType: row.file_type,
  })
}
