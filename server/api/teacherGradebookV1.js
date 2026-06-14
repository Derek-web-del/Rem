import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  fetchFacultyRowForSession,
  requireFacultyOrTeacherSession,
} from '../lib/teacherGradesAuth.js'
import { facultyOwnsSubject } from '../lib/gradesDb.js'
import { fetchSubjectGradebook, saveSubjectGradebookScores } from '../lib/gradebookDb.js'
import {
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import { buildTargetLabel } from '../lib/teacherAuditSnapshots.js'

async function requireSubjectAccess(req, res, auth, subjectId) {
  const session = await requireFacultyOrTeacherSession(req, res, auth)
  if (!session) return null
  const user =
    session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
  const pool = getPgPool()
  const facultyRow = await fetchFacultyRowForSession(pool, user)
  if (!facultyRow?.id) {
    res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
    return null
  }
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) {
    res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
    return null
  }
  if (!(await facultyOwnsSubject(pool, facultyRow.id, sid))) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
    return null
  }
  return { pool, facultyRow, subjectId: sid, user }
}

function parseSectionId(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function createTeacherGradebookV1Router(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const svc503 = (_req, res) => {
      res.status(503).json({
        success: false,
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Gradebook APIs require PostgreSQL (DATABASE_URL).',
      })
    }
    router.get('/v1/teacher/subjects/:subjectId/gradebook', svc503)
    router.post('/v1/teacher/subjects/:subjectId/gradebook/scores', svc503)
    return router
  }

  router.get('/v1/teacher/subjects/:subjectId/gradebook', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.subjectId)
      if (!ctx) return

      const sectionId = parseSectionId(req.query.section_id ?? req.query.sectionId)
      const data = await fetchSubjectGradebook(ctx.pool, ctx.subjectId, {
        sectionId,
        facultyRow: ctx.facultyRow,
      })
      if (data.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      res.json({ success: true, gradebook: data })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/teacher/subjects/:subjectId/gradebook')
    }
  })

  router.post('/v1/teacher/subjects/:subjectId/gradebook/scores', async (req, res) => {
    try {
      const ctx = await requireSubjectAccess(req, res, auth, req.params.subjectId)
      if (!ctx) return

      const sectionId = parseSectionId(req.body?.section_id ?? req.body?.sectionId)
      const scores = Array.isArray(req.body?.scores) ? req.body.scores : []
      const updatedBy = String(ctx.user?.email || ctx.user?.id || '').trim() || null

      const before = await fetchSubjectGradebook(ctx.pool, ctx.subjectId, {
        sectionId,
        facultyRow: ctx.facultyRow,
      })
      const result = await saveSubjectGradebookScores(ctx.pool, ctx.subjectId, {
        scores,
        sectionId,
        updatedBy,
      })
      if (result.error === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const subjName = before?.subject?.subject_name || `Subject ${ctx.subjectId}`
      for (const entry of scores) {
        const studentId = String(entry.student_id || '')
        const entityType = String(entry.entity_type || '').toLowerCase()
        const entityId = String(entry.entity_id || '')
        const key = `${entityType}:${entityId}`
        const oldScore = before?.scores?.[studentId]?.[key]?.score ?? null
        const newScore = entry.score != null ? Number(entry.score) : null
        if (oldScore === newScore) continue
        await logTeacherAuditEvent(req, {
          event_type: 'grade_score_saved',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: TEACHER_AUDIT_ACTIONS.GRADE,
          user: ctx.user,
          facultyRow: ctx.facultyRow,
          target_id: `${studentId}:${key}`,
          target_label: buildTargetLabel(subjName, `${entityType} ${entityId} / student ${studentId}`),
          old_values: { score: oldScore, student_id: studentId, entity_type: entityType, entity_id: entityId },
          new_values: { score: newScore, student_id: studentId, entity_type: entityType, entity_id: entityId },
          changed_fields: ['score'],
        })
      }
      res.json({ success: true, ...result })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/teacher/subjects/:subjectId/gradebook/scores')
    }
  })

  return router
}
