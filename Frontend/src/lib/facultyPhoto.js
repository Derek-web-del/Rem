export const FACULTY_PHOTO_MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

/** Client-side validation before upload (PNG/JPG, max 2MB). */
export function validateFacultyPhotoFile(file) {
  if (!file) return ''
  const mime = String(file.type || '').toLowerCase()
  if (!ALLOWED_TYPES.has(mime)) return 'Only PNG or JPG images are allowed.'
  if (file.size > FACULTY_PHOTO_MAX_BYTES) return 'Photo must be less than 2MB.'
  return ''
}

/** Display URL for stored paths, data URLs, or empty. */
export function facultyPhotoDisplaySrc(photoUrl, { apiUrlFn } = {}) {
  const t = String(photoUrl || '').trim()
  if (!t) return ''
  if (t.startsWith('data:')) return t
  if (t.startsWith('/uploads/')) {
    const resolve = typeof apiUrlFn === 'function' ? apiUrlFn : (p) => p
    return resolve(t)
  }
  return t
}

/** Absolute URL for Better Auth profile `image` field. */
export function facultyPhotoAuthImageUrl(photoUrl) {
  const t = String(photoUrl || '').trim()
  if (!t) return ''
  if (t.startsWith('data:')) {
    return t.length <= 500_000 ? t : ''
  }
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/')) {
    const base = String(import.meta.env.VITE_AUTH_BASE_URL || import.meta.env.VITE_LMS_API_BASE_URL || '')
      .trim()
      .replace(/\/$/, '')
    if (base) return `${base}${t}`
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${t}`
    }
    return t
  }
  return t
}
