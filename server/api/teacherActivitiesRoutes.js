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
  resolveSubjectIdForActivity,
  seedSubmissionsForActivityGradeLevel,
} from '../lib/activitiesDb.js'
import { isAllowedHighSchoolGradeLevel } from '../lib/gradeLevels.js'
import { parseRequiredQuarter } from '../lib/quarterValidation.js'

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
        quarter: 'a.quarter',
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
          OR lower(COALESCE(a.quarter::text, '')) LIKE $${qi}
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
      const expiredCount = await expireUnsubmittedForActivity(pool, id)
      const totalScore = Number(activityRow.total_score) || 100
      const rows = await fetchSubmissionsForActivity(pool, id, gradeLevel)
      res.json({
        ok: true,
        expiredUpdated: expiredCount > 0,
        activity: mapActivityRow(activityRow),
        submissions: rows.map((r) => mapActivitySubmissionRow(r, totalScore)),
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
      const quarter = parseRequiredQuarter(b.quarter)
      if (!quarter) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Quarter.' })
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
      const subjectId = linked?.subjectId ?? null
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
          faculty_id, title, description, subject_id, subject_name, grade_level, quarter,
          file_path, file_name, file_size, total_score, submission_deadline,
          uploaded_by, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        RETURNING id
        `,
        [
          facultyRow.id,
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          quarter,
          saved.file_path,
          saved.file_name,
          saved.file_size,
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
      res.status(201).json({ ok: true, activity: mapActivityRow(full || inserted) })
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
      const b = req.body || {}
      const title = String(b.title ?? '').trim()
      const description = String(b.description ?? '').trim()
      const subjectName = String(b.subject_name ?? b.subjectName ?? '').trim()
      const gradeLevel = String(b.grade_level ?? b.gradeLevel ?? '').trim()
      const totalScore = Number(b.total_score ?? b.totalScore ?? existing.total_score ?? 100)
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
      const quarter = parseRequiredQuarter(b.quarter)
      if (!quarter) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Please select a Quarter.' })
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
      const subjectId = linked?.subjectId ?? null
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
        SET title = $1, description = $2, subject_id = $3, subject_name = $4, grade_level = $5, quarter = $6,
            file_path = $7, file_name = $8, file_size = $9,
            total_score = $10, submission_deadline = $11, updated_at = NOW()
        WHERE id = $12 AND faculty_id::text = $13::text
        `,
        [
          title,
          description || null,
          subjectId,
          subjectName,
          gradeLevel,
          quarter,
          file_path,
          file_name,
          file_size,
          totalScore,
          deadline.toISOString(),
          id,
          String(facultyRow.id),
        ],
      )
      await seedSubmissionsForActivityGradeLevel(pool, id, gradeLevel)
      const full = await fetchActivityById(pool, id, facultyRow.id)
      res.json({ ok: true, activity: mapActivityRow(full) })
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
        if (sf?.file_path) deleteActivityFileByUrl(sf.file_path)
      }
      deleteActivityFileByUrl(existing.file_path)
      await pool.query(`DELETE FROM activities WHERE id = $1 AND faculty_id::text = $2::text`, [
        id,
        String(facultyRow.id),
      ])
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
      const totalScore = Number(activityRow.total_score) || 100
      const score = Number(req.body?.score ?? req.body?.value)
      if (!Number.isFinite(score) || score < 0 || score > totalScore) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `Score must be between 0 and ${totalScore}.`,
        })
        return
      }
      const { rows } = await pool.query(
        `
        UPDATE activity_submissions s
        SET score = $1, status = 'submitted', updated_at = NOW()
        FROM activities a
        WHERE s.id = $2 AND s.activity_id = $3 AND a.id = s.activity_id
          AND a.faculty_id::text = $4::text
        RETURNING s.*
        `,
        [Math.round(score), submissionId, activityId, String(facultyRow.id)],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Submission not found.' })
        return
      }
      res.json({ ok: true, submission: mapActivitySubmissionRow(rows[0], totalScore) })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/teacher/activities/:id/submissions/:submissionId/score')
    }
  })
}
