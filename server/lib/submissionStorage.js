import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import {
  STUDENT_SUBMISSION_MAX_BYTES,
  STUDENT_SUBMISSION_MAX_MSG,
} from '../../shared/uploadLimits.js'
import { PDF_MIMES, verifyUploadMagicBytes } from './uploadMagicBytes.js'

export const ASSIGNMENT_SUBMISSION_REL = '/uploads/submissions/assignments'
export const ACTIVITY_SUBMISSION_REL = '/uploads/submissions/activities'

export const STUDENT_SUBMISSION_TYPE_REJECT_MSG = 'Only PDF files are accepted.'

const STUDENT_ALLOWED_EXT = new Set(['.pdf'])
const STUDENT_ALLOWED_MIMES = new Set(['application/pdf'])

function absDir(rel) {
  return path.join(process.cwd(), 'public', rel.replace(/^\//, ''))
}

function ensureDir(rel) {
  const dir = absDir(rel)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function extFromFile(originalName, mime) {
  const ext = path.extname(String(originalName || '')).toLowerCase()
  if (STUDENT_ALLOWED_EXT.has(ext)) return ext
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf')) return '.pdf'
  return '.bin'
}

export function saveStudentSubmissionFile({ buffer, originalName, mime, studentId, itemId, kind }) {
  const relBase = kind === 'activity' ? ACTIVITY_SUBMISSION_REL : ASSIGNMENT_SUBMISSION_REL
  ensureDir(relBase)
  const ext = extFromFile(originalName, mime)
  const ts = Date.now()
  const fileName = `${studentId}_${itemId}_${ts}${ext}`
  const abs = path.join(absDir(relBase), fileName)
  fs.writeFileSync(abs, buffer)
  return {
    file_path: `${relBase}/${fileName}`,
    file_name: path.basename(String(originalName || fileName)),
    file_size: buffer.length,
  }
}

export function deleteSubmissionFileByUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t.startsWith(ASSIGNMENT_SUBMISSION_REL) && !t.startsWith(ACTIVITY_SUBMISSION_REL)) return
  const abs = path.join(process.cwd(), 'public', t.replace(/^\//, ''))
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

function validateStudentSubmissionFile(file) {
  if (!file) return 'Submission file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!STUDENT_ALLOWED_EXT.has(ext) && !STUDENT_ALLOWED_MIMES.has(mime)) {
    return STUDENT_SUBMISSION_TYPE_REJECT_MSG
  }
  if (file.size > STUDENT_SUBMISSION_MAX_BYTES) {
    return STUDENT_SUBMISSION_MAX_MSG
  }
  return ''
}

function createUploadMiddleware() {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: STUDENT_SUBMISSION_MAX_BYTES, files: 1, fields: 8 },
    fileFilter(_req, file, cb) {
      const err = validateStudentSubmissionFile(file)
      if (err && err !== STUDENT_SUBMISSION_MAX_MSG) {
        cb(new Error(err))
        return
      }
      cb(null, true)
    },
  })
  return (req, res, next) => {
    const ct = String(req.headers['content-type'] || '')
    if (!ct.includes('multipart/form-data')) {
      res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Expected multipart/form-data.' })
      return
    }
    upload.single('file')(req, res, (err) => {
      if (!err) return next()
      const msg = String(err.message || err)
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: STUDENT_SUBMISSION_MAX_MSG })
        return
      }
      if (msg === STUDENT_SUBMISSION_TYPE_REJECT_MSG) {
        res.status(400).json({ error: STUDENT_SUBMISSION_TYPE_REJECT_MSG })
        return
      }
      res.status(400).json({
        success: false,
        error: 'BAD_REQUEST',
        message: msg,
      })
    })
  }
}

export const studentSubmissionUploadMiddleware = createUploadMiddleware()

export function getStudentSubmissionUploadFile(req) {
  return req.file || null
}

export function validateStudentSubmissionUploadFile(file) {
  return validateStudentSubmissionFile(file)
}

export async function validateStudentSubmissionUploadFileAsync(file) {
  const syncErr = validateStudentSubmissionUploadFile(file)
  if (syncErr) return syncErr
  if (!file?.buffer?.length) return STUDENT_SUBMISSION_TYPE_REJECT_MSG
  return verifyUploadMagicBytes(file.buffer, PDF_MIMES)
}

export function streamSubmissionDownload(res, filePath, downloadName) {
  const rel = String(filePath || '').trim()
  if (!rel) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'File not found.' })
    return
  }
  const abs = path.join(process.cwd(), 'public', rel.replace(/^\//, ''))
  if (!fs.existsSync(abs)) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'File missing on disk.' })
    return
  }
  const name = String(downloadName || path.basename(abs)).trim() || path.basename(abs)
  res.download(abs, name)
}
