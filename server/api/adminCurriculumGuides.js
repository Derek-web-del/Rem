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
import {
  createUnit,
  deleteUnit,
  listUnitsForGuide,
  listUnitsForGuides,
  readGradingWeights,
  reorderUnits,
  updateUnit,
} from '../lib/curriculumGuideUnitsDb.js'
import { requireAdminSession, auditInstituteRecord, purgeCurriculumFromAppStateJson } from './state/shared.js'
import {
  curriculumAuditDescription,
  curriculumAuditDetails,
  curriculumGuideRowSnapshot,
} from '../lib/curriculumAudit.js'
import { syncCurriculumGuideLessonForAllSubjects } from '../lib/syncCurriculumGuideLesson.js'

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
    router.post('/admin/curriculum-guides/:id/units', svc503)
    router.put('/admin/curriculum-guides/:id/units/:unitId', svc503)
    router.delete('/admin/curriculum-guides/:id/units/:unitId', svc503)
    router.patch('/admin/curriculum-guides/:id/units/reorder', svc503)
    return router
  }

  router.get('/admin/curriculum-guides', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const pool = getPgPool()
      const guides = await listAdminCurriculumGuides(pool)
      const unitsByGuide = await listUnitsForGuides(pool, guides.map((g) => g.id))
      const withUnits = guides.map((g) => ({ ...g, units: unitsByGuide[g.id] || [] }))
      res.json(withUnits)
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

      let file_url = null
      let file_name = null
      if (file) {
        file_url = await saveCurriculumGuideFile(file.buffer, file.originalname)
        file_name = String(file.originalname || 'guide.pdf').trim() || 'guide.pdf'
      }

      const weights = readGradingWeights(req.body)
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
        written_work_pct: weights.written_work_pct,
        performance_task_pct: weights.performance_task_pct,
        exam_pct: weights.exam_pct,
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

      if (publishNow) {
        await syncCurriculumGuideLessonForAllSubjects(pool, id)
      }

      let units = []
      const rawUnits = req.body?.units
      if (rawUnits) {
        let draftUnits = []
        try {
          draftUnits = JSON.parse(rawUnits)
        } catch {
          draftUnits = []
        }
        if (Array.isArray(draftUnits)) {
          let order = 0
          for (const u of draftUnits) {
            const unitTitle = String(u?.title || '').trim()
            if (!unitTitle) continue
            await createUnit(pool, id, { title: unitTitle, description: u?.description, unit_order: order })
            order += 1
          }
          units = await listUnitsForGuide(pool, id)
        }
      }

      res.status(201).json({ ...guide, units })
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
          await deleteCurriculumFileByUrl(existing.file_url)
        }
        file_url = await saveCurriculumGuideFile(file.buffer, file.originalname)
        file_name = String(file.originalname || 'guide.pdf').trim() || 'guide.pdf'
      }

      const weights = readGradingWeights(req.body)
      const guide = await updateAdminCurriculumGuide(pool, id, {
        title,
        subject,
        grade_level,
        description,
        file_name,
        file_url,
        written_work_pct: weights.written_work_pct,
        performance_task_pct: weights.performance_task_pct,
        exam_pct: weights.exam_pct,
        uploaded_by_name: adminDisplayName(session),
      })

      /** Editing a legacy app_state-mirrored guide claims it permanently — purge the mirror so it can't reappear or overwrite this edit later. */
      if (existing.source === 'app_state') {
        await purgeCurriculumFromAppStateJson(pool, id)
      }

      const snap = curriculumGuideRowSnapshot(guide)
      if (snap) {
        await auditInstituteRecord(session, 'CURRICULUM_UPDATED', {
          recordType: 'curriculum',
          recordId: id,
          description: curriculumAuditDescription('updated', snap),
          details: curriculumAuditDetails(snap),
        })
      }

      if (guide?.is_published === true) {
        await syncCurriculumGuideLessonForAllSubjects(pool, id)
      }

      const units = await listUnitsForGuide(pool, id)
      res.json({ ...guide, units })
    } catch (e) {
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
      await syncCurriculumGuideLessonForAllSubjects(pool, id)
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
      const removed = await deleteCurriculumGuideById(pool, id)
      if (!removed) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }
      if (removed.file_url?.startsWith('/uploads/curriculum/')) {
        await deleteCurriculumFileByUrl(removed.file_url)
      }
      /** Legacy app_state-mirrored guides must be purged from the JSON mirror too, or a future state sync would resurrect them. */
      if (removed.source === 'app_state') {
        await purgeCurriculumFromAppStateJson(pool, id)
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
      sendSafeServerError(res, e, 'DELETE /api/admin/curriculum-guides/:id')
    }
  })

  async function auditUnitChange(session, guideId, note) {
    const pool = getPgPool()
    const guide = await fetchCurriculumGuideById(pool, guideId)
    const snap = curriculumGuideRowSnapshot(guide)
    if (!snap) return
    await auditInstituteRecord(session, 'CURRICULUM_UPDATED', {
      recordType: 'curriculum',
      recordId: String(guideId),
      description: curriculumAuditDescription('updated', snap),
      details: curriculumAuditDetails(snap, { note }),
    })
  }

  router.post('/admin/curriculum-guides/:id/units', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      const title = String(req.body?.title || '').trim()
      if (!id || !title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Unit title is required.' })
        return
      }
      const pool = getPgPool()
      const existing = await listUnitsForGuide(pool, id)
      const unit = await createUnit(pool, id, {
        title,
        description: req.body?.description,
        unit_order: req.body?.unit_order ?? existing.length,
      })
      if (!unit) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum guide not found.' })
        return
      }
      await auditUnitChange(session, id, `Added unit: ${title}`)
      res.status(201).json(unit)
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/curriculum-guides/:id/units')
    }
  })

  router.put('/admin/curriculum-guides/:id/units/:unitId', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      const unitId = req.params.unitId
      const pool = getPgPool()
      const unit = await updateUnit(pool, unitId, id, {
        title: req.body?.title,
        description: req.body?.description,
        unit_order: req.body?.unit_order,
      })
      if (!unit) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unit not found.' })
        return
      }
      await auditUnitChange(session, id, `Edited unit: ${unit.title}`)
      res.json(unit)
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/admin/curriculum-guides/:id/units/:unitId')
    }
  })

  router.delete('/admin/curriculum-guides/:id/units/:unitId', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      const unitId = req.params.unitId
      const pool = getPgPool()
      const ok = await deleteUnit(pool, unitId, id)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Unit not found.' })
        return
      }
      await auditUnitChange(session, id, 'Removed a unit')
      res.json({ ok: true, id: Number(unitId) })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/admin/curriculum-guides/:id/units/:unitId')
    }
  })

  router.patch('/admin/curriculum-guides/:id/units/reorder', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return
      const id = String(req.params.id || '').trim()
      const orderedIds = Array.isArray(req.body?.unit_ids) ? req.body.unit_ids : []
      const pool = getPgPool()
      const units = await reorderUnits(pool, id, orderedIds)
      res.json(units)
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/admin/curriculum-guides/:id/units/reorder')
    }
  })

  return router
}
