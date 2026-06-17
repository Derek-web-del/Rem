function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
}

function formatPct(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n}%` : '—'
}

function formatMapsTo(comp) {
  if (!comp || typeof comp !== 'object') return '—'
  if (Array.isArray(comp.maps_to) && comp.maps_to.length) {
    return comp.maps_to.join(', ')
  }
  const out = []
  if (comp.maps_to_assignment) out.push('Assignment')
  if (comp.maps_to_activity) out.push('Activity')
  if (comp.is_quiz) out.push('Quiz')
  return out.length ? out.join(', ') : '—'
}

function componentKey(comp) {
  if (comp?.id != null && String(comp.id).trim()) return `id:${comp.id}`
  const name = normalizeName(comp?.name)
  return name ? `name:${name}` : ''
}

function indexComponents(components) {
  const map = new Map()
  for (const comp of components || []) {
    const key = componentKey(comp)
    if (key) map.set(key, comp)
  }
  return map
}

function valuesEqual(a, b) {
  return String(a ?? '') === String(b ?? '')
}

function isScalarDiffValue(value) {
  return value == null || typeof value !== 'object'
}

function isFlatComponentSummary(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false
  return Object.keys(values).some((key) => key.endsWith(' %') || key.endsWith(' maps to'))
}

/**
 * @param {Record<string, unknown>} meta
 * @returns {boolean}
 */
export function isGradeCriteriaAuditEvent(meta = {}) {
  const tokens = [
    meta.event_type,
    meta.eventType,
    meta.type,
    meta.activityType,
  ]
    .map((token) => String(token || '').trim().toLowerCase())
    .filter(Boolean)
  return tokens.some((token) => token === 'grade_criteria_saved')
}

/**
 * Pull component arrays from legacy or current audit value shapes.
 * @param {Record<string, unknown>|null|undefined} values
 * @returns {Array<Record<string, unknown>>}
 */
export function extractComponentsFromAuditValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return []
  if (isFlatComponentSummary(values)) return []

  if (Array.isArray(values.components)) return values.components

  const criteria = values.criteria
  if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
    if (Array.isArray(criteria.components)) return criteria.components
    if (Array.isArray(criteria.criteria)) return criteria.criteria
  }

  if (Array.isArray(criteria)) return criteria
  return []
}

/**
 * Collapse duplicate rows by logical component (name + order).
 * @param {Array<Record<string, unknown>>} components
 * @returns {Array<Record<string, unknown>>}
 */
export function dedupeComponentsForAudit(components) {
  const list = Array.isArray(components) ? components : []
  const seen = new Map()

  for (const comp of list) {
    const key = `${normalizeName(comp?.name)}:${Number(comp?.component_order ?? 0)}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, comp)
      continue
    }
    const existingId = Number(existing?.id)
    const nextId = Number(comp?.id)
    if (Number.isFinite(nextId) && (!Number.isFinite(existingId) || nextId < existingId)) {
      seen.set(key, comp)
    }
  }

  return [...seen.values()].sort(
    (a, b) => Number(a?.component_order ?? 0) - Number(b?.component_order ?? 0),
  )
}

/**
 * @param {Record<string, unknown>|null|undefined} values
 * @param {Array<Record<string, unknown>>} [components]
 * @returns {number|null}
 */
export function extractTotalPctFromAuditValues(values, components = []) {
  const criteria = values?.criteria
  if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
    const total = Number(criteria.total_pct)
    if (Number.isFinite(total)) return total
  }

  const total = Number(values?.total_pct)
  if (Number.isFinite(total)) return total

  const list = Array.isArray(components) ? components : []
  if (!list.length) return null
  const sum = list.reduce((acc, comp) => acc + Number(comp?.percentage ?? 0), 0)
  return Number.isFinite(sum) ? sum : null
}

/**
 * @param {Record<string, unknown>|null|undefined} diffs
 * @returns {boolean}
 */
export function hasScalarDetailedDiffs(diffs) {
  if (!diffs || typeof diffs !== 'object' || Array.isArray(diffs)) return false
  const entries = Object.entries(diffs)
  if (!entries.length) return false

  for (const [field, diff] of entries) {
    if (field === 'criteria' || field === 'components') return false
    if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return false
    const oldVal = diff.old ?? diff.before
    const newVal = diff.new ?? diff.after
    if (!isScalarDiffValue(oldVal) || !isScalarDiffValue(newVal)) return false
  }

  return true
}

/**
 * Flatten grade component arrays into human-readable audit diffs.
 * @returns {Record<string, { old: string, new: string }>}
 */
