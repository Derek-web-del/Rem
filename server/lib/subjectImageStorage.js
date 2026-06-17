import fs from 'node:fs'
import path from 'node:path'
import {
  SUBJECT_IMAGE_EXTENSIONS,
  SUBJECT_IMAGE_PLACEHOLDER,
  SUBJECT_UPLOAD_REL,
  normalizeSubjectImageKey,
  resolveSubjectImageFromMap,
  subjectImages,
} from '../../shared/subjectImages.js'
import { subjectAssetsRoot } from './uploadPaths.js'

export { SUBJECT_UPLOAD_REL, SUBJECT_IMAGE_PLACEHOLDER, subjectImages }

export function getSubjectImagesDir() {
  return subjectAssetsRoot()
}

function fileExistsPublicUrl(publicPath) {
  const rel = String(publicPath || '').replace(/^\/uploads\/Subjects_images\//, '')
  if (!rel) return false
  return fs.existsSync(path.join(getSubjectImagesDir(), rel))
}

function normalizeFileStem(stem) {
  return String(stem || '')
    .trim()
    .toLowerCase()
    .replace(/_logo$/i, '')
    .replace(/\s+/g, '')
}

/**
 * Resolve subject cover image path from name: map → filesystem scan → placeholder.
 * @param {string} subjectName
 * @returns {string}
 */
export function resolveSubjectImagePath(subjectName) {
  const trimmed = String(subjectName || '').trim()
  if (!trimmed) return SUBJECT_IMAGE_PLACEHOLDER

  const fromMap = resolveSubjectImageFromMap(trimmed)
  if (fromMap !== SUBJECT_IMAGE_PLACEHOLDER && fileExistsPublicUrl(fromMap)) {
    return fromMap
  }

  const key = normalizeSubjectImageKey(trimmed)

  const dir = getSubjectImagesDir()
  if (fs.existsSync(dir)) {
    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      entries = []
    }

    for (const file of entries) {
      const ext = path.extname(file).toLowerCase()
      if (!SUBJECT_IMAGE_EXTENSIONS.includes(ext)) continue
      const stem = path.basename(file, ext)
      if (normalizeFileStem(stem) === key) {
        return `${SUBJECT_UPLOAD_REL}/${file}`
      }
    }

    for (const file of entries) {
      const ext = path.extname(file).toLowerCase()
      if (!SUBJECT_IMAGE_EXTENSIONS.includes(ext)) continue
      const stem = path.basename(file, ext)
      const normalizedStem = normalizeFileStem(stem)
      if (normalizedStem.startsWith(key) || key.startsWith(normalizedStem)) {
        return `${SUBJECT_UPLOAD_REL}/${file}`
      }
    }
  }

  const fallback = resolveSubjectImageFromMap(subjectName)
  if (fallback !== SUBJECT_IMAGE_PLACEHOLDER && fileExistsPublicUrl(fallback)) {
    return fallback
  }

  return SUBJECT_IMAGE_PLACEHOLDER
}
