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

export const LESSON_UPLOAD_REL = '/uploads/lessons'
export const LESSON_FILE_SIZE_MSG = GENERIC_UPLOAD_FAILED_MSG
export const LESSON_FILE_TYPE_MSG = PDF_ONLY_TYPE_MSG

const ALLOWED_EXT = new Set(['.pdf'])
const ALLOWED_MIMES = new Set(['application/pdf'])

function lessonsUploadAbsDir() {
  return path.join(uploadsRoot(), 'lessons')
}

export function ensureLessonsUploadDir() {
  const dir = lessonsUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'lesson'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'lesson'
}

export function saveLessonFile(buffer, originalName) {
  ensureLessonsUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.pdf'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const abs = path.join(lessonsUploadAbsDir(), fileName)
  fs.writeFileSync(abs, buffer)
  return {
    file_path: `${LESSON_UPLOAD_REL}/${fileName}`,
    file_name: path.basename(originalName || fileName),
    file_size: buffer.length,
  }
}

export function deleteLessonFileByUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t.startsWith(`${LESSON_UPLOAD_REL}/`)) return
  const rel = t.slice(LESSON_UPLOAD_REL.length + 1)
  const abs = path.join(lessonsUploadAbsDir(), rel)
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

function validateLessonFile(file, { required = false } = {}) {
  if (!file) return required ? 'Lesson file is required.' : ''
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return LESSON_FILE_TYPE_MSG
  }
  return ''
}

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(LESSON_FILE_TYPE_MSG))
  },
})

function multerSingle(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    res.status(400).json({
      ok: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? LESSON_FILE_SIZE_MSG : String(err.message || err),
    })
  })
}

export function lessonUploadMiddleware(req, res, next) {
  multerSingle(req, res, next)
}

export function getLessonUploadFile(req) {
  return req.file || null
}

export function validateLessonUploadFile(file, opts) {
  return validateLessonFile(file, opts)
}
