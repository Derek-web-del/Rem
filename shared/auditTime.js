/**
 * Normalize audit timestamps (Firestore Timestamp, Date, ISO, epoch, {_seconds}, etc.).
 */

const TIME_FIELD_KEYS = [
  'createdAt',
  'created_at',
  'timestamp',
  'time',
  'occurredAt',
  'occurred_at',
  'updatedAt',
  'updated_at',
]

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
export function coerceAuditTimestamp(value) {
  if (value == null || value === '') return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value)

    if (typeof obj.toDate === 'function') {
      try {
        const d = obj.toDate()
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d
      } catch {
        /* ignore */
      }
    }

    const sec =
      obj.seconds ??
      obj._seconds ??
      (typeof obj._seconds === 'number' ? obj._seconds : undefined)
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      const ns = Number(obj.nanoseconds ?? obj._nanoseconds ?? 0)
      return new Date(sec * 1000 + Math.floor(ns / 1e6))
    }

    if (typeof obj.toMillis === 'function') {
      try {
        const ms = Number(obj.toMillis())
        if (Number.isFinite(ms)) return new Date(ms)
      } catch {
        /* ignore */
      }
    }

    if (typeof obj.value === 'string' || typeof obj.value === 'number') {
      return coerceAuditTimestamp(obj.value)
    }

    for (const key of TIME_FIELD_KEYS) {
      if (key in obj) {
        const nested = coerceAuditTimestamp(obj[key])
        if (nested) return nested
      }
    }

    return null
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

/**
 * @param {unknown} value
 * @returns {number | null} epoch ms
 */
export function coerceAuditTimestampMs(value) {
  const d = coerceAuditTimestamp(value)
  return d ? d.getTime() : null
}

/**
 * Pick the first parseable timestamp from an audit event row.
 * @param {Record<string, unknown> | null | undefined} e
 * @returns {Date | null}
 */
export function pickAuditEventDate(e) {
  if (!e || typeof e !== 'object') return null
  for (const key of TIME_FIELD_KEYS) {
    if (e[key] != null && e[key] !== '') {
      const d = coerceAuditTimestamp(e[key])
      if (d) return d
    }
  }
  return null
}

/**
 * @param {unknown} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatAuditTime(value, options) {
  const d = coerceAuditTimestamp(value)
  if (!d) {
    if (value == null || value === '') return '—'
    if (typeof value === 'string' || typeof value === 'number') return 'Invalid date'
    return 'Invalid date'
  }
  return d.toLocaleString(undefined, options)
}
