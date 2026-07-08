import { uploadsPathToApiUrl } from './fileUrls.js'

/** Student roster/profile photo — data URLs or stored upload paths. */
export function studentPhotoDisplaySrc(photoUrl) {
  const t = String(photoUrl || '').trim()
  if (!t) return ''
  if (t.startsWith('data:') || t.startsWith('blob:')) return t
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/uploads/') || t.startsWith('/api/files/')) {
    return uploadsPathToApiUrl(t)
  }
  return ''
}
