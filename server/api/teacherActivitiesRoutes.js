import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import {
  activityUploadMiddleware,
  deleteActivityFileByUrl,
  getActivityUploadFile,
  saveActivityFile,
  validateActivityUploadFile,
  ACTIVITY_FILE_SIZE_MSG,
} from '../lib/activityStorage.js'
import {
  ACTIVITY_SELECT,
  ensureActivitiesSchema,
  expireUnsubmittedForActivity,
  fetchActivityById,
  fetchActivityFormOptions,
  fetchSubmissionsForActivity,
  mapActivityRow,
  mapActivitySubmissionRow,
  refreshActivitySubmissionStudentNames,
  resolveSubjectIdForActivity,
  seedSubmissionsForActivityGradeLevel,
} from '../lib/activitiesDb.js'
import { isAllowedHighSchoolGradeLevel } from '../lib/gradeLevels.js'
import { parseRequiredSemester } from '../lib/semesterValidation.js'
import {
  diffRecords,
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import { activityAuditSnapshot, buildTargetLabel } from '../lib/teacherAuditSnapshots.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { deleteSubmissionFileByUrl } from '../lib/submissionStorage.js'
import { isDeadlinePassed } from '../lib/studentWorkPortal.js'
import { validateGradeComponentForWork } from '../lib/subjectGradeCriteriaDb.js'

export function mountTeacherActivitiesRoutes(router, {
  auth,
  requireFacultyOrTeacherSession,
  fetchFacultyRowForSession,
  facultyUploadedByLabel,
}) {
  function parseActivityDeadline(raw) {
    const s = String(raw ?? '').trim()
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return d
  }

  router.get('/teacher/activities/form-options', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const pool = getPgPool()
      await ensureActivitiesSchema(pool)
      const options = await fetchActivityFormOptions(pool)
      res.json({ ok: true, ...options })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/activities/form-options')
    }
  })

  router.get('/teacher/activities', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureActivitiesSchema(pool)

      const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '5'), 10) || 5))
      const q = String(req.query.q ?? req.query.search ?? '').trim()
      const sortKey = String(req.query.sort ?? req.query.sortKey ?? 'created_at').trim()
      const sortDir = String(req.query.dir ?? req.query.sortDir ?? 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

      const sortColumnMap = {
        name: 'a.title',
        subject: 'COALESCE(a.subject_name, sub.subject_name)',
        grade_level: 'COALESCE(a.grade_level, sub.grade_level)',
        semester: 'a.semester',
        upload_date: 'a.created_at',
        submission_date: 'a.submission_deadline',
        created_at: 'a.created_at',
      }
      const orderBy = sortColumnMap[sortKey] || sortColumnMap.created_at

      const params = [String(facultyRow.id)]
      let whereSql = 'WHERE a.faculty_id::text = $1::text'
      if (q) {
        params.push(`%${q.toLowerCase()}%`)
        const qi = params.length
        whereSql += ` AND (
          lower(a.title) LIKE $${qi}
          OR lower(COALESCE(a.subject_name, sub.subject_name, '')) LIKE $${qi}
          OR lower(COALESCE(a.grade_level, sub.grade_level, '')) LIKE $${qi}
          OR lower(COALESCE(a.semester::text, '')) LIKE $${qi}
        )`
      }

      const { rows: countRows } = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM activities a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        ${whereSql}
        `,
        params,
      )
      const total = Number(countRows?.[0]?.total ?? 0)
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const safePage = Math.min(page, totalPages)
      const offset = (safePage - 1) * limit

      const { rows } = await pool.query(
        `
        SELECT ${ACTIVITY_SELECT}
        FROM activities a
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        LEFT JOIN subject_grade_components sgc ON sgc.id = a.grade_component_id
        ${whereSql}
        ORDER BY ${orderBy} ${sortDir} NULLS LAST, a.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, limit, offset],
      )
      const data = (rows || []).map((r) => mapActivityRow(r))
      res.json({ ok: true, data, activities: data, total, page: safePage, limit, totalPages })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/activities')
    }
  })

  router.get('/teacher/activities/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const row = await fetchActivityById(pool, id, facultyRow.id)
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      res.json({ ok: true, activity: mapActivityRow(row) })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/activities/:id')
    }
  })

  router.get('/teacher/activities/:id/submissions', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const activityRow = await fetchActivityById(pool, id, facultyRow.id)
      if (!activityRow) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      const gradeLevel = String(activityRow.activity_grade_level ?? activityRow.grade_level ?? '').trim()
      if (!gradeLevel) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Activity grade level is not set.' })
        return
      }
      await seedSubmissionsForActivityGradeLevel(pool, id, gradeLevel)
      await refreshActivitySubmissionStudentNames(pool, id)
      const expiredCount = await expireUnsubmittedForActivity(pool, id)
      const totalScore = Number(activityRow.total_score) || 100
      const rows = await fetchSubmissionsForActivity(pool, id, gradeLevel)
      const submissions = rows
        .map((r) => mapActivitySubmissionRow(r, totalScore))
        .sort((a, b) => String(a.student_name || '').localeCompare(String(b.student_name || '')))
      res.json({
        ok: true,
        expiredUpdated: expiredCount > 0,
        activity: mapActivityRow(activityRow),
        submissions,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/teacher/activities/:id/submissions')
    }
  })

  router.post('/teacher/activities', activityUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const b = req.body || {}
      const title = String(b.title ?? '').trim()
      const description = String(b.description ?? '').trim()
      const subjectName = String(b.subject_name ?? b.subjectName ?? '').trim()
      const gradeLevel = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const totalScore = Number(b.total_score ?? b.totalScore ?? 100)
      const bodySubjectId = Number(b.subject_id)
      const parsedGradeComponentId =
        b.grade_component_id == null || String(b.grade_component_id).trim() === ''
          ? null
          : Number(b.grade_component_id)
      const deadline = parseActivityDeadline(b.submission_deadline ?? b.submissionDeadline)
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Activity title is required.' })
        return
      }
      if (!subjectName) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      if (!gradeLevel || !isAllowedHighSchoolGradeLevel(gradeLevel)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      const semester = parseRequiredSemester(b.semester)
      if (!semester) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Semester.' })
        return
      }
      if (!deadline) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Submission date is required.' })
        return
      }
      if (!Number.isFinite(totalScore) || totalScore <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Total score must be a positive number.' })
        return
      }
      const linked = await resolveSubjectIdForActivity(pool, facultyRow.id, subjectName, gradeLevel)
      const subjectId =
        Number.isFinite(bodySubjectId) && bodySubjectId > 0 ? bodySubjectId : linked?.subjectId ?? null
      const gradeComponentId =
        Number.isFinite(parsedGradeComponentId) && parsedGradeComponentId > 0
          ? parsedGradeComponentId
          : null
      if (subjectId && !gradeComponentId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Grade component is required for subject-linked work.',
        })
        return
      }
      if (subjectId && gradeComponentId) {
        const check = await validateGradeComponentForWork(pool, subjectId, gradeComponentId, 'activity')
        if (!check.ok) {
          res.status(400).json({ error: 'BAD_REQUEST', message: check.message })
          return
        }
      }
      const file = getActivityUploadFile(req)
      const fileErr = validateActivityUploadFile(file, { required: true })
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      const saved = saveActivityFile(file.buffer, file.originalname)
      const uploadedBy = facultyUploadedByLabel(facultyRow)
      const { rows } = await pool.query(
        `
        INSERT INTO activities (
          faculty_id, title, description, subject_id, subject_name, grade_level, semester,
          file_path, file_name, file_size, grade_component_id, total_score, submission_deadline,
          uploaded_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING id
        `,
        [
          facultyRow.id,
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          semester,
          saved.file_path,
          saved.file_name,
          saved.file_size,
          gradeComponentId,
          totalScore,
          deadline.toISOString(),
          uploadedBy,
        ],
      )
      const inserted = rows?.[0]
      if (!inserted) {
        res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create activity.' })
        return
      }
      await seedSubmissionsForActivityGradeLevel(pool, inserted.id, gradeLevel)
      const full = await fetchActivityById(pool, inserted.id, facultyRow.id)
      const mapped = mapActivityRow(full || inserted)
      await logTeacherAuditEvent(req, {
        event_type: 'activity_created',
        module: TEACHER_AUDIT_MODULES.ACTIVITIES,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user,
        facultyRow,
        target_id: mapped?.id,
        target_label: buildTargetLabel(mapped?.title, mapped?.subject_name),
        new_values: activityAuditSnapshot(mapped),
      })
      res.status(201).json({ ok: true, activity: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/teacher/activities')
    }
  })

  router.put('/teacher/activities/:id', activityUploadMiddleware, async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const existing = await fetchActivityById(pool, id, facultyRow.id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      if (isDeadlinePassed(existing.submission_deadline)) {
        res.status(403).json({
          error: 'ITEM_OVERDUE_LOCKED',
          message: 'This activity is past its deadline and can no longer be edited.',
        })
        return
      }
      const oldActivitySnap = activityAuditSnapshot(mapActivityRow(existing))
      const b = req.body || {}
      const title = String(b.title ?? '').trim()
      const description = String(b.description ?? '').trim()
      const subjectName = String(b.subject_name ?? b.subjectName ?? '').trim()
      const gradeLevel = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const totalScore = Number(b.total_score ?? b.totalScore ?? existing.total_score ?? 100)
      const bodySubjectId = Number(b.subject_id)
      const parsedGradeComponentId =
        b.grade_component_id == null || String(b.grade_component_id).trim() === ''
          ? null
          : Number(b.grade_component_id)
      const deadline = parseActivityDeadline(b.submission_deadline ?? b.submissionDeadline)
      if (!title) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Activity title is required.' })
        return
      }
      if (!subjectName) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Subject.' })
        return
      }
      if (!gradeLevel || !isAllowedHighSchoolGradeLevel(gradeLevel)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Grade Level.' })
        return
      }
      const semester = parseRequiredSemester(b.semester)
      if (!semester) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Semester.' })
        return
      }
      if (!deadline) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Submission date is required.' })
        return
      }
      if (!Number.isFinite(totalScore) || totalScore <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Total score must be a positive number.' })
        return
      }
      const linked = await resolveSubjectIdForActivity(pool, facultyRow.id, subjectName, gradeLevel)
      const subjectId =
        Number.isFinite(bodySubjectId) && bodySubjectId > 0
          ? bodySubjectId
          : linked?.subjectId ??
            (existing.subject_id != null && Number(existing.subject_id) > 0
              ? Number(existing.subject_id)
              : null)
      const gradeComponentId =
        Number.isFinite(parsedGradeComponentId) && parsedGradeComponentId > 0
          ? parsedGradeComponentId
          : existing.grade_component_id != null && Number(existing.grade_component_id) > 0
            ? Number(existing.grade_component_id)
            : null
      if (subjectId && !gradeComponentId) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Grade component is required for subject-linked work.',
        })
        return
      }
      if (subjectId && gradeComponentId) {
        const existingComponentId =
          existing.grade_component_id != null ? Number(existing.grade_component_id) : null
        const componentChanged = existingComponentId !== gradeComponentId
        if (componentChanged) {
          const check = await validateGradeComponentForWork(pool, subjectId, gradeComponentId, 'activity')
          if (!check.ok) {
            res.status(400).json({ error: 'BAD_REQUEST', message: check.message })
            return
          }
        }
      }
      const file = getActivityUploadFile(req)
      const fileErr = validateActivityUploadFile(file, { required: false })
      if (fileErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: fileErr })
        return
      }
      let file_path = existing.file_path
      let file_name = existing.file_name
      let file_size = existing.file_size
      if (file) {
        deleteActivityFileByUrl(existing.file_path)
        const saved = saveActivityFile(file.buffer, file.originalname)
        file_path = saved.file_path
        file_name = saved.file_name
        file_size = saved.file_size
      }
      await pool.query(
        `
        UPDATE activities
        SET title = $1, description = $2, subject_id = $3, subject_name = $4, grade_level = $5, semester = $6,
            file_path = $7, file_name = $8, file_size = $9, grade_component_id = $10,
            total_score = $11, submission_deadline = $12, updated_at = NOW()
        WHERE id = $13 AND faculty_id::text = $14::text
        `,
        [
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          semester,
          file_path,
          file_name,
          file_size,
          gradeComponentId,
          totalScore,
          deadline.toISOString(),
          id,
          String(facultyRow.id),
        ],
      )
      await seedSubmissionsForActivityGradeLevel(pool, id, gradeLevel)
      const full = await fetchActivityById(pool, id, facultyRow.id)
      const mapped = mapActivityRow(full)
      const diff = diffRecords(oldActivitySnap, activityAuditSnapshot(mapped))
      await logTeacherAuditEvent(req, {
        event_type: 'activity_updated',
        module: TEACHER_AUDIT_MODULES.ACTIVITIES,
        action: TEACHER_AUDIT_ACTIONS.EDIT,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(mapped?.title, mapped?.subject_name),
        ...diff,
      })
      res.json({ ok: true, activity: mapped })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/teacher/activities/:id')
    }
  })

  router.delete('/teacher/activities/:id', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid activity id.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const existing = await fetchActivityById(pool, id, facultyRow.id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      const { rows: subFiles } = await pool.query(
        `SELECT file_path FROM activity_submissions WHERE activity_id = $1 AND file_path IS NOT NULL`,
        [id],
      )
      for (const sf of subFiles || []) {
        if (sf?.file_path) {
          if (String(sf.file_path).startsWith('/uploads/submissions/')) {
            deleteSubmissionFileByUrl(sf.file_path)
          } else {
            deleteActivityFileByUrl(sf.file_path)
          }
        }
      }
      deleteActivityFileByUrl(existing.file_path)
      const deletedSnap = activityAuditSnapshot(mapActivityRow(existing))
      await pool.query(`DELETE FROM activities WHERE id = $1 AND faculty_id::text = $2::text`, [
        id,
        String(facultyRow.id),
      ])
      await logTeacherAuditEvent(req, {
        event_type: 'activity_deleted',
        module: TEACHER_AUDIT_MODULES.ACTIVITIES,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(existing.title, existing.subject_name),
        old_values: deletedSnap,
      })
      res.json({ ok: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/teacher/activities/:id')
    }
  })

  router.patch('/teacher/activities/:id/submissions/:submissionId/score', async (req, res) => {
    try {
      const session = await requireFacultyOrTeacherSession(req, res, auth)
      if (!session) return
      const user = session.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (!facultyRow?.id) {
        res.status(404).json({ error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      const activityId = Number(req.params.id)
      const submissionId = Number(req.params.submissionId)
      if (!Number.isFinite(activityId) || activityId <= 0 || !Number.isFinite(submissionId) || submissionId <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid id.' })
        return
      }
      await ensureActivitiesSchema(pool)
      const activityRow = await fetchActivityById(pool, activityId, facultyRow.id)
      if (!activityRow) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Activity not found.' })
        return
      }
      if (isDeadlinePassed(activityRow.submission_deadline)) {
        res.status(403).json({
          error: 'SCORE_LOCKED',
          message: 'Deadline has passed. Score is locked. Contact admin to request a grade correction.',
        })
        return
      }
      const totalScore = Number(activityRow.total_score) || 100
      const score = Number(req.body?.score ?? req.body?.value)
      const feedback = String(req.body?.feedback ?? '').trim()
      if (!Number.isFinite(score) || score < 0 || score > totalScore) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `Score must be between 0 and ${totalScore}.`,
        })
        return
      }
      const { rows: priorRows } = await pool.query(
        `SELECT score, feedback, student_id FROM activity_submissions WHERE id = $1 AND activity_id = $2 LIMIT 1`,
        [submissionId, activityId],
      )
      const prior = priorRows?.[0]
      const { rows } = await pool.query(
        `
        UPDATE activity_submissions s
        SET score = $1, feedback = $2, status = 'graded', updated_at = NOW()
        FROM activities a
        WHERE s.id = $3 AND s.activity_id = $4 AND a.id = s.activity_id
          AND a.faculty_id::text = $5::text
        RETURNING s.*
        `,
        [Math.round(score), feedback || null, submissionId, activityId, String(facultyRow.id)],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      try {
        await customActivityLogger.logActivityGraded(String(user.id), activityId, submissionId, {
          userEmail: String(user.email || '').trim(),
          userRole: 'teacher',
        })
        await logTeacherAuditEvent(req, {
          event_type: 'grade_score_saved',
          module: TEACHER_AUDIT_MODULES.GRADES,
          action: TEACHER_AUDIT_ACTIONS.GRADE,
          user,
          facultyRow,
          target_id: submissionId,
          target_label: buildTargetLabel(activityRow.title, `Student ${prior?.student_id ?? ''}`),
          old_values: {
            score: prior?.score ?? null,
            feedback: prior?.feedback ?? null,
            student_id: prior?.student_id ?? null,
            activity_id: activityId,
          },
          new_values: {
            score: Math.round(score),
            feedback: feedback || null,
            student_id: prior?.student_id ?? null,
            activity_id: activityId,
          },
          changed_fields: ['score', ...(String(prior?.feedback || '') !== String(feedback || '') ? ['feedback'] : [])],
        })
      } catch {
        /* non-fatal */
      }
      res.json({ ok: true, submission: mapActivitySubmissionRow(rows[0], totalScore) })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/activities/:id/submissions/:submissionId/score')
    }
  })
}
