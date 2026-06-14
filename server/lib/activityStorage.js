import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_UPLOAD_MAX_BYTES,
  DEFAULT_UPLOAD_MAX_MSG,
} from './uploadLimitsConfig.js'

export const ACTIVITY_UPLOAD_REL = '/uploads/activities'
export const ACTIVITY_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES
export const ACTIVITY_FILE_SIZE_MSG = DEFAULT_UPLOAD_MAX_MSG
export const ACTIVITY_FILE_TYPE_MSG = 'Only PDF, DOC, and DOCX files are allowed.'

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx'])
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function activitiesUploadAbsDir() {
  return path.join(process.cwd(), 'public', 'uploads', 'activities')
}

export function ensureActivitiesUploadDir() {
  const dir = activitiesUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'activity'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'activity'
}

export function saveActivityFile(buffer, originalName) {
  ensureActivitiesUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const abs = path.join(activitiesUploadAbsDir(), fileName)
  fs.writeFileSync(abs, buffer)
  return {
    file_path: `${ACTIVITY_UPLOAD_REL}/${fileName}`,
    file_name: path.basename(originalName || fileName),
    file_size: buffer.length,
  }
}

export function deleteActivityFileByUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t.startsWith(`${ACTIVITY_UPLOAD_REL}/`)) return
  const rel = t.slice(ACTIVITY_UPLOAD_REL.length + 1)
  const abs = path.join(activitiesUploadAbsDir(), rel)
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

function validateActivityFile(file) {
  if (!file) return 'Activity file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return ACTIVITY_FILE_TYPE_MSG
  }
  if (file.size > ACTIVITY_MAX_BYTES) {
    return ACTIVITY_FILE_SIZE_MSG
  }
  return ''
}

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ACTIVITY_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(ACTIVITY_FILE_TYPE_MSG))
  },
})

function multerSingle(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    res.status(400).json({
      ok: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? ACTIVITY_FILE_SIZE_MSG : String(err.message || err),
    })
  })
}

export function activityUploadMiddleware(req, res, next) {
  multerSingle(req, res, next)
}

export function getActivityUploadFile(req) {
  return req.file || null
}

export function validateActivityUploadFile(file) {
  return validateActivityFile(file)
}
