import { apiUrl } from './lmsStateStorage.js'

/**
 * Map stored `/uploads/...` paths to display URLs.
 * Subject logos use public `/subject-logos/`; other uploads use authenticated `/api/files/`.
 */
export function uploadsPathToApiUrl(filePath) {
  const t = String(filePath ?? '').trim()
  if (!t) return ''
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t

  if (t.startsWith('/subject-logos/')) {
    return apiUrl(t)
  }

  if (t.startsWith('/uploads/')) {
    let rest = t.slice('/uploads/'.length)
    if (rest.startsWith('faculties/')) rest = `photos/${rest.slice('faculties/'.length)}`
    else if (rest.startsWith('Subjects_images/')) {
      const file = rest.slice('Subjects_images/'.length)
      return apiUrl(`/subject-logos/${file}`)
    }
    return apiUrl(`/api/files/${rest}`)
  }

  if (t.startsWith('/api/files/')) return apiUrl(t)
  return apiUrl(t.startsWith('/') ? t : `/${t}`)
}
