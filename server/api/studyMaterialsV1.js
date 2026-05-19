import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { isAllowedHighSchoolGradeLevel } from '../lib/gradeLevels.js'
import {
  deleteFacultyStudyMaterial,
  ensureFacultyStudyMaterialsSchema,
  fetchFacultyStudyMaterialById,
  insertFacultyStudyMaterial,
  listFacultyStudyMaterials,
  updateFacultyStudyMaterial,
} from '../lib/facultyStudyMaterialsDb.js'
import { fetchFacultyRowForSession, facultyDisplayName } from '../lib/facultySession.js'
import {
  deleteStudyMaterialFileByUrl,
  FACULTY_MATERIAL_FILE_TYPE,
  facultyStudyMaterialUploadMiddleware,
  resolveUploadFile,
  saveStudyMaterialFile,
  validateFacultyMaterialFile,
} from '../lib/facultyStudyMaterialStorage.js'

async function requireFacultySession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const u =
      session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Study materials API requires teacher/faculty role',
        requiredRole: 'faculty',
      })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    return { session, user: u }
  } catch (e) {
    sendSafeServerError(res, e, 'study-materials session gate')
    return null
  }
}

function readBodyFields(body) {
  const b = body || {}
  return {
    title: String(b.title ?? '').trim(),
    grade_level: String(b.grade_level ?? b.gradeLevel ?? '').trim(),
    subject: String(b.subject ?? b.subject_name ?? b.subjectName ?? '').trim(),
  }
}

export function createStudyMaterialsV1Router(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        success: false,
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Study materials API requires PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/v1/study-materials', svc503)
    router.get('/v1/study-materials/:id', svc503)
    router.post('/v1/study-materials', svc503)
    router.put('/v1/study-materials/:id', svc503)
    router.delete('/v1/study-materials/:id', svc503)
    return router
  }

  router.get('/v1/study-materials', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureFacultyStudyMaterialsSchema(pool)
      const materials = await listFacultyStudyMaterials(pool, facultyRow.id)
      res.json({ success: true, materials, data: materials })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/study-materials')
    }
  })

  router.get('/v1/study-materials/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      await ensureFacultyStudyMaterialsSchema(pool)
      const material = await fetchFacultyStudyMaterialById(pool, id, facultyRow.id)
      if (!material) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      res.json({ success: true, material })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/study-materials/:id')
    }
  })

  router.post('/v1/study-materials', facultyStudyMaterialUploadMiddleware, async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureFacultyStudyMaterialsSchema(pool)
      const { title, grade_level, subject } = readBodyFields(req.body)
      if (!title) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Study material title is required.' })
        return
      }
      if (!grade_level || !isAllowedHighSchoolGradeLevel(grade_level)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      if (!subject) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      const file = resolveUploadFile(req, req.body)
      const fileErr = validateFacultyMaterialFile(
        file
          ? {
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            }
          : null,
        { required: true },
      )
      if (fileErr) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: fileErr })
        return
      }
      const saved = saveStudyMaterialFile(file.buffer, file.originalname)
      const file_type = FACULTY_MATERIAL_FILE_TYPE
      const material = await insertFacultyStudyMaterial(pool, {
        title,
        grade_level,
        subject,
        file_name: saved.file_name,
        file_url: saved.file_url,
        file_type,
        file_size: saved.file_size,
        uploaded_by: facultyRow.id,
        uploaded_by_name: facultyDisplayName(facultyRow),
      })
      res.status(201).json({ success: true, material })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/study-materials')
    }
  })

  router.put('/v1/study-materials/:id', facultyStudyMaterialUploadMiddleware, async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      await ensureFacultyStudyMaterialsSchema(pool)
      const existing = await fetchFacultyStudyMaterialById(pool, id, facultyRow.id)
      if (!existing) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      const { title, grade_level, subject } = readBodyFields(req.body)
      if (!title) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Study material title is required.' })
        return
      }
      if (!grade_level || !isAllowedHighSchoolGradeLevel(grade_level)) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      if (!subject) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      let file_url = existing.file_url
      let file_name = existing.file_name
      let file_type = existing.file_type
      let file_size = existing.file_size
      const file = resolveUploadFile(req, req.body)
      if (file) {
        const fileErr = validateFacultyMaterialFile(
          {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
          { required: false },
        )
        if (fileErr) {
          res.status(400).json({ success: false, error: 'BAD_REQUEST', message: fileErr })
          return
        }
        deleteStudyMaterialFileByUrl(existing.file_url)
        const saved = saveStudyMaterialFile(file.buffer, file.originalname)
        file_url = saved.file_url
        file_name = saved.file_name
        file_size = saved.file_size
        file_type = FACULTY_MATERIAL_FILE_TYPE
      }
      const material = await updateFacultyStudyMaterial(pool, id, facultyRow.id, {
        title,
        grade_level,
        subject,
        file_name,
        file_url,
        file_type,
        file_size,
      })
      res.json({ success: true, material })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/v1/study-materials/:id')
    }
  })

  router.delete('/v1/study-materials/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid material id.' })
        return
      }
      await ensureFacultyStudyMaterialsSchema(pool)
      const deleted = await deleteFacultyStudyMaterial(pool, id, facultyRow.id)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Material not found.' })
        return
      }
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/study-materials/:id')
    }
  })

  return router
}
