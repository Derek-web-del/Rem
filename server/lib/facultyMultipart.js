import multer from 'multer'
import { FACULTY_PHOTO_MAX_BYTES } from './facultyPhotoStorage.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FACULTY_PHOTO_MAX_BYTES, files: 1, fields: 40 },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mime)) {
      cb(new Error('Only PNG or JPG images are allowed.'))
      return
    }
    cb(null, true)
  },
})

function isMultipart(req) {
  return String(req.headers['content-type'] || '').includes('multipart/form-data')
}

/** Parse JSON-encoded fields sent inside multipart FormData. */
export function normalizeFacultyMultipartBody(body = {}) {
  const b = { ...body }
  for (const key of ['sectionIds', 'section_ids', 'advisorySections']) {
    const raw = b[key]
    if (typeof raw === 'string' && raw.trim()) {
      try {
        b[key] = JSON.parse(raw)
      } catch {
        /* keep string */
      }
    }
  }
  return b
}

export function facultyPhotoUploadMiddleware(req, res, next) {
  if (!isMultipart(req)) return next()
  upload.single('photo')(req, res, (err) => {
    if (!err) return next()
    const msg = String(err.message || err)
    const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400
    res.status(status).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be less than 2MB.' : msg,
    })
  })
}

export function getFacultyUploadFile(req) {
  return req.file || null
}
