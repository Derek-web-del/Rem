import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  fetchFacultyRowForSession,
  requireFacultyOrTeacherSession,
} from '../lib/teacherGradesAuth.js'
import { facultyOwnsSubject } from '../lib/gradesDb.js'
import {
  createModuleSubtopic,
  createSubjectLesson,
  createSubjectModule,
  createSubjectTopic,
  deleteModuleSubtopic,
  deleteSubjectLesson,
  deleteSubjectModule,
  deleteSubjectTopic,
  fetchSubjectLesson,
  fetchSubjectModulesWithItems,
  fetchSubjectRow,
  fetchSubjectStudents,
  fetchSubjectTopicsWithItems,
  moveCurriculumItem,
  normalizeTopicIdInput,
  reorderSubjectTopics,
  resolveTopicIdForSubject,
  updateCurriculumItemStatus,
  updateModuleSubtopic,
  updateSubjectLesson,
  updateSubjectModule,
  updateSubjectTopic,
} from '../lib/subjectCurriculumDb.js'
import {
  fetchComponentsForWorkType,
  fetchSubjectGradeComponents,
  fetchSubjectGradeCriteria,
  upsertSubjectGradeCriteria,
} from '../lib/subjectGradeCriteriaDb.js'
import {
  deleteLessonFileByUrl,
  getLessonUploadFile,
  lessonUploadMiddleware,
  saveLessonFile,
  validateLessonUploadFile,
} from '../lib/lessonStorage.js'
import {
  diffRecords,
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import {
  computeGradeCriteriaDetailedDiffs,
  summarizeGradeCriteriaComponents,
} from '../lib/gradeCriteriaAudit.js'
import { buildTargetLabel } from '../lib/teacherAuditSnapshots.js'
import { blockTeacherCurriculumStructureWrite } from './adminSubjectCurriculum.js'

function parseLessonBody(body = {}) {
  return {
    title: String(body.title || '').trim(),
    description: body.description != null ? String(body.description) : '',
    topic_id: normalizeTopicIdInput(body.topic_id),
    link_url:
      body.link_url !== undefined
        ? String(body.link_url || '').trim() || null
        : undefined,
    lesson_number: body.lesson_number,
    module_order: body.module_order,
    clear_file: body.clear_file === 'true' || body.clear_file === true,
    clear_link: body.clear_link === 'true' || body.clear_link === true,
  }
}

function topicValidationMessage(code) {
  if (code === 'TOPIC_NOT_FOUND') return 'Topic not found for this subject.'
  if (code === 'INVALID_TOPIC_ID') return 'Invalid topic id.'
  return 'Invalid topic for this subject.'
}

async function resolveLessonTopicId(pool, subjectId, topicRaw) {
  const resolved = await resolveTopicIdForSubject(pool, subjectId, topicRaw)
  if (!resolved.ok) {
    return { error: topicValidationMessage(resolved.code) }
  }
  return { topicId: resolved.topicId }
}

function validateLinkUrl(url) {
  if (!url) return null
  const t = String(url).trim()
  if (!/^https?:\/\/.+/i.test(t)) return 'Link must start with http:// or https://'
  if (t.length > 512) return 'Link URL is too long.'
  return null
}

async function requireSubjectAccess(req, res, auth, subjectId) {
  const session = await requireFacultyOrTeacherSession(req, res, auth)
  if (!session) return null
  const user =
    session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
  const pool = getPgPool()
  const facultyRow = await fetchFacultyRowForSession(pool, user)
  if (!facultyRow?.id) {
    res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
    return null
  }
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid subject id.' })
    return null
  }
  if (!(await facultyOwnsSubject(pool, facultyRow.id, sid))) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
    return null
  }
  return { pool, facultyRow, subjectId: sid, user }
}

async function requireSubjectAccessDenyStructureWrite(req, res, auth, subjectId) {
  const ctx = await requireSubjectAccess(req, res, auth, subjectId)
  if (!ctx) return null
  blockTeacherCurriculumStructureWrite(req, res)
  return null
}

async function subjectLabel(pool, subjectId) {
  const row = await fetchSubjectRow(pool, subjectId)
  return String(row?.subject_name || row?.name || '').trim() || `Subject ${subjectId}`
}

