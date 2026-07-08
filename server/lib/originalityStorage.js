import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  MULTER_MAX_BYTES,
  GENERIC_UPLOAD_FAILED_MSG,
} from './uploadLimitsConfig.js'
import { uploadsRoot } from './uploadPaths.js'

export const ORIGINALITY_UPLOAD_REL = '/uploads/originality'
export const ORIGINALITY_FILE_TYPE_MSG = 'Supported formats: .txt, .pdf'
export const ORIGINALITY_FILE_SIZE_MSG = GENERIC_UPLOAD_FAILED_MSG

const ALLOWED_EXT = new Set(['.txt', '.pdf'])
const ALLOWED_MIMES = new Set(['text/plain', 'application/pdf'])

function originalityUploadAbsDir() {
  return path.join(uploadsRoot(), 'originality')
}

export function ensureOriginalityUploadDir() {
  const dir = originalityUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'document'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'document'
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, ensureOriginalityUploadDir())
  },
  filename(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin'
    const stem = safeBaseName(file.originalname).replace(
      new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'),
      '',
    )
    cb(null, `${stem}-${randomUUID().slice(0, 8)}${safeExt}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MULTER_MAX_BYTES, files: 1, fields: 8 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(ORIGINALITY_FILE_TYPE_MSG))
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

function multerSingle(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? ORIGINALITY_FILE_SIZE_MSG : String(err.message || err)
    res.status(400).json({ success: false, error: 'BAD_REQUEST', message })
  })
}

export function originalityUploadMiddleware(req, res, next) {
  multerSingle(req, res, next)
}

export function getOriginalityUploadFile(req) {
  return req.file || null
}
