/**
 * Remove duplicate list entries by id (last occurrence wins).
 * @template T
 * @param {T[]} list
 * @param {string} [idKey]
 * @returns {T[]}
 */
export function dedupeById(list, idKey = 'id') {
  if (!Array.isArray(list)) return []
  const withId = new Map()
  const withoutId = []
  for (const item of list) {
    const id = String(item?.[idKey] ?? '').trim()
    if (!id) {
      withoutId.push(item)
      continue
    }
    withId.set(id, item)
  }
  return [...withId.values(), ...withoutId]
}

/**
 * Stable React key for audit log rows (avoids collisions when Infra reuses userId as event id).
 * @param {Record<string, unknown>} e
 * @param {number} index
 */
export function auditEventReactKey(e, index) {
  const source = String(e?.source ?? 'unknown')
  const id = String(e?.id ?? '').trim() || 'no-id'
  const kind = String(e?.eventType ?? e?.activityType ?? '')
  const at =
    e?.time ??
    e?.timestamp ??
    e?.createdAt ??
    e?.created_at ??
    ''
  return `${source}:${id}:${String(at)}:${kind}:${index}`
}

/**
 * Dedupe audit events before render (same id from different sources/times kept if distinct).
 * @param {Record<string, unknown>[]} events
 */
export function dedupeAuditEvents(events) {
  if (!Array.isArray(events)) return []
  const seen = new Set()
  const out = []
  for (const e of events) {
    const key = [
      String(e?.source ?? ''),
      String(e?.id ?? ''),
      String(e?.time ?? e?.timestamp ?? ''),
      String(e?.eventType ?? e?.activityType ?? ''),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}
