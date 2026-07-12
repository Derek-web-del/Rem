import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  MULTER_MAX_BYTES,
  GENERIC_UPLOAD_FAILED_MSG,
  PDF_ONLY_TYPE_MSG,
} from './uploadLimitsConfig.js'
import { uploadsRoot } from './uploadPaths.js'
import { persistUploadBuffer, deleteUploadByStoredPath } from './uploadFileStorage.js'

export const SYLLABUS_UPLOAD_REL = '/uploads/syllabus'

const ALLOWED_EXT = new Set(['.pdf'])
const ALLOWED_MIMES = new Set(['application/pdf'])

function syllabusUploadAbsDir() {
  return path.join(uploadsRoot(), 'syllabus')
}

export function ensureSyllabusUploadDir() {
  const dir = syllabusUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'syllabus'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'syllabus'
}

export async function saveSyllabusFile(buffer, originalName) {
  ensureSyllabusUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.pdf'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const stored = `${SYLLABUS_UPLOAD_REL}/${fileName}`
  await persistUploadBuffer(stored, buffer)
  return {
    syllabus_pdf: stored,
    file_name: path.basename(originalName || fileName),
  }
}

export async function deleteSyllabusFileByUrl(syllabusPdf) {
  await deleteUploadByStoredPath(syllabusPdf)
}

function validateSyllabusFile(file) {
  if (!file) return 'Syllabus file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return PDF_ONLY_TYPE_MSG
  }
  return ''
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_MAX_BYTES, files: 1, fields: 8 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(PDF_ONLY_TYPE_MSG))
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

export function syllabusUploadMiddleware(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    res.status(400).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? GENERIC_UPLOAD_FAILED_MSG : String(err.message || err),
    })
  })
}

export function getSyllabusUploadFile(req) {
  return req.file || null
}

export function validateSyllabusUploadFile(file) {
  return validateSyllabusFile(file)
}
