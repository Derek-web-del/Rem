import {
  requireAdminSession,
  logStatePostgresError,
  auditInstituteRecord,
  subjectPgError,
  subjectRowToResponse,
  readSubjectBodyFields,
  readSubjectSyllabus,
  normalizeSubjectSemester,
  buildArchivedSubjectCode,
} from './shared.js'
import { requireAnyRoleSession } from '../../lib/security.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { resolveSubjectImagePath } from '../../lib/subjectImageStorage.js'
import { sendSubjectSyllabusResponse, syllabusDisplayFileName } from '../../lib/syllabusResponse.js'
import { extendUpdateSetWithIntegrity, stampRowLastModified } from '../../lib/recordIntegrity.js'
import {
  subjectPgRowSnapshot,
  computeSubjectDetailedDiffs,
  subjectAuditDescription,
  subjectAuditDetails,
} from '../../lib/subjectAudit.js'
import {
  listSchedulesForSubject,
  replaceSubjectWeekdaySchedules,
  formatSchedulesSummary,
  ensureSubjectSchedulesSchema,
} from '../../lib/subjectSchedulesDb.js'

const SUBJECT_SELECT_WITH_FACULTY = `
  SELECT
    s.id,
    s.subject_code,
    s.subject_name,
    s.grade_level,
    s.semester,
    s.faculty_id,
    s.syllabus_pdf,
    s.subject_photo,
    s.curriculum_guide_id,
    s.created_at,
    cg.subject AS curriculum_guide_title,
    cg.grade AS curriculum_guide_grade,
    COALESCE(
      NULLIF(trim(concat_ws(' ',
        nullif(trim(f.first_name), ''),
        nullif(trim(f.middle_name), ''),
        nullif(trim(f.last_name), '')
      )), ''),
      NULLIF(trim(f.name), '')
    ) AS faculty_name
  FROM subjects s
  LEFT JOIN faculties f ON f.id::text = s.faculty_id::text
  LEFT JOIN curriculum_guides cg ON cg.id::text = s.curriculum_guide_id::text
`

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerSubjectsRoutes(router, ctx) {
  const { pool, auth } = ctx

  async function attachSchedules(rows) {
    const out = []
    for (const row of rows || []) {
      const schedules = await listSchedulesForSubject(pool, row.id)
      out.push(
        subjectRowToResponse({
          ...row,
          schedules,
          schedule: schedules[0] || null,
          schedule_label: formatSchedulesSummary(schedules),
        }),
      )
    }
    return out
  }

  router.get('/v1/subjects', async (req, res) => {
    try {
      if (!(await requireAnyRoleSession(req, res, auth, ['admin', 'faculty', 'student']))) return
      const grade_level = String(req.query.grade_level || req.query.grade || '').trim()
      const semester = String(req.query.semester ?? '').trim()
      const clauses = ['s.archived_at IS NULL']
      const params = []
      if (grade_level) {
        params.push(grade_level)
        clauses.push(`s.grade_level = $${params.length}`)
      }
      if (semester) {
        params.push(normalizeSubjectSemester(semester))
        clauses.push(`s.semester = $${params.length}`)
      }
      let sql = `
        ${SUBJECT_SELECT_WITH_FACULTY}
      `
      if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
      sql += ' ORDER BY s.id DESC'
      const { rows } = await pool.query(sql, params)
      res.json({ ok: true, subjects: await attachSchedules(rows) })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.post('/v1/subjects', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const b = req.body || {}
      const { subject_code, subject_name, grade_level, semester, faculty_id, curriculum_guide_id, syllabus_pdf, schedule_spec, has_schedule_fields } =
        readSubjectBodyFields(b)

      if (!subject_code || !subject_name || !grade_level || !semester) {
        res.status(400).json({
          error: 'Required: subjectCode, subjectName, grade (or gradeLevel), and semester.',
        })
        return
      }

      const facultyIdParam = faculty_id || null
      const guideIdParam = curriculum_guide_id ? String(curriculum_guide_id).trim() : null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const { rows } = await pool.query(
        `
          INSERT INTO subjects (
            subject_code, subject_name, grade_level, semester, faculty_id, curriculum_guide_id, syllabus_pdf, subject_photo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, subject_code, subject_name, grade_level, semester,
            faculty_id, curriculum_guide_id, syllabus_pdf, subject_photo, created_at
        `,
        [subject_code, subject_name, grade_level, semester, facultyIdParam, guideIdParam, syllabus_pdf, subject_photo],
      )
      const row = rows?.[0]
      if (row?.id && has_schedule_fields) {
        await ensureSubjectSchedulesSchema(pool)
        await replaceSubjectWeekdaySchedules(pool, row.id, schedule_spec || {})
      }
      const createdSnap = subjectPgRowSnapshot(row, row?.faculty_name)
      await auditInstituteRecord(adminSession, 'SUBJECT_CREATED', {
        recordType: 'subject',
        recordId: String(row?.id ?? ''),
        description: subjectAuditDescription('created', createdSnap),
        details: subjectAuditDetails(createdSnap),
      })
      res.status(201).json({
        ok: true,
        subject: (await attachSchedules([row]))[0],
        id: row?.id != null ? Number(row.id) : null,
      })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.put('/v1/subjects/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid subject id.' })
        return
      }
      const b = req.body || {}
      const { subject_code, subject_name, grade_level, semester, faculty_id, curriculum_guide_id, syllabus_pdf, schedule_spec, has_schedule_fields } =
        readSubjectBodyFields(b)
      const hasSyllabusField = ['syllabusDataUrl', 'syllabus_data_url', 'syllabus_pdf', 'syllabusPdf'].some((key) =>
        Object.prototype.hasOwnProperty.call(b, key),
      )

      if (!subject_code || !subject_name || !grade_level || !semester) {
        res.status(400).json({
          error: 'Required: subjectCode, subjectName, grade (or gradeLevel), and semester.',
        })
        return
      }

      const { rows: existingRows } = await pool.query(
        `${SUBJECT_SELECT_WITH_FACULTY} WHERE s.id = $1 LIMIT 1`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }

      const facultyIdParam = faculty_id || null
      const guideIdParam = curriculum_guide_id ? String(curriculum_guide_id).trim() : null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const syllabusToSave = hasSyllabusField ? syllabus_pdf : existing.syllabus_pdf
      const { rows } = await pool.query(
        `
          UPDATE subjects
          SET subject_code = $1, subject_name = $2, grade_level = $3, semester = $4,
            faculty_id = $5, curriculum_guide_id = $6, syllabus_pdf = $7, subject_photo = $8
          WHERE id = $9
          RETURNING id, subject_code, subject_name, grade_level, semester,
            faculty_id, curriculum_guide_id, syllabus_pdf, subject_photo, created_at,
            (SELECT COALESCE(
              NULLIF(trim(concat_ws(' ',
                nullif(trim(f.first_name), ''),
                nullif(trim(f.middle_name), ''),
                nullif(trim(f.last_name), '')
              )), ''),
              NULLIF(trim(f.name), '')
            ) FROM faculties f WHERE f.id::text = subjects.faculty_id::text LIMIT 1) AS faculty_name,
            (SELECT cg.subject FROM curriculum_guides cg WHERE cg.id::text = subjects.curriculum_guide_id::text LIMIT 1) AS curriculum_guide_title,
            (SELECT cg.grade FROM curriculum_guides cg WHERE cg.id::text = subjects.curriculum_guide_id::text LIMIT 1) AS curriculum_guide_grade
        `,
        [subject_code, subject_name, grade_level, semester, facultyIdParam, guideIdParam, syllabusToSave, subject_photo, id],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      const updatedRow = rows[0]
      if (has_schedule_fields) {
        await ensureSubjectSchedulesSchema(pool)
        await replaceSubjectWeekdaySchedules(pool, id, schedule_spec || {})
      }
      const detailedDiffs = computeSubjectDetailedDiffs(existing, updatedRow, {
        oldFacultyName: existing.faculty_name,
        newFacultyName: updatedRow.faculty_name,
      })
      const updatedFields = Object.keys(detailedDiffs)
      if (updatedFields.length) {
        const newSnap = subjectPgRowSnapshot(updatedRow, updatedRow.faculty_name)
        await auditInstituteRecord(adminSession, 'SUBJECT_UPDATED', {
          recordType: 'subject',
          recordId: String(id),
          description: subjectAuditDescription('updated', newSnap),
          details: {
            ...subjectAuditDetails(newSnap),
            detailedDiffs,
            updatedFields,
            changed_fields: updatedFields,
          },
        })
      }
      res.json({ ok: true, subject: (await attachSchedules([updatedRow]))[0] })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.delete('/v1/subjects/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid subject id.' })
        return
      }
      const { rows: existingRows } = await pool.query(
        `${SUBJECT_SELECT_WITH_FACULTY} WHERE s.id = $1 LIMIT 1`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      console.log(`Archiving ID ${id} in subjects (PostgreSQL)`)
      const archivedCode = buildArchivedSubjectCode(existing.subject_code, id)
      const r = await pool.query(
        'UPDATE subjects SET archived_at = NOW(), subject_code = $2 WHERE id = $1 AND archived_at IS NULL',
        [id, archivedCode],
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      const deletedSnap = subjectPgRowSnapshot(existing, existing.faculty_name)
      await auditInstituteRecord(adminSession, 'SUBJECT_DELETED', {
        recordType: 'subject',
        recordId: String(id),
        description: subjectAuditDescription('deleted', deletedSnap),
        details: {
          ...subjectAuditDetails(deletedSnap),
          deletedSnapshot: deletedSnap,
        },
      })
      res.json({ ok: true, id })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.get('/v1/subjects/:id/syllabus-file', async (req, res) => {
    try {
      if (!(await requireAdminSession(req, res, auth))) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid subject id.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT syllabus_pdf, subject_code FROM subjects WHERE id = $1 AND archived_at IS NULL LIMIT 1`,
        [id],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const syllabusRaw = String(rows[0]?.syllabus_pdf ?? '').trim()
      const fileName = syllabusDisplayFileName(syllabusRaw, rows[0]?.subject_code)
      sendSubjectSyllabusResponse(res, syllabusRaw, fileName)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/subjects/:id/syllabus-file')
    }
  })

}
