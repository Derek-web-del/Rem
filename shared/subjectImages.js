/** Public URL prefix for subject cover images (served from `public/uploads/Subjects_images/`). */
export const SUBJECT_UPLOAD_REL = '/uploads/Subjects_images'

export const SUBJECT_IMAGE_PLACEHOLDER = `${SUBJECT_UPLOAD_REL}/subject-placeholder.svg`

export const SUBJECT_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

/**
 * Predefined admin subject options → cover image paths.
 * Keys are display names exactly as shown in the Add Subject dropdown.
 */
export const SUBJECT_IMAGE_MAP = {
  Filipino: `${SUBJECT_UPLOAD_REL}/Filipino_Logo.png`,
  English: `${SUBJECT_UPLOAD_REL}/English_Logo.png`,
  Math: `${SUBJECT_UPLOAD_REL}/Math_Logo.png`,
  Science: `${SUBJECT_UPLOAD_REL}/Science_Logo.png`,
  TLE: `${SUBJECT_UPLOAD_REL}/TLE_Logo.png`,
  MAPEH: `${SUBJECT_UPLOAD_REL}/MAPEH_Logo.png`,
  Research: `${SUBJECT_UPLOAD_REL}/Research_Logo.png`,
  Robotics: `${SUBJECT_UPLOAD_REL}/Robotics_Logo.png`,
  'Araling Panlipunan': `${SUBJECT_UPLOAD_REL}/Araling_Panlipunan_Logo.png`,
  Journalism: `${SUBJECT_UPLOAD_REL}/Journalism_Logo.png`,
  Bible: `${SUBJECT_UPLOAD_REL}/Bible_Logo.png`,
}

/** Ordered list for the Admin subject name dropdown. */
export const PREDEFINED_SUBJECT_NAMES = Object.keys(SUBJECT_IMAGE_MAP)

/**
 * Lowercase normalized lookup (legacy / filesystem fallback).
 * @deprecated Prefer SUBJECT_IMAGE_MAP via resolveSubjectImageFromMap.
 */
export const subjectImages = Object.fromEntries(
  Object.entries(SUBJECT_IMAGE_MAP).map(([name, path]) => [
    String(name).trim().toLowerCase().replace(/\s+/g, ''),
    path,
  ]),
)

/**
 * Normalize a subject name for image lookup: lowercase, no spaces.
 * @param {string} subjectName
 */
export function normalizeSubjectImageKey(subjectName) {
  return String(subjectName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/**
 * Resolve a subject image from SUBJECT_IMAGE_MAP (client-safe; no filesystem access).
 * @param {string} subjectName
 * @returns {string}
 */
export function resolveSubjectImageFromMap(subjectName) {
  const trimmed = String(subjectName || '').trim()
  if (!trimmed) return SUBJECT_IMAGE_PLACEHOLDER

  for (const [name, path] of Object.entries(SUBJECT_IMAGE_MAP)) {
    if (name.toLowerCase() === trimmed.toLowerCase()) return path
  }

  const key = normalizeSubjectImageKey(trimmed)
  if (subjectImages[key]) return subjectImages[key]
  return SUBJECT_IMAGE_PLACEHOLDER
}
