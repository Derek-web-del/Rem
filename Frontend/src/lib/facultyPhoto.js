import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_MSG,
} from '../../../shared/uploadLimits.js'
import { uploadsPathToApiUrl } from './fileUrls.js'
import { apiUrl } from './lmsStateStorage.js'

export { PROFILE_PHOTO_MAX_BYTES as FACULTY_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_MSG }

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

const STORED_PATH_PREFIXES = [
  '/api/files/photos/',
  '/api/files/faculties/',
  '/uploads/faculties/',
  '/uploads/photos/',
  'public/uploads/faculties/',
  'public/uploads/photos/',
  'uploads/faculties/',
  'uploads/photos/',
]

/** Strip stored DB/path values down to a bare filename (e.g. derek.jpg). */
export function facultyPhotoFilenameFromStored(stored) {
  let s = String(stored ?? '').trim().replace(/\\/g, '/')
  if (!s || s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) {
    return ''
  }
  for (const prefix of STORED_PATH_PREFIXES) {
    const idx = s.toLowerCase().indexOf(prefix.toLowerCase())
    if (idx !== -1) {
      s = s.slice(idx + prefix.length)
      break
    }
  }
  if (s.startsWith('/')) s = s.slice(1)
  return s.split('/').filter(Boolean).pop() || ''
}

/** Build display URL: /api/files/photos/<filename> (files live under public/uploads/faculties). */
export function facultyPhotoDisplaySrc(photoUrl) {
  const t = String(photoUrl || '').trim()
  if (!t) return ''
  if (t.startsWith('data:')) return t
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/uploads/') || t.startsWith('/api/files/')) {
    return uploadsPathToApiUrl(t)
  }
  const filename = facultyPhotoFilenameFromStored(t)
  if (filename) {
    return apiUrl(`/api/files/photos/${filename}`)
  }
  return ''
}

/** Absolute URL for Better Auth profile `image` field. */
export function facultyPhotoAuthImageUrl(photoUrl) {
  return facultyPhotoDisplaySrc(photoUrl)
}

/** Client-side validation before upload (PNG/JPG, max 2MB). */
export function validateFacultyPhotoFile(file) {
  if (!file) return ''
  const mime = String(file.type || '').toLowerCase()
  if (!ALLOWED_TYPES.has(mime)) return 'Only PNG or JPG images are allowed.'
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return PROFILE_PHOTO_MAX_MSG
  return ''
}
