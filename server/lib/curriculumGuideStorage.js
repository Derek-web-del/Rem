import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  MULTER_MAX_BYTES,
  GENERIC_UPLOAD_FAILED_MSG,
} from './uploadLimitsConfig.js'
import { PDF_MIMES, verifyUploadMagicBytes } from './uploadMagicBytes.js'
import { uploadsRoot } from './uploadPaths.js'
import { persistUploadBuffer, deleteUploadByStoredPath } from './uploadFileStorage.js'

export const CURRICULUM_UPLOAD_REL = '/uploads/curriculum'

function curriculumUploadAbsDir() {
  return path.join(uploadsRoot(), 'curriculum')
}

export function ensureCurriculumUploadDir() {
  const dir = curriculumUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'guide.pdf'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) || 'guide.pdf'
}

const ALLOWED_CURRICULUM_EXT = new Set(['.pdf'])

function normalizeCurriculumExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase()
  return ext === '.pdf' ? ext : '.pdf'
}

function mimeForCurriculumExt() {
  return 'application/pdf'
}

export async function saveCurriculumPdf(buffer, originalName) {
  return saveCurriculumGuideFile(buffer, originalName)
}

export async function saveCurriculumGuideFile(buffer, originalName) {
  ensureCurriculumUploadDir()
  const ext = normalizeCurriculumExt(originalName)
  const stem = safeBaseName(originalName).replace(/\.pdf$/i, '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${ext}`
  const stored = `${CURRICULUM_UPLOAD_REL}/${fileName}`
  await persistUploadBuffer(stored, buffer)
  return stored
}

export function curriculumMimeForFileName() {
  return mimeForCurriculumExt()
}

export async function deleteCurriculumFileByUrl(fileUrl) {
  await deleteUploadByStoredPath(fileUrl)
}

export function validateCurriculumPdfFile(file) {
  return validateCurriculumGuideFile(file)
}

export function validateCurriculumGuideFile(file) {
  if (!file?.buffer?.length) return 'Curriculum file is required.'
  const name = String(file.originalname || '').toLowerCase()
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
  if (!ALLOWED_CURRICULUM_EXT.has(ext)) return 'File must be PDF.'
  return ''
}

export async function validateCurriculumGuideFileAsync(file) {
  const syncErr = validateCurriculumGuideFile(file)
  if (syncErr) return syncErr
  return verifyUploadMagicBytes(file.buffer, PDF_MIMES)
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_MAX_BYTES, files: 1, fields: 12 },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase()
    const name = String(file.originalname || '').toLowerCase()
    const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''
    const ok = mime === 'application/pdf' || ext === '.pdf'
    if (ok) {
      cb(null, true)
      return
    }
    cb(new Error('File must be PDF.'))
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

export function curriculumPdfUploadMiddleware(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400
    res.status(status).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? GENERIC_UPLOAD_FAILED_MSG : String(err.message || err),
    })
  })
}
