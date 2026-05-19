import { randomUUID } from 'node:crypto'
import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  curriculumPdfUploadMiddleware,
  deleteCurriculumFileByUrl,
  saveCurriculumPdf,
} from '../lib/curriculumGuideStorage.js'
import {
  deleteCurriculumGuideById,
  fetchCurriculumGuideById,
  insertAdminCurriculumGuide,
  listAdminCurriculumGuides,
  setCurriculumGuidePublished,
} from '../lib/curriculumGuidesDb.js'

async function requireAdminSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, message: 'Admin auth is not available.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const role = String(session?.user?.role || session?.data?.user?.role || '')
      .trim()
      .toLowerCase()
    if (!session?.user?.id || role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Institute admin session required.',
      })
      return null
    }
    return session
  } catch (e) {
    sendSafeServerError(res, e, 'admin curriculum requireAdminSession')
    return null
  }
}

function adminDisplayName(session) {
  const u = session?.user ?? session?.data?.user ?? {}
  const name = String(u.name || '').trim()
  if (name) return name
  return String(u.email || 'Administrator').trim()
}

export function createAdminCurriculumGuidesRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Curriculum guides API requires PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/admin/curriculum-guides', svc503)
    router.post('/admin/curriculum-guides', svc503)
    router.patch('/admin/curriculum-guides/:id', svc503)
    router.delete('/admin/curriculum-guides/:id', svc503)
    return router
  }

  router.get('/admin/curriculum-guides', async (req, res) => {
    try {
      if (!(await requireAdminSession(req, res, auth))) return
      const pool = getPgPool()
      const guides = await listAdminCurriculumGuides(pool)
      res.json(guides)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/admin/curriculum-guides')
    }
  })

  router.post('/admin/curriculum-guides', curriculumPdfUploadMiddleware, async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return

      const file = req.file
      if (!file?.buffer?.length) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'PDF file is required.' })
        return
      }

      const title = String(req.body?.title || '').trim()
      const grade_level = String(req.body?.grade_level || req.body?.grade || '').trim()
      const subject = String(req.body?.subject || '').trim()
      const publishNow =
        String(req.body?.is_published || req.body?.publish || '').toLowerCase() === 'true'

      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Title is required.' })
        return
      }
      if (!grade_level) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Grade level is required.' })
        return
      }
      if (!subject) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Subject is required.' })
        return
      }

      const file_url = saveCurriculumPdf(file.buffer, file.originalname)
      const file_name = String(file.originalname || 'guide.pdf').trim() || 'guide.pdf'
      const id = randomUUID()
      const pool = getPgPool()
      const guide = await insertAdminCurriculumGuide(pool, {
        id,
        title,
        file_name,
        file_url,
        grade_level,
        subject,
        uploaded_by: String(session.user?.id || ''),
        uploaded_by_name: adminDisplayName(session),
        is_published: publishNow,
      })
      res.status(201).json(guide)
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/curriculum-guides')
    }
  })

  router.patch('/admin/curriculum-guides/:id', async (req, res) => {
    try {
      if (!(await requireAdminSession(req, res, auth))) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing guide id.' })
        return
      }
      const isPublished =
        req.body?.is_published === true ||
        String(req.body?.is_published || '').toLowerCase() === 'true'
      const pool = getPgPool()
      const ok = await setCurriculumGuidePublished(pool, id, isPublished)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }
      const guide = await fetchCurriculumGuideById(pool, id)
      res.json(guide)
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/admin/curriculum-guides/:id')
    }
  })

  router.delete('/admin/curriculum-guides/:id', async (req, res) => {
    try {
      if (!(await requireAdminSession(req, res, auth))) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing guide id.' })
        return
      }
      const pool = getPgPool()
      try {
        const removed = await deleteCurriculumGuideById(pool, id)
        if (!removed) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
          return
        }
        if (removed.file_url?.startsWith('/uploads/curriculum/')) {
          deleteCurriculumFileByUrl(removed.file_url)
        }
        res.json({ ok: true, id: removed.id })
      } catch (e) {
        if (e?.code === 'APP_STATE_SYNCED') {
          res.status(409).json({
            error: 'SYNCED_GUIDE',
            message: 'Guides synced from the institute dashboard cannot be deleted here. Remove them from Curriculum in the admin dashboard.',
          })
          return
        }
        throw e
      }
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/admin/curriculum-guides/:id')
    }
  })

  return router
}
