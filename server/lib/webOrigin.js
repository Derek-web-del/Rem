/**
 * Normalize env URL strings (scheme optional) to a browser Origin.
 */
export function toWebOrigin(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null

  const candidates = [s]
  if (!/^https?:\/\//i.test(s)) {
    const isLocal =
      /^localhost(:\d+)?$/i.test(s) ||
      /^127\.0\.0\.1(:\d+)?$/i.test(s)
    candidates.push(`${isLocal ? 'http' : 'https'}://${s}`)
  }

  for (const candidate of candidates) {
    try {
      const u = new URL(candidate)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      return u.origin
    } catch {
      // try next candidate
    }
  }
  return null
}