async function fetchModuleRow(pool, subjectId, moduleId) {
  const { rows } = await pool.query(
    `SELECT id, title, module_order FROM subject_modules WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [Number(moduleId), Number(subjectId)],
  )
  return rows?.[0] || null
}

async function fetchTopicRow(pool, subjectId, topicId) {
  const { rows } = await pool.query(
    `SELECT id, title, topic_order FROM subject_topics WHERE id = $1 AND subject_id = $2 LIMIT 1`,
    [Number(topicId), Number(subjectId)],
  )
  return rows?.[0] || null
}

export function createTeacherSubjectCurriculumRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Curriculum APIs require PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/teacher/subjects/:id/modules', svc503)
    router.post('/teacher/subjects/:id/modules', svc503)
    router.put('/teacher/subjects/:id/modules/:moduleId', svc503)
    router.delete('/teacher/subjects/:id/modules/:moduleId', svc503)
    router.post('/teacher/subjects/:id/modules/:moduleId/subtopics', svc503)
    router.put('/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId', svc503)
    router.delete('/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId', svc503)
    router.get('/teacher/subjects/:id/topics', svc503)
    router.post('/teacher/subjects/:id/topics', svc503)
    router.put('/teacher/subjects/:id/topics/:topicId', svc503)
    router.delete('/teacher/subjects/:id/topics/:topicId', svc503)
    router.patch('/teacher/subjects/:id/topics/reorder', svc503)
    router.get('/teacher/subjects/:id/students', svc503)
    router.get('/teacher/subjects/:id/grade-criteria', svc503)
    router.get('/teacher/subjects/:id/grade-components', svc503)
    router.put('/teacher/subjects/:id/grade-criteria', svc503)
    router.patch('/teacher/assignments/:id/status', svc503)
    router.patch('/teacher/activities/:id/status', svc503)
    router.patch('/teacher/quizzes/:id/status', svc503)
    router.patch('/teacher/materials/:id/status', svc503)
    router.patch('/teacher/items/move', svc503)
    router.get('/teacher/subjects/:id/lessons/:lessonId', svc503)
    router.post('/teacher/subjects/:id/lessons', svc503)
    router.post('/teacher/subjects/:id/topics/:topicId/lessons', svc503)
    router.put('/teacher/subjects/:id/lessons/:lessonId', svc503)
    router.delete('/teacher/subjects/:id/lessons/:lessonId', svc503)
    return router
  }

  router.get('/teacher/subjects/:id/modules', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const modules = await fetchSubjectModulesWithItems(ctx.pool, ctx.subjectId)
      if (modules === null) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      res.json({ modules })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/modules')
    }
  })

  router.post('/teacher/subjects/:id/modules', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
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
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      await logTeacherAuditEvent(req, {
        event_type: 'module_created',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: row?.id,
        target_label: buildTargetLabel(row?.title, subj),
        new_values: { title: row?.title, module_order: row?.module_order },
      })
      res.status(201).json({ module: row })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/subjects/:id/modules')
    }
  })

  router.put('/teacher/subjects/:id/modules/:moduleId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const oldRow = await fetchModuleRow(ctx.pool, ctx.subjectId, req.params.moduleId)
      const row = await updateSubjectModule(ctx.pool, ctx.subjectId, req.params.moduleId, {
        title: req.body?.title,
        module_order: req.body?.module_order,
      })
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Module not found.' })
        return
      }
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      const diff = diffRecords(
        { title: oldRow?.title, module_order: oldRow?.module_order },
        { title: row?.title, module_order: row?.module_order },
      )
      await logTeacherAuditEvent(req, {
        event_type: 'module_renamed',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: row?.id,
        target_label: buildTargetLabel(row?.title, subj),
        ...diff,
      })
      res.json({ module: row })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/subjects/:id/modules/:moduleId')
    }
  })

  router.delete('/teacher/subjects/:id/modules/:moduleId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const oldRow = await fetchModuleRow(ctx.pool, ctx.subjectId, req.params.moduleId)
      const ok = await deleteSubjectModule(ctx.pool, ctx.subjectId, req.params.moduleId)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Module not found.' })
        return
      }
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      await logTeacherAuditEvent(req, {
        event_type: 'module_deleted',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: req.params.moduleId,
        target_label: buildTargetLabel(oldRow?.title, subj),
        old_values: { title: oldRow?.title, module_order: oldRow?.module_order },
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/subjects/:id/modules/:moduleId')
    }
  })

  router.post('/teacher/subjects/:id/modules/:moduleId/subtopics', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const label = String(req.body?.label || '').trim()
      if (!label) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Subtopic label is required.' })
        return
      }
      const row = await createModuleSubtopic(ctx.pool, req.params.moduleId, ctx.subjectId, {
        label,
        subtopic_order: req.body?.subtopic_order,
      })
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Module not found.' })
        return
      }
      res.status(201).json({ subtopic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/subjects/:id/modules/:moduleId/subtopics')
    }
  })

  router.put('/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const row = await updateModuleSubtopic(
        ctx.pool,
        req.params.subtopicId,
        req.params.moduleId,
        ctx.subjectId,
        { label: req.body?.label, subtopic_order: req.body?.subtopic_order },
      )
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subtopic not found.' })
        return
      }
      res.json({ subtopic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId')
    }
  })

  router.delete('/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const ok = await deleteModuleSubtopic(
        ctx.pool,
        req.params.subtopicId,
        req.params.moduleId,
        ctx.subjectId,
      )
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subtopic not found.' })
        return
      }
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/subjects/:id/modules/:moduleId/subtopics/:subtopicId')
    }
  })

  router.get('/teacher/subjects/:id/topics', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const publishedOnly = String(req.query.published_only || '').toLowerCase() === 'true'
      const topics = await fetchSubjectTopicsWithItems(ctx.pool, ctx.subjectId, { publishedOnly })
      if (topics === null) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      res.json({ topics })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/topics')
    }
  })

  const TOPIC_TITLE_MAX = 100

  function validateTopicTitle(title) {
    const t = String(title || '').trim()
    if (!t) return { ok: false, message: 'Topic title is required.' }
    if (t.length > TOPIC_TITLE_MAX) {
      return { ok: false, message: `Topic title must be ${TOPIC_TITLE_MAX} characters or fewer.` }
    }
    return { ok: true, title: t }
  }

  router.post('/teacher/subjects/:id/topics', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const validated = validateTopicTitle(req.body?.title)
      if (!validated.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: validated.message })
        return
      }
      const title = validated.title
      const row = await createSubjectTopic(ctx.pool, ctx.subjectId, {
        title,
        topic_order: req.body?.topic_order,
      })
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      await logTeacherAuditEvent(req, {
        event_type: 'topic_created',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: row?.id,
        target_label: buildTargetLabel(row?.title, subj),
        new_values: { title: row?.title, topic_order: row?.topic_order },
      })
      res.status(201).json({ topic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/subjects/:id/topics')
    }
  })

  router.put('/teacher/subjects/:id/topics/:topicId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      let title = req.body?.title
      if (title != null) {
        const validated = validateTopicTitle(title)
        if (!validated.ok) {
          res.status(400).json({ error: 'BAD_REQUEST', message: validated.message })
          return
        }
        title = validated.title
      }
      const oldRow = await fetchTopicRow(ctx.pool, ctx.subjectId, req.params.topicId)
      const row = await updateSubjectTopic(ctx.pool, ctx.subjectId, req.params.topicId, {
        title,
        topic_order: req.body?.topic_order,
      })
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      const diff = diffRecords(
        { title: oldRow?.title, topic_order: oldRow?.topic_order },
        { title: row?.title, topic_order: row?.topic_order },
      )
      await logTeacherAuditEvent(req, {
        event_type: 'topic_renamed',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: row?.id,
        target_label: buildTargetLabel(row?.title, subj),
        ...diff,
      })
      res.json({ topic: row })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/subjects/:id/topics/:topicId')
    }
  })

  router.get('/teacher/subjects/:id/lessons/:lessonId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const lesson = await fetchSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId)
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/lessons/:lessonId')
    }
  })

  router.post('/teacher/subjects/:id/lessons', lessonUploadMiddleware, async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
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
      if (lesson === null) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      res.status(201).json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/subjects/:id/lessons')
    }
  })

  router.post('/teacher/subjects/:id/topics/:topicId/lessons', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const title = String(req.body?.title || '').trim()
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Lesson title is required.' })
        return
      }
      const topicResolved = await resolveLessonTopicId(
        ctx.pool,
        ctx.subjectId,
        req.params.topicId,
      )
      if (topicResolved.error) {
        res.status(400).json({ error: 'BAD_REQUEST', message: topicResolved.error })
        return
      }
      const lesson = await createSubjectLesson(ctx.pool, ctx.subjectId, topicResolved.topicId, {
        title,
        description: req.body?.description,
        file_path: req.body?.file_path,
        link_url: req.body?.link_url,
        lesson_number: req.body?.lesson_number,
        module_order: req.body?.module_order,
      })
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      res.status(201).json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/subjects/:id/topics/:topicId/lessons')
    }
  })

  router.put('/teacher/subjects/:id/lessons/:lessonId', lessonUploadMiddleware, async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
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
        if (existing.file_path) deleteLessonFileByUrl(existing.file_path)
      } else if (fields.clear_file) {
        payload.file_path = null
        if (existing.file_path) deleteLessonFileByUrl(existing.file_path)
      }

      const lesson = await updateSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId, payload)
      if (!lesson) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ lesson })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/subjects/:id/lessons/:lessonId')
    }
  })

  router.delete('/teacher/subjects/:id/lessons/:lessonId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const ok = await deleteSubjectLesson(ctx.pool, ctx.subjectId, req.params.lessonId)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Lesson not found.' })
        return
      }
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/subjects/:id/lessons/:lessonId')
    }
  })

  router.delete('/teacher/subjects/:id/topics/:topicId', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const oldRow = await fetchTopicRow(ctx.pool, ctx.subjectId, req.params.topicId)
      const ok = await deleteSubjectTopic(ctx.pool, ctx.subjectId, req.params.topicId)
      if (!ok) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Topic not found.' })
        return
      }
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      await logTeacherAuditEvent(req, {
        event_type: 'topic_deleted',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: req.params.topicId,
        target_label: buildTargetLabel(oldRow?.title, subj),
        old_values: { title: oldRow?.title, topic_order: oldRow?.topic_order },
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/subjects/:id/topics/:topicId')
    }
  })

  router.get('/teacher/subjects/:id/students', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const students = await fetchSubjectStudents(ctx.pool, ctx.subjectId)
      res.json({ students, count: students.length })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/students')
    }
  })

  router.get('/teacher/subjects/:id/grade-criteria', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const [criteria, components] = await Promise.all([
        fetchSubjectGradeCriteria(ctx.pool, ctx.subjectId),
        fetchSubjectGradeComponents(ctx.pool, ctx.subjectId),
      ])
      res.json({ criteria, components: components?.components || [] })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/grade-criteria')
    }
  })

  router.get('/teacher/subjects/:id/grade-components', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const workType = String(req.query?.work_type || '').trim().toLowerCase()
      if (workType !== 'assignment' && workType !== 'activity' && workType !== 'quiz') {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'work_type must be assignment, activity, or quiz.',
        })
        return
      }
      const includeRaw = req.query?.include_component_id
      const includeComponentId =
        includeRaw != null && String(includeRaw).trim() !== '' ? Number(includeRaw) : null
      const components = await fetchComponentsForWorkType(ctx.pool, ctx.subjectId, workType, {
        includeComponentId: Number.isFinite(includeComponentId) && includeComponentId > 0 ? includeComponentId : null,
      })
      res.json({ components })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/subjects/:id/grade-components')
    }
  })

  router.put('/teacher/subjects/:id/grade-criteria', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.id)
      if (!ctx) return
      const [oldCriteria, oldComponents] = await Promise.all([
        fetchSubjectGradeCriteria(ctx.pool, ctx.subjectId),
        fetchSubjectGradeComponents(ctx.pool, ctx.subjectId),
      ])
      const result = await upsertSubjectGradeCriteria(ctx.pool, ctx.subjectId, req.body || {})
      if (!result.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: result.message })
        return
      }
      const [newCriteria, newComponents] = await Promise.all([
        fetchSubjectGradeCriteria(ctx.pool, ctx.subjectId),
        fetchSubjectGradeComponents(ctx.pool, ctx.subjectId),
      ])
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      const oldComponentList = oldComponents?.components || []
      const newComponentList = newComponents?.components || []
      const detailedDiffs = computeGradeCriteriaDetailedDiffs(oldComponentList, newComponentList)
      await logTeacherAuditEvent(req, {
        event_type: 'grade_criteria_saved',
        module: TEACHER_AUDIT_MODULES.GRADES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: ctx.subjectId,
        target_label: buildTargetLabel('Grade criteria', subj),
        detailedDiffs,
        old_values: summarizeGradeCriteriaComponents(oldComponentList),
        new_values: summarizeGradeCriteriaComponents(newComponentList),
        changed_fields: Object.keys(detailedDiffs),
      })
      res.json({ criteria: result.criteria })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/subjects/:id/grade-criteria')
    }
  })

  async function patchItemStatus(req, res, itemType) {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user =
        session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const status = String(req.body?.status || '').trim().toLowerCase()
      const id = Number(req.params.id)
      const tableMap = {
        assignment: 'assignments',
        activity: 'activities',
        quiz: 'quizzes',
        material: 'study_materials',
      }
      const table = tableMap[itemType]
      let oldStatus = null
      if (table && Number.isFinite(id)) {
        const { rows } = await pool.query(`SELECT status FROM ${table} WHERE id = $1 LIMIT 1`, [id])
        oldStatus = rows?.[0]?.status ?? null
      }
      const result = await updateCurriculumItemStatus(pool, itemType, req.params.id, status)
      if (!result.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: result.message })
        return
      }
      const moduleMap = {
        assignment: TEACHER_AUDIT_MODULES.ASSIGNMENTS,
        activity: TEACHER_AUDIT_MODULES.ACTIVITIES,
        quiz: TEACHER_AUDIT_MODULES.QUIZZES,
        material: TEACHER_AUDIT_MODULES.STUDY_MATERIALS,
      }
      const isPublish = result.status === 'published'
      await logTeacherAuditEvent(req, {
        event_type: `${itemType}_${isPublish ? 'published' : 'unpublished'}`,
        module: moduleMap[itemType] || itemType,
        action: isPublish ? TEACHER_AUDIT_ACTIONS.PUBLISH : TEACHER_AUDIT_ACTIONS.UNPUBLISH,
        user,
        facultyRow,
        target_id: req.params.id,
        target_label: `${itemType} #${req.params.id}`,
        old_values: { status: oldStatus },
        new_values: { status: result.status },
        changed_fields: ['status'],
      })
      res.json({ success: true, status: result.status })
    } catch (e) {
      sendSafeServerError(res, e, `PATCH /api/teacher/${itemType}s/:id/status`)
    }
  }

  router.patch('/teacher/assignments/:id/status', (req, res) => patchItemStatus(req, res, 'assignment'))
  router.patch('/teacher/activities/:id/status', (req, res) => patchItemStatus(req, res, 'activity'))
  router.patch('/teacher/quizzes/:id/status', (req, res) => patchItemStatus(req, res, 'quiz'))
  router.patch('/teacher/materials/:id/status', (req, res) => patchItemStatus(req, res, 'material'))

  router.patch('/teacher/subjects/:id/topics/reorder', async (req, res) => {
    try {
      const ctx = await requireSubjectAccessDenyStructureWrite(req, res, auth, req.params.id)
      if (!ctx) return
      const topicIds = req.body?.topic_ids
      const result = await reorderSubjectTopics(ctx.pool, ctx.subjectId, topicIds)
      if (!result.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: result.message })
        return
      }
      const subj = await subjectLabel(ctx.pool, ctx.subjectId)
      await logTeacherAuditEvent(req, {
        event_type: 'item_moved',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user: ctx.user,
        facultyRow: ctx.facultyRow,
        target_id: ctx.subjectId,
        target_label: buildTargetLabel('Topic reorder', subj),
        new_values: { topic_ids: topicIds },
        changed_fields: ['topic_order'],
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/subjects/:id/topics/reorder')
    }
  })

  router.patch('/teacher/items/move', async (req, res) => {
    try {
      const body = req.body || {}
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      if (String(body.item_type || '').toLowerCase() === 'lesson') {
        return blockTeacherCurriculumStructureWrite(req, res)
      }
      const user =
        session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const facultyRow = await fetchFacultyRowForSession(getPgPool(), user)
      const pool = getPgPool()
      const result = await moveCurriculumItem(pool, {
        item_type: body.item_type,
        item_id: body.item_id,
        module_id: body.module_id,
        topic_id: body.topic_id,
        module_order: body.module_order,
        subject_id: body.subject_id,
      })
      if (!result.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: result.message })
        return
      }
      await logTeacherAuditEvent(req, {
        event_type: 'item_moved',
        module: TEACHER_AUDIT_MODULES.SUBJECT_MODULES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user,
        facultyRow,
        target_id: body.item_id,
        target_label: `${body.item_type} #${body.item_id}`,
        new_values: {
          item_type: body.item_type,
          module_id: body.module_id,
          topic_id: body.topic_id,
          module_order: body.module_order,
        },
        changed_fields: ['module_id', 'topic_id', 'module_order'].filter(
          (f) => body[f] !== undefined,
        ),
      })
      res.json({ success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/items/move')
    }
  })

  return router
}
