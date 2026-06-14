import path from 'node:path'
import multer from 'multer'
import { saveStudyMaterialFile, deleteStudyMaterialFileByUrl } from './studyMaterialStorage.js'
import {
  DEFAULT_UPLOAD_MAX_BYTES,
  FACULTY_STUDY_MATERIAL_MAX_BYTES,
  STUDY_MATERIAL_MAX_MSG,
} from './uploadLimitsConfig.js'

export const FACULTY_MATERIAL_MAX_BYTES = FACULTY_STUDY_MATERIAL_MAX_BYTES
export const FACULTY_MATERIAL_SIZE_MSG = STUDY_MATERIAL_MAX_MSG
export const FACULTY_MATERIAL_TYPE_MSG = 'Only PDF files are allowed.'
export const FACULTY_MATERIAL_FILE_TYPE = 'PDF'

const ALLOWED_EXT = new Set(['.pdf'])
const ALLOWED_MIMES = new Set(['application/pdf'])

export { deleteStudyMaterialFileByUrl, saveStudyMaterialFile }

export function facultyMaterialFileTypeLabel(_originalName, mime) {
  const ext = path.extname(String(_originalName || '')).toLowerCase()
  const m = String(mime || '').toLowerCase()
  if (ext === '.pdf' || m.includes('pdf')) return FACULTY_MATERIAL_FILE_TYPE
  return FACULTY_MATERIAL_FILE_TYPE
}

export function validateFacultyMaterialFile(file, { required = true } = {}) {
  if (!file) {
    return required ? 'Study material file is required.' : ''
  }
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return FACULTY_MATERIAL_TYPE_MSG
  }
  if (file.size > FACULTY_MATERIAL_MAX_BYTES) {
    return FACULTY_MATERIAL_SIZE_MSG
  }
  return ''
}

export function parseBase64Upload(body) {
  const raw =
    body?.file_base64 ?? body?.fileBase64 ?? body?.file_data ?? body?.fileData ?? body?.file ?? null
  if (!raw) return null

  const originalname = String(
    body?.file_name ?? body?.fileName ?? body?.original_name ?? 'material.pdf',
  ).trim()

  let buffer
  let mimetype = String(body?.mime_type ?? body?.mimeType ?? 'application/pdf').trim()

  const s = String(raw).trim()
  const m = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]*)$/i.exec(s)
  if (m) {
    mimetype = m[1] || mimetype
    buffer = Buffer.from(m[2], 'base64')
  } else {
    buffer = Buffer.from(s, 'base64')
  }

  const file = {
    buffer,
    originalname,
    mimetype: mimetype || 'application/pdf',
    size: buffer.length,
  }

  const err = validateFacultyMaterialFile(file, { required: true })
  if (err) {
    const e = new Error(err)
    e.statusCode = 400
    throw e
  }

  return file
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FACULTY_MATERIAL_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(FACULTY_MATERIAL_TYPE_MSG))
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

export function facultyStudyMaterialUploadMiddleware(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    res.status(400).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? FACULTY_MATERIAL_SIZE_MSG : String(err.message || err),
    })
  })
}

export function resolveUploadFile(req, body) {
  if (req.file) {
    const err = validateFacultyMaterialFile(req.file, { required: true })
    if (err) {
      const e = new Error(err)
      e.statusCode = 400
      throw e
    }
    return {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }
  }
  const parsed = parseBase64Upload(body || req.body || {})
  if (!parsed) return null
  return parsed
}
