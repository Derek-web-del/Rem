import { apiUrl } from './lmsStateStorage.js'

/**
 * Map stored `/uploads/...` paths to authenticated `/api/files/...` URLs.
 */
export function uploadsPathToApiUrl(filePath) {
  const t = String(filePath ?? '').trim()
  if (!t) return ''
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t

  if (t.startsWith('/uploads/')) {
    let rest = t.slice('/uploads/'.length)
    if (rest.startsWith('faculties/')) rest = `photos/${rest.slice('faculties/'.length)}`
    else if (rest.startsWith('Subjects_images/')) rest = `subjects/${rest.slice('Subjects_images/'.length)}`
    return apiUrl(`/api/files/${rest}`)
  }

  if (t.startsWith('/api/files/')) return apiUrl(t)
  return apiUrl(t.startsWith('/') ? t : `/${t}`)
}
