import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import {
  createSubjectLesson,
  createSubjectModule,
  createSubjectTopic,
  deleteSubjectLesson,
  deleteSubjectTopic,
  fetchSubjectLesson,
  fetchSubjectModulesWithItems,
  fetchSubjectRow,
  fetchSubjectTopicsWithItems,
  normalizeTopicIdInput,
  resolveTopicIdForSubject,
  updateSubjectLesson,
  updateSubjectTopic,
} from '../lib/subjectCurriculumDb.js'
import {
  deleteLessonFileByUrl,
  getLessonUploadFile,
  lessonUploadMiddleware,
  saveLessonFile,
  validateLessonUploadFile,
} from '../lib/lessonStorage.js'

function parseLessonBody(body = {}) {
  return {
    title: String(body.title || '').trim(),
    description: body.description != null ? String(body.description) : '',
    topic_id: normalizeTopicIdInput(body.topic_id),
    link_url:
      body.link_url !== undefined ? String(body.link_url || '').trim() || null : undefined,
    lesson_number: body.lesson_number,
    module_order: body.module_order,
    clear_file: body.clear_file === 'true' || body.clear_file === true,
    clear_link: body.clear_link === 'true' || body.clear_link === true,
  }
}

function validateLinkUrl(url) {
  if (!url) return null
  const t = String(url).trim()
  if (!/^https?:\/\/.+/i.test(t)) return 'Link must start with http:// or https://'
  if (t.length > 512) return 'Link URL is too long.'
  return null
}

async function resolveLessonTopicId(pool, subjectId, topicRaw) {
  const resolved = await resolveTopicIdForSubject(pool, subjectId, topicRaw)
  if (!resolved.ok) {
    const code = resolved.code
    if (code === 'TOPIC_NOT_FOUND') return { error: 'Topic not found for this subject.' }
    if (code === 'INVALID_TOPIC_ID') return { error: 'Invalid topic id.' }
    return { error: 'Invalid topic for this subject.' }
  }
  return { topicId: resolved.topicId }
}

async function requireAdminSubjectAccess(req, res, auth, subjectId) {
  const session = await requireAdminSession(req, res, auth)
  if (!session) return null
  const pool = getPgPool()
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
    return null
  }
  const row = await fetchSubjectRow(pool, sid)
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
    return null
  }
  return { pool, subjectId: sid, session, subject: row }
}

export function blockTeacherCurriculumStructureWrite(_req, res) {
  return res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Modules and lessons are managed by the institute admin.',
  })
}

export function createAdminSubjectCurriculumRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Subject curriculum API requires PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/admin/subjects/:id/topics', svc503)
    router.post('/admin/subjects/:id/topics', svc503)
    router.put('/admin/subjects/:id/topics/:topicId', svc503)
    router.delete('/admin/subjects/:id/topics/:topicId', svc503)
    router.get('/admin/subjects/:id/modules', svc503)
    router.post('/admin/subjects/:id/modules', svc503)
    router.get('/admin/subjects/:id/lessons/:lessonId', svc503)
    router.post('/admin/subjects/:id/lessons', svc503)
    router.put('/admin/subjects/:id/lessons/:lessonId', svc503)
    router.delete('/admin/subjects/:id/lessons/:lessonId', svc503)
    return router
  }

  router.get('/admin/subjects/:id/topics', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const topics = await fetchSubjectTopicsWithItems(ctx.pool, ctx.subjectId)
      res.json({ topics: topics || [] })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/admin/subjects/:id/topics')
    }
  })

  router.post('/admin/subjects/:id/topics', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const title = String(req.body?.title || '').trim()
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Topic title is required.' })
        return
      }
      const row = await createSubjectTopic(ctx.pool, ctx.subjectId, {
        title,
        topic_order: req.body?.topic_order,
      })
      await auditInstituteRecord(ctx.session, 'SUBJECT_TOPIC_CREATED', {
        recordType: 'subject_topic',
        recordId: String(row?.id ?? ''),
        description: `Topic "${title}" created for subject ${ctx.subject.subject_name || ctx.subjectId}.`,
      })
      res.status(201).json({ topic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/subjects/:id/topics')
    }
  })

  router.put('/admin/subjects/:id/topics/:topicId', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const row = await updateSubjectTopic(ctx.pool, ctx.subjectId, req.params.topicId, {
        title: req.body?.title,
        topic_order: req.body?.topic_order,
      })
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      res.json({ topic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/admin/subjects/:id/topics/:topicId')
    }
  })

  router.delete('/admin/subjects/:id/topics/:topicId', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const ok = await deleteSubjectTopic(ctx.pool, ctx.subjectId, req.params.topicId)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/admin/subjects/:id/topics/:topicId')
    }
  })

  router.get('/admin/subjects/:id/modules', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const modules = await fetchSubjectModulesWithItems(ctx.pool, ctx.subjectId)
      res.json({ modules: modules || [] })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/admin/subjects/:id/modules')
    }
  })

  router.post('/admin/subjects/:id/modules', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const title = String(req.body?.title || '').trim()
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Module title is required.' })
        return
      }
      const row = await createSubjectModule(ctx.pool, ctx.subjectId, {
        title,
        module_order: req.body?.module_order,
      })
      res.status(201).json({ module: row })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/subjects/:id/modules')
    }
  })

  router.get('/admin/subjects/:id/lessons/:lessonId', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const lesson = await fetchSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId)
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/admin/subjects/:id/lessons/:lessonId')
    }
  })

  router.post('/admin/subjects/:id/lessons', lessonUploadMiddleware, async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const fields = parseLessonBody(req.body)
      if (!fields.title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Lesson title is required.' })
        return
      }
      if (fields.link_url) {
        const linkErr = validateLinkUrl(fields.link_url)
        if (linkErr) {
          res.status(400).json({ error: 'BAD_REQUEST', message: linkErr })
          return
        }
      }
      const file = getLessonUploadFile(req)
      const fileErr = validateLessonUploadFile(file)
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      let file_path = null
      if (file) {
        const saved = await saveLessonFile(file.buffer, file.originalname)
        file_path = saved.file_path
      }
      const topicResolved = await resolveLessonTopicId(ctx.pool, ctx.subjectId, fields.topic_id)
      if (topicResolved.error) {
        res.status(400).json({ error: 'BAD_REQUEST', message: topicResolved.error })
        return
      }
      const lesson = await createSubjectLesson(ctx.pool, ctx.subjectId, topicResolved.topicId, {
        title: fields.title,
        description: fields.description,
        file_path,
        link_url: fields.link_url ?? null,
        lesson_number: fields.lesson_number,
        module_order: fields.module_order,
      })
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      res.status(201).json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/admin/subjects/:id/lessons')
    }
  })

  router.put('/admin/subjects/:id/lessons/:lessonId', lessonUploadMiddleware, async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const existing = await fetchSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      const fields = parseLessonBody(req.body)
      if (req.body?.title !== undefined && !fields.title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Lesson title is required.' })
        return
      }
      const linkVal = fields.link_url !== undefined ? fields.link_url : undefined
      if (linkVal) {
        const linkErr = validateLinkUrl(linkVal)
        if (linkErr) {
          res.status(400).json({ error: 'BAD_REQUEST', message: linkErr })
          return
        }
      }
      const file = getLessonUploadFile(req)
      const fileErr = validateLessonUploadFile(file)
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      const payload = {}
      if (req.body?.title !== undefined) payload.title = fields.title
      if (req.body?.description !== undefined) payload.description = fields.description
      if (req.body?.topic_id !== undefined) {
        const topicResolved = await resolveLessonTopicId(ctx.pool, ctx.subjectId, fields.topic_id)
        if (topicResolved.error) {
          res.status(400).json({ error: 'BAD_REQUEST', message: topicResolved.error })
          return
        }
        payload.topic_id = topicResolved.topicId
      }
      if (fields.link_url !== undefined) payload.link_url = fields.link_url
      if (fields.clear_link) payload.link_url = null
      if (fields.lesson_number != null) payload.lesson_number = fields.lesson_number
      if (fields.module_order != null) payload.module_order = fields.module_order
      if (file) {
        const saved = await saveLessonFile(file.buffer, file.originalname)
        payload.file_path = saved.file_path
        if (existing.file_path) await deleteLessonFileByUrl(existing.file_path)
      } else if (fields.clear_file) {
        payload.file_path = null
        if (existing.file_path) await deleteLessonFileByUrl(existing.file_path)
      }
      const lesson = await updateSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId, payload)
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/admin/subjects/:id/lessons/:lessonId')
    }
  })

  router.delete('/admin/subjects/:id/lessons/:lessonId', async (req, res) => {
    try {
      const ctx = await requireAdminSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const ok = await deleteSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/admin/subjects/:id/lessons/:lessonId')
    }
  })

  return router
}
