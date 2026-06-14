/** Default env string values (see `.env.example`). */
export const EXPRESS_BODY_LIMIT_DEFAULT = '50mb'
export const UPLOAD_LIMIT_PHOTO_DEFAULT = '2mb'
export const UPLOAD_LIMIT_DEFAULT_DEFAULT = '15mb'
export const UPLOAD_LIMIT_STUDY_MATERIALS_DEFAULT = '25mb'

/** Static byte caps (match env defaults — frontend + shared validation). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const DEFAULT_UPLOAD_MAX_BYTES = 15 * 1024 * 1024
export const FACULTY_STUDY_MATERIAL_MAX_BYTES = 25 * 1024 * 1024

/** Multer / Express ceiling — must be ≥ largest upload + Base64 overhead. */
export const MULTER_MAX_BYTES = 50 * 1024 * 1024

/** 0 = unlimited backup restore upload size */
export const BACKUP_RESTORE_MAX_BYTES_DEFAULT = 0

export const PHOTO_MAX_MSG = 'Photo too large. Maximum size is 2MB.'
export const DEFAULT_UPLOAD_MAX_MSG = 'File too large. Maximum size is 15MB.'
export const FACULTY_STUDY_MATERIAL_MAX_MSG = 'File too large. Maximum size is 25MB.'
export const STUDENT_SUBMISSION_MAX_BYTES = 10 * 1024 * 1024
export const STUDENT_SUBMISSION_MAX_MSG =
  'File size exceeds 10 MB limit. Please choose a smaller file.'

export const PHOTO_UPLOAD_LABEL = 'Images only • Max 2MB'
export const STUDY_MATERIAL_UPLOAD_LABEL = 'PDF only • Max 25MB'
export const DEFAULT_UPLOAD_LABEL = 'PDF, DOC, DOCX • Max 15MB'

/** Aliases used across the codebase */
export const PROFILE_PHOTO_MAX_BYTES = PHOTO_MAX_BYTES
export const PROFILE_PHOTO_MAX_MSG = PHOTO_MAX_MSG
export const SUBJECT_MATERIAL_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
export const SUBJECT_MATERIAL_MAX_MSG = DEFAULT_UPLOAD_MAX_MSG
export const GENERIC_UPLOAD_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
export const GENERIC_UPLOAD_MAX_MSG = DEFAULT_UPLOAD_MAX_MSG
export const STUDY_MATERIAL_MAX_BYTES = FACULTY_STUDY_MATERIAL_MAX_BYTES
export const STUDY_MATERIAL_MAX_MSG = FACULTY_STUDY_MATERIAL_MAX_MSG
export const ORIGINALITY_FILE_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
export const ORIGINALITY_FILE_MAX_MSG = DEFAULT_UPLOAD_MAX_MSG
export const ORIGINALITY_CONTENT_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
export const ORIGINALITY_ACCEPT_LABEL = 'TXT, DOCX, PDF • Max 15MB'

/** @param {number} byteLength @param {number} maxBytes */
export function isWithinLimit(byteLength, maxBytes) {
  const n = Number(byteLength)
  return Number.isFinite(n) && n > 0 && n <= maxBytes
}

/** @param {string} raw */
export function estimateDataUrlDecodedBytes(raw) {
  const t = String(raw || '').trim()
  if (!t) return 0
  const base64 = t.includes('base64,') ? t.split('base64,')[1] : t
  const len = base64.replace(/\s/g, '').length
  if (!len) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - padding
}

/** @param {string} raw */
export function validateProfilePhotoPayload(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  if (t.startsWith('/uploads/')) return ''
  if (/^data:image\//i.test(t)) {
    const decoded = estimateDataUrlDecodedBytes(t)
    if (decoded > PHOTO_MAX_BYTES) return PHOTO_MAX_MSG
  }
  return ''
}

/** @param {File|null|undefined} file @param {number} maxBytes @param {string} message */
export function validateFileSize(file, maxBytes, message) {
  if (!file) return ''
  if (file.size > maxBytes) return message
  return ''
}
