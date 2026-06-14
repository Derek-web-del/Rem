import bytes from 'bytes'
import {
  EXPRESS_BODY_LIMIT_DEFAULT,
  UPLOAD_LIMIT_PHOTO_DEFAULT,
  UPLOAD_LIMIT_DEFAULT_DEFAULT,
  UPLOAD_LIMIT_STUDY_MATERIALS_DEFAULT,
  BACKUP_RESTORE_MAX_BYTES_DEFAULT,
  PHOTO_MAX_MSG,
  DEFAULT_UPLOAD_MAX_MSG,
  FACULTY_STUDY_MATERIAL_MAX_MSG,
  MULTER_MAX_BYTES,
} from '../../shared/uploadLimits.js'

function resolveBytes(envVal, fallbackStr) {
  const s = String(envVal || fallbackStr).trim() || fallbackStr
  const n = bytes.parse(s)
  if (typeof n === 'number' && n > 0) return n
  const fb = bytes.parse(fallbackStr)
  return typeof fb === 'number' ? fb : 0
}

export const EXPRESS_BODY_LIMIT =
  String(process.env.EXPRESS_BODY_LIMIT || EXPRESS_BODY_LIMIT_DEFAULT).trim() || EXPRESS_BODY_LIMIT_DEFAULT

export const EXPRESS_BODY_LIMIT_BYTES = resolveBytes(EXPRESS_BODY_LIMIT, EXPRESS_BODY_LIMIT_DEFAULT)

export const PHOTO_MAX_BYTES = resolveBytes(process.env.UPLOAD_LIMIT_PHOTO, UPLOAD_LIMIT_PHOTO_DEFAULT)

export const DEFAULT_UPLOAD_MAX_BYTES = resolveBytes(
  process.env.UPLOAD_LIMIT_DEFAULT,
  UPLOAD_LIMIT_DEFAULT_DEFAULT,
)

export const FACULTY_STUDY_MATERIAL_MAX_BYTES = resolveBytes(
  process.env.UPLOAD_LIMIT_STUDY_MATERIALS,
  UPLOAD_LIMIT_STUDY_MATERIALS_DEFAULT,
)

/** 0 = unlimited .lnbak restore upload size */
export const BACKUP_RESTORE_MAX_BYTES = (() => {
  const raw = String(process.env.BACKUP_RESTORE_MAX_BYTES ?? BACKUP_RESTORE_MAX_BYTES_DEFAULT).trim()
  if (!raw || raw === '0') return 0
  const n = bytes.parse(raw)
  return typeof n === 'number' && n > 0 ? n : 0
})()

/** Multer accepts up to body limit; feature validators enforce smaller caps. */
export const MULTER_FILE_SIZE_CEILING = Math.max(
  MULTER_MAX_BYTES,
  EXPRESS_BODY_LIMIT_BYTES,
  PHOTO_MAX_BYTES,
  DEFAULT_UPLOAD_MAX_BYTES,
  FACULTY_STUDY_MATERIAL_MAX_BYTES,
)

export {
  PHOTO_MAX_MSG,
  DEFAULT_UPLOAD_MAX_MSG,
  FACULTY_STUDY_MATERIAL_MAX_MSG as STUDY_MATERIAL_MAX_MSG,
  MULTER_MAX_BYTES,
}

export const ORIGINALITY_CONTENT_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
