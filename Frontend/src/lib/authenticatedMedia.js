import { uploadsPathToApiUrl } from './fileUrls.js'

export function isDirectMediaUrl(url) {
  const t = String(url || '').trim()
  return (
    t.startsWith('data:') ||
    t.startsWith('blob:') ||
    t.startsWith('http://') ||
    t.startsWith('https://')
  )
}

export function resolveMediaFetchUrl(storedPathOrUrl) {
  const t = String(storedPathOrUrl || '').trim()
  if (!t) return ''
  if (isDirectMediaUrl(t)) return t
  return uploadsPathToApiUrl(t)
}

/**
 * Fetch protected uploads with session cookies; returns blob: URL or direct URL.
 */
export async function fetchAuthenticatedMediaUrl(storedPathOrUrl) {
  const raw = String(storedPathOrUrl || '').trim()
  if (!raw) return ''
  if (isDirectMediaUrl(raw)) return raw

  const fetchUrl = resolveMediaFetchUrl(raw)
  if (!fetchUrl) return ''

  const res = await fetch(fetchUrl, { credentials: 'include' })
  const contentType = String(res.headers.get('content-type') || '').toLowerCase()
  if (!res.ok || contentType.includes('application/json')) {
    throw new Error('Media unavailable')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
