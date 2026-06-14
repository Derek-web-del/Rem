import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_UPLOAD_MAX_BYTES,
  DEFAULT_UPLOAD_MAX_MSG,
} from './uploadLimitsConfig.js'

export const SYLLABUS_UPLOAD_REL = '/uploads/syllabus'
export const SYLLABUS_MAX_BYTES = DEFAULT_UPLOAD_MAX_BYTES

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx'])
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function syllabusUploadAbsDir() {
  return path.join(process.cwd(), 'public', 'uploads', 'syllabus')
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

export function saveSyllabusFile(buffer, originalName) {
  ensureSyllabusUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.pdf'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const abs = path.join(syllabusUploadAbsDir(), fileName)
  fs.writeFileSync(abs, buffer)
  return {
    syllabus_pdf: `${SYLLABUS_UPLOAD_REL}/${fileName}`,
    file_name: path.basename(originalName || fileName),
  }
}

export function deleteSyllabusFileByUrl(syllabusPdf) {
  const t = String(syllabusPdf || '').trim()
  if (!t.startsWith(`${SYLLABUS_UPLOAD_REL}/`)) return
  const rel = t.slice(SYLLABUS_UPLOAD_REL.length + 1)
  const abs = path.join(syllabusUploadAbsDir(), rel)
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

function validateSyllabusFile(file) {
  if (!file) return 'Syllabus file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIMES.has(mime)) {
    return 'Only PDF, DOC, and DOCX files are allowed.'
  }
  if (file.size > SYLLABUS_MAX_BYTES) {
    return DEFAULT_UPLOAD_MAX_MSG
  }
  return ''
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SYLLABUS_MAX_BYTES, files: 1, fields: 8 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (ALLOWED_EXT.has(ext) || ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error('Only PDF, DOC, and DOCX files allowed'))
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
      error: err.code === 'LIMIT_FILE_SIZE' ? DEFAULT_UPLOAD_MAX_MSG : String(err.message || err),
    })
  })
}

export function getSyllabusUploadFile(req) {
  return req.file || null
}

export function validateSyllabusUploadFile(file) {
  return validateSyllabusFile(file)
}
