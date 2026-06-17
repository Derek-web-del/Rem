import {
  SUBJECT_IMAGE_PLACEHOLDER,
  SUBJECT_IMAGE_MAP,
  PREDEFINED_SUBJECT_NAMES,
  normalizeSubjectImageKey,
  resolveSubjectImageFromMap,
  subjectImages,
} from '../../../shared/subjectImages.js'
import { uploadsPathToApiUrl } from './fileUrls.js'

export {
  SUBJECT_IMAGE_PLACEHOLDER,
  SUBJECT_IMAGE_MAP,
  PREDEFINED_SUBJECT_NAMES,
  normalizeSubjectImageKey,
  resolveSubjectImageFromMap,
  subjectImages,
}

function resolveStoredPath(subjectOrName) {
  if (!subjectOrName || typeof subjectOrName !== 'object') return ''
  return String(
    subjectOrName.subjectPhoto ??
      subjectOrName.subject_photo ??
      subjectOrName.cover_image_url ??
      '',
  ).trim()
}

function resolveSubjectName(subjectOrName) {
  if (subjectOrName && typeof subjectOrName === 'object') {
    return String(subjectOrName.subjectName ?? subjectOrName.subject_name ?? '').trim()
  }
  return String(subjectOrName ?? '').trim()
}

/**
 * Pick the best stored/map path for a subject cover image.
 * Prefers known map logos over stale DB paths; falls back to placeholder.
 */
export function resolveSubjectImagePath(subjectOrName) {
  const name = resolveSubjectName(subjectOrName)
  const stored = resolveStoredPath(subjectOrName)
  const mapPath = name ? resolveSubjectImageFromMap(name) : ''
  const hasKnownLogo = mapPath && mapPath !== SUBJECT_IMAGE_PLACEHOLDER

  if (hasKnownLogo && (!stored || stored === SUBJECT_IMAGE_PLACEHOLDER)) {
    return mapPath
  }
  if (hasKnownLogo && stored && stored !== mapPath) {
    return mapPath
  }
  if (stored) return stored
  if (mapPath) return mapPath
  return SUBJECT_IMAGE_PLACEHOLDER
}

/**
 * Resolve display URL for a subject cover image.
 * @param {string|object} subjectOrName — subject row or subject name
 * @param {{ apiUrlFn?: (path: string) => string }} [options]
 */
export function subjectImageDisplaySrc(subjectOrName, { apiUrlFn } = {}) {
  const resolve = typeof apiUrlFn === 'function' ? apiUrlFn : (p) => p
  const path = resolveSubjectImagePath(subjectOrName)

  if (!path) return resolve(uploadsPathToApiUrl(SUBJECT_IMAGE_PLACEHOLDER))
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  if (path.startsWith('/uploads/') || path.startsWith('/api/files/') || path.startsWith('/subject-logos/')) {
    return resolve(uploadsPathToApiUrl(path))
  }
  return path
}

/** Placeholder cover URL for img onError fallback. */
export function subjectImagePlaceholderSrc({ apiUrlFn } = {}) {
  return subjectImageDisplaySrc({ subject_photo: SUBJECT_IMAGE_PLACEHOLDER }, { apiUrlFn })
}
