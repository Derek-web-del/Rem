import { randomUUID } from 'node:crypto'
import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  curriculumPdfUploadMiddleware,
  deleteCurriculumFileByUrl,
  saveCurriculumGuideFile,
  validateCurriculumGuideFile,
  validateCurriculumGuideFileAsync,
} from '../lib/curriculumGuideStorage.js'
import {
  deleteCurriculumGuideById,
  fetchCurriculumGuideById,
  insertAdminCurriculumGuide,
  listAdminCurriculumGuides,
  setCurriculumGuidePublished,
  updateAdminCurriculumGuide,
} from '../lib/curriculumGuidesDb.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import {
  curriculumAuditDescription,
  curriculumAuditDetails,
  curriculumGuideRowSnapshot,
} from '../lib/curriculumAudit.js'

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
    router.put('/admin/curriculum-guides/:id', svc503)
    router.patch('/admin/curriculum-guides/:id', svc503)
    router.delete('/admin/curriculum-guides/:id', svc503)
    return router
  }

  router.get('/admin/curriculum-guides', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
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
      const fileErr = file ? await validateCurriculumGuideFileAsync(file) : ''
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }

      const title = String(req.body?.title || req.body?.subject || '').trim()
      const grade_level = String(req.body?.grade_level || req.body?.grade || '').trim()
      const subject = String(req.body?.subject || title).trim()
      const description = String(req.body?.description || title).trim()
      const publishNow =
        String(req.body?.is_published ?? req.body?.publish ?? 'true').toLowerCase() !== 'false'

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
      if (!file) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Curriculum file is required.' })
        return
      }

      const file_url = saveCurriculumGuideFile(file.buffer, file.originalname)
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
        description,
        uploaded_by: String(session.user?.id || ''),
        uploaded_by_name: adminDisplayName(session),
        is_published: publishNow,
      })

      const snap = curriculumGuideRowSnapshot(guide)
      if (snap) {
        await auditInstituteRecord(session, 'CURRICULUM_CREATED', {
          recordType: 'curriculum',
          recordId: String(id),
          description: curriculumAuditDescription('created', snap),
          details: curriculumAuditDetails(snap, { title, is_published: publishNow }),
        })
      }

      res.status(201).json(guide)
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/curriculum-guides')
    }
  })

  router.put('/admin/curriculum-guides/:id', curriculumPdfUploadMiddleware, async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing guide id.' })
        return
      }

      const file = req.file
      if (file) {
        const fileErr = await validateCurriculumGuideFileAsync(file)
        if (fileErr) {
          res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
          return
        }
      }

      const pool = getPgPool()
      const existing = await fetchCurriculumGuideById(pool, id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }

      const title = String(req.body?.title || req.body?.subject || existing.title || '').trim()
      const grade_level = String(req.body?.grade_level || req.body?.grade || existing.grade_level || '').trim()
      const subject = String(req.body?.subject || title || existing.subject || '').trim()
      const description = String(req.body?.description || existing.description || title).trim()

      let file_url = existing.file_url
      let file_name = existing.file_name
      if (file) {
        if (existing.file_url?.startsWith('/uploads/curriculum/')) {
          deleteCurriculumFileByUrl(existing.file_url)
        }
        file_url = saveCurriculumGuideFile(file.buffer, file.originalname)
        file_name = String(file.originalname || 'guide.pdf').trim() || 'guide.pdf'
      }

      const guide = await updateAdminCurriculumGuide(pool, id, {
        title,
        subject,
        grade_level,
        description,
        file_name,
        file_url,
      })

      const snap = curriculumGuideRowSnapshot(guide)
      if (snap) {
        await auditInstituteRecord(session, 'CURRICULUM_UPDATED', {
          recordType: 'curriculum',
          recordId: id,
          description: curriculumAuditDescription('updated', snap),
          details: curriculumAuditDetails(snap),
        })
      }

      res.json(guide)
    } catch (e) {
      if (e?.code === 'APP_STATE_SYNCED') {
        res.status(409).json({
          error: 'SYNCED_GUIDE',
          message: 'Guides synced from legacy app state cannot be edited here.',
        })
        return
      }
      sendSafeServerError(res, e, 'PUT /api/admin/curriculum-guides/:id')
    }
  })

  router.patch('/admin/curriculum-guides/:id', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing guide id.' })
        return
      }
      const isPublished =
        req.body?.is_published === true ||
        String(req.body?.is_published || '').toLowerCase() === 'true'
      const pool = getPgPool()
      const oldGuide = await fetchCurriculumGuideById(pool, id)
      if (!oldGuide) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }
      const ok = await setCurriculumGuidePublished(pool, id, isPublished)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }
      const guide = await fetchCurriculumGuideById(pool, id)
      const oldPublished = Boolean(oldGuide.is_published)
      if (oldPublished !== isPublished) {
        const snap = curriculumGuideRowSnapshot(guide)
        const detailedDiffs = {
          Published: { old: oldPublished ? 'Yes' : 'No', new: isPublished ? 'Yes' : 'No' },
        }
        const updatedFields = ['Published']
        await auditInstituteRecord(session, 'CURRICULUM_UPDATED', {
          recordType: 'curriculum',
          recordId: id,
          description: curriculumAuditDescription('updated', snap),
          details: {
            ...curriculumAuditDetails(snap),
            detailedDiffs,
            updatedFields,
            changed_fields: updatedFields,
          },
        })
      }
      res.json(guide)
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/admin/curriculum-guides/:id')
    }
  })

  router.delete('/admin/curriculum-guides/:id', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
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

        const snap = curriculumGuideRowSnapshot(removed)
        if (snap) {
          await auditInstituteRecord(session, 'CURRICULUM_DELETED', {
            recordType: 'curriculum',
            recordId: id,
            description: curriculumAuditDescription('deleted', snap),
            details: {
              ...curriculumAuditDetails(snap),
              deletedSnapshot: snap,
            },
          })
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
