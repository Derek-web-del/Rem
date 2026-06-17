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
