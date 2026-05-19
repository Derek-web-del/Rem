import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'

export const CURRICULUM_UPLOAD_REL = '/uploads/curriculum'
export const CURRICULUM_PDF_MAX_BYTES = 25 * 1024 * 1024

function curriculumUploadAbsDir() {
  return path.join(process.cwd(), 'public', 'uploads', 'curriculum')
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

/** Persist PDF buffer; returns public URL path `/uploads/curriculum/...`. */
export function saveCurriculumPdf(buffer, originalName) {
  ensureCurriculumUploadDir()
  const ext = path.extname(originalName || '').toLowerCase() || '.pdf'
  const stem = safeBaseName(originalName).replace(/\.pdf$/i, '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${ext === '.pdf' ? ext : '.pdf'}`
  const abs = path.join(curriculumUploadAbsDir(), fileName)
  fs.writeFileSync(abs, buffer)
  return `${CURRICULUM_UPLOAD_REL}/${fileName}`
}

export function deleteCurriculumFileByUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t.startsWith(`${CURRICULUM_UPLOAD_REL}/`)) return
  const rel = t.slice(CURRICULUM_UPLOAD_REL.length + 1)
  const abs = path.join(curriculumUploadAbsDir(), rel)
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CURRICULUM_PDF_MAX_BYTES, files: 1, fields: 12 },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase()
    const name = String(file.originalname || '').toLowerCase()
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      cb(null, true)
      return
    }
    cb(new Error('Only PDF files are allowed.'))
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
      error: err.code === 'LIMIT_FILE_SIZE' ? 'PDF must be less than 25MB.' : String(err.message || err),
    })
  })
}