export function computeGradeCriteriaDetailedDiffs(oldComponents, newComponents) {
  const oldList = Array.isArray(oldComponents) ? oldComponents : []
  const newList = Array.isArray(newComponents) ? newComponents : []
  const oldMap = indexComponents(oldList)
  const newMap = indexComponents(newList)
  const keys = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs = {}

  for (const key of keys) {
    const oldComp = oldMap.get(key)
    const newComp = newMap.get(key)
    const label = String(newComp?.name || oldComp?.name || 'Component').trim() || 'Component'

    if (!oldComp && newComp) {
      diffs[`${label} (added)`] = {
        old: '—',
        new: `${formatPct(newComp.percentage)} · ${formatMapsTo(newComp)}`,
      }
      continue
    }
    if (oldComp && !newComp) {
      diffs[`${label} (removed)`] = {
        old: `${formatPct(oldComp.percentage)} · ${formatMapsTo(oldComp)}`,
        new: '—',
      }
      continue
    }
    if (!valuesEqual(oldComp?.percentage, newComp?.percentage)) {
      diffs[`${label} %`] = {
        old: formatPct(oldComp?.percentage),
        new: formatPct(newComp?.percentage),
      }
    }
    const oldMaps = formatMapsTo(oldComp)
    const newMaps = formatMapsTo(newComp)
    if (!valuesEqual(oldMaps, newMaps)) {
      diffs[`${label} maps to`] = { old: oldMaps, new: newMaps }
    }
  }

  return diffs
}

/** Compact summary map for optional old_values/new_values columns. */
export function summarizeGradeCriteriaComponents(components) {
  const list = Array.isArray(components) ? components : []
  const out = {}
  for (const comp of list) {
    const name = String(comp?.name || 'Component').trim() || 'Component'
    out[`${name} %`] = formatPct(comp?.percentage)
    out[`${name} maps to`] = formatMapsTo(comp)
  }
  return out
}

function stripBlobKeys(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return values
  const out = { ...values }
  delete out.criteria
  delete out.components
  return out
}

/**
 * Normalize grade-criteria audit payloads for display (legacy + current rows).
 * @param {{
 *   event_type?: string,
 *   eventType?: string,
 *   type?: string,
 *   activityType?: string,
 *   old_values?: Record<string, unknown>|null,
 *   new_values?: Record<string, unknown>|null,
 *   detailedDiffs?: Record<string, unknown>|null,
 *   changed_fields?: string[],
 * }} input
 * @returns {{
 *   detailedDiffs: Record<string, { old: string, new: string }>,
 *   old_values: Record<string, unknown>|null,
 *   new_values: Record<string, unknown>|null,
 *   changed_fields: string[],
 * }|null}
 */
export function resolveGradeCriteriaAuditDisplay(input = {}) {
  if (!isGradeCriteriaAuditEvent(input)) return null

  const oldValues = input.old_values && typeof input.old_values === 'object' ? input.old_values : null
  const newValues = input.new_values && typeof input.new_values === 'object' ? input.new_values : null
  const storedDiffs =
    input.detailedDiffs && typeof input.detailedDiffs === 'object' && !Array.isArray(input.detailedDiffs)
      ? input.detailedDiffs
      : null

  const oldComps = dedupeComponentsForAudit(extractComponentsFromAuditValues(oldValues))
  const newComps = dedupeComponentsForAudit(extractComponentsFromAuditValues(newValues))
  const canExtractComponents = oldComps.length > 0 || newComps.length > 0

  let detailedDiffs = hasScalarDetailedDiffs(storedDiffs) ? { ...storedDiffs } : computeGradeCriteriaDetailedDiffs(oldComps, newComps)

  delete detailedDiffs.criteria
  delete detailedDiffs.components

  const oldTotal = extractTotalPctFromAuditValues(oldValues, oldComps)
  const newTotal = extractTotalPctFromAuditValues(newValues, newComps)
  if (oldTotal != null && newTotal != null && oldTotal !== newTotal) {
    detailedDiffs['Total weight %'] = {
      old: formatPct(oldTotal),
      new: formatPct(newTotal),
    }
  }

  const resolvedOldValues = canExtractComponents
    ? summarizeGradeCriteriaComponents(oldComps)
    : stripBlobKeys(oldValues)
  const resolvedNewValues = canExtractComponents
    ? summarizeGradeCriteriaComponents(newComps)
    : stripBlobKeys(newValues)

  return {
    detailedDiffs,
    old_values: resolvedOldValues,
    new_values: resolvedNewValues,
    changed_fields: Object.keys(detailedDiffs),
  }
}
