import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { randomUUID } from 'node:crypto'

export const MATERIAL_UPLOAD_REL = '/uploads/materials'
export const MATERIAL_VIDEO_MAX_BYTES = 1024 * 1024 * 1024
export const MATERIAL_OTHER_MAX_BYTES = 50 * 1024 * 1024
export const DOCUMENT_EDIT_MAX_BYTES = 25 * 1024 * 1024
export const FILE_SIZE_MAX_MSG = 'File size must not exceed 25MB'
export const FILE_TYPE_MSG = 'Only PDF, DOC, and DOCX files are allowed'

/** PDF, DOC, DOCX only — used for teacher POST /api/teacher/materials */
export const DOCUMENT_ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx'])

export const DOCUMENT_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const ALLOWED_EXT = new Set([
  '.pdf',
  '.ppt',
  '.pptx',
  '.doc',
  '.docx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.mkv',
  '.mp3',
])

const VIDEO_EXT = new Set(['.mp4', '.avi', '.mov', '.wmv', '.mkv'])

function materialsUploadAbsDir() {
  return path.join(process.cwd(), 'public', 'uploads', 'materials')
}

export function ensureMaterialsUploadDir() {
  const dir = materialsUploadAbsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeBaseName(name) {
  const base = path.basename(String(name || 'material'))
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 160) || 'material'
}

export function guessMaterialFileType(originalName, mime) {
  const ext = path.extname(String(originalName || '')).toLowerCase()
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf') || ext === '.pdf') return 'application/pdf'
  if (m.includes('video') || VIDEO_EXT.has(ext)) return 'video/' + (ext.replace('.', '') || 'mp4')
  if (m.includes('image') || ['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image/' + (ext.replace('.', '') || 'jpeg')
  if (ext === '.ppt' || ext === '.pptx') return 'application/vnd.ms-powerpoint'
  if (ext === '.doc' || ext === '.docx') return 'application/msword'
  if (ext === '.mp3') return 'audio/mpeg'
  return m || 'application/octet-stream'
}

export function saveStudyMaterialFile(buffer, originalName) {
  ensureMaterialsUploadDir()
  const ext = path.extname(originalName || '').toLowerCase()
  const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin'
  const stem = safeBaseName(originalName).replace(new RegExp(`${safeExt.replace('.', '\\.')}$`, 'i'), '')
  const fileName = `${stem}-${randomUUID().slice(0, 8)}${safeExt}`
  const abs = path.join(materialsUploadAbsDir(), fileName)
  fs.writeFileSync(abs, buffer)
  return {
    file_url: `${MATERIAL_UPLOAD_REL}/${fileName}`,
    file_name: path.basename(originalName || fileName),
    file_size: buffer.length,
  }
}

export function deleteStudyMaterialFileByUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t.startsWith(`${MATERIAL_UPLOAD_REL}/`)) return
  const rel = t.slice(MATERIAL_UPLOAD_REL.length + 1)
  const abs = path.join(materialsUploadAbsDir(), rel)
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs)
    } catch {
      /* ignore */
    }
  }
}

function validateDocumentMaterialFile(file) {
  if (!file) return 'Study material file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!DOCUMENT_ALLOWED_EXT.has(ext) && !DOCUMENT_ALLOWED_MIMES.has(mime)) {
    return 'Only PDF, DOC, and DOCX files are allowed.'
  }
  if (file.size > MATERIAL_OTHER_MAX_BYTES) {
    return 'File must be under 50 MB.'
  }
  return ''
}

function validateMaterialFile(file) {
  if (!file) return 'Study material file is required.'
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    return 'Allowed: PDF, PPT, PPTX, DOC, DOCX, JPG, JPEG, PNG, GIF, MP4, AVI, MOV, WMV, MKV, MP3.'
  }
  const max = VIDEO_EXT.has(ext) ? MATERIAL_VIDEO_MAX_BYTES : MATERIAL_OTHER_MAX_BYTES
  if (file.size > max) {
    return VIDEO_EXT.has(ext) ? 'Video files must be under 1 GB.' : 'File must be under 50 MB.'
  }
  return ''
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MATERIAL_VIDEO_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      cb(new Error('File type not allowed.'))
      return
    }
    cb(null, true)
  },
})

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MATERIAL_OTHER_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (DOCUMENT_ALLOWED_EXT.has(ext) || DOCUMENT_ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error('Only PDF, DOC, and DOCX files allowed'))
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

const documentEditUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_EDIT_MAX_BYTES, files: 1, fields: 24 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (DOCUMENT_ALLOWED_EXT.has(ext) || DOCUMENT_ALLOWED_MIMES.has(mime)) {
      cb(null, true)
      return
    }
    cb(new Error(FILE_TYPE_MSG))
  },
})

function multerSingle(multerInstance, sizeLimitMsg) {
  return (req, res, next) => {
    if (!isMultipart(req)) return next()
    multerInstance.single('file')(req, res, (err) => {
      if (!err) return next()
      res.status(400).json({
        success: false,
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? sizeLimitMsg || FILE_SIZE_MAX_MSG
            : String(err.message || err),
      })
    })
  }
}

export function studyMaterialUploadMiddleware(req, res, next) {
  multerSingle(upload, 'File exceeds maximum size (50 MB, or 1 GB for video).')(req, res, next)
}

export function studyMaterialDocumentUploadMiddleware(req, res, next) {
  multerSingle(documentUpload, 'File must be under 50 MB.')(req, res, next)
}

export function studyMaterialEditUploadMiddleware(req, res, next) {
  multerSingle(documentEditUpload, FILE_SIZE_MAX_MSG)(req, res, next)
}

export function getStudyMaterialUploadFile(req) {
  return req.file || null
}

export function validateStudyMaterialUploadFile(file) {
  return validateMaterialFile(file)
}

export function validateDocumentStudyMaterialUploadFile(file) {
  return validateDocumentMaterialFile(file)
}

export function validateEditDocumentStudyMaterialUploadFile(file) {
  if (!file) return ''
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const mime = String(file.mimetype || '').toLowerCase()
  if (!DOCUMENT_ALLOWED_EXT.has(ext) && !DOCUMENT_ALLOWED_MIMES.has(mime)) {
    return FILE_TYPE_MSG
  }
  const maxSize = 25 * 1024 * 1024
  if (file.size > maxSize) {
    return FILE_SIZE_MAX_MSG
  }
  return ''
}
