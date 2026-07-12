import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  MULTER_MAX_BYTES,
  GENERIC_UPLOAD_FAILED_MSG,
  PDF_ONLY_TYPE_MSG,
} from './uploadLimitsConfig.js'
import { PDF_MIMES, verifyUploadMagicBytes } from './uploadMagicBytes.js'
import { uploadsRoot } from './uploadPaths.js'
import { persistUploadBuffer, deleteUploadByStoredPath } from './uploadFileStorage.js'

export const ASSIGNMENT_UPLOAD_REL = '/uploads/assignments'
export const ASSIGNMENT_FILE_SIZE_MSG = GENERIC_UPLOAD_FAILED_MSG
export const ASSIGNMENT_FILE_TYPE_MSG = PDF_ONLY_TYPE_MSG

const ALLOWED_EXT = new Set(['.pdf'])
const ALLOWED_MIMES = new Set(['application/pdf'])

function assignmentsUploadAbsDir() {
  return path.join(uploadsRoot(), 'assignments')
}

export function ensureAssignmentsUploadDir() {
  const dir = assignmentsUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'assignment'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'assignment'
}

export async function saveAssignmentFile(buffer, originalName) {
  ensureAssignmentsUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const stored = `${ASSIGNMENT_UPLOAD_REL}/${fileName}`
  await persistUploadBuffer(stored, buffer)
  return {
    file_path: stored,
    file_name: path.basename(originalName || fileName),
    file_size: buffer.length,
  }
}

export async function deleteAssignmentFileByUrl(fileUrl) {
  await deleteUploadByStoredPath(fileUrl)
}

function validateAssignmentFile(file, { required = true } = {}) {
  if (!file) return required ? 'Assignment file is required.' : ''
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return ASSIGNMENT_FILE_TYPE_MSG
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
    cb(new Error(ASSIGNMENT_FILE_TYPE_MSG))
  },
})

function multerSingle(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    res.status(400).json({
      ok: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? ASSIGNMENT_FILE_SIZE_MSG : String(err.message || err),
    })
  })
}

export function assignmentUploadMiddleware(req, res, next) {
  multerSingle(req, res, next)
}

export function getAssignmentUploadFile(req) {
  return req.file || null
}

export function validateAssignmentUploadFile(file, { required = true } = {}) {
  return validateAssignmentFile(file, { required })
}

export async function validateAssignmentUploadFileAsync(file) {
  const syncErr = validateAssignmentUploadFile(file)
  if (syncErr) return syncErr
  if (!file?.buffer?.length) return 'Assignment file is required.'
  return verifyUploadMagicBytes(file.buffer, PDF_MIMES)
}
