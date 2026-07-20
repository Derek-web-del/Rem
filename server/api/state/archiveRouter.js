import { requireRegistrarSession, logStatePostgresError, parseArchiveEntityType, obfuscateArchivedStudentForVault, obfuscateArchivedFacultyForVault, getFacultiesColumnSet, FACULTIES_FROM, purgeFacultyFromAppStateJson, auditInstituteRecord, omitStudentPassword, facultyRowToResponse } from './shared.js'
import { sendSafeServerError } from '../../lib/safeApiError.js'
import { requireDestructiveConfirm } from '../../lib/security.js'
import { resolveArchiveTableSql } from '../../lib/sqlGuards.js'
import { fetchArchivedStudentWork, fetchArchivedFacultyWork } from '../../lib/archivedWorkDb.js'
import { studentDisplayName } from '../../lib/studentPiiCrypto.js'
import { verifyAdminPassword } from '../../lib/verifySessionPassword.js'

async function fetchArchivedStudentSnapshot(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, first_name, middle_name, last_name, archived_at
     FROM public.students WHERE id = $1 AND archived_at IS NOT NULL LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

async function fetchArchivedFacultySnapshot(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, name, first_name, middle_name, last_name, archived_at ${FACULTIES_FROM}
     WHERE id = $1 AND archived_at IS NOT NULL LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

function facultyDisplayName(row) {
  return String(row?.name || '').trim() || studentDisplayName(row) || `Faculty #${row?.id || ''}`
}

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerArchiveRoutes(router, ctx) {
  const { pool, auth } = ctx
  router.get('/v1/admin/archive-vault/:type', async (req, res) => {
    if (!(await requireRegistrarSession(req, res, auth))) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid archive vault type.' })
      return
    }
    try {
      if (type === 'students') {
        const { rows } = await pool.query(`
          SELECT s.id, s.first_name, s.middle_name, s.last_name, s.archived_at, s.archive_reason
          FROM students s
          WHERE s.archived_at IS NOT NULL
          ORDER BY s.archived_at DESC, s.id DESC
        `)
        const records = rows.map((r) => obfuscateArchivedStudentForVault(r))
        res.json({ ok: true, type, records, students: records })
        return
      }
      const colSet = await getFacultiesColumnSet(pool)
      const vaultSql = colSet.has('updated_at')
        ? `SELECT id, name, first_name, middle_name, last_name, archived_at, archive_reason ${FACULTIES_FROM} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC`
        : `SELECT id, name, first_name, middle_name, last_name, archived_at, archive_reason ${FACULTIES_FROM} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC NULLS LAST, id DESC`
      const { rows } = await pool.query(vaultSql)
      const records = rows.map((r) => obfuscateArchivedFacultyForVault(r))
      res.json({ ok: true, type, records, faculty: records })
    } catch (e) {
      logStatePostgresError('GET /v1/admin/archive-vault/:type', e)
      sendSafeServerError(res, e, 'GET /v1/admin/archive-vault/:type')
    }
  })

  router.get('/v1/admin/archived-student/:studentId/work', async (req, res) => {
    const adminSession = await requireRegistrarSession(req, res, auth)
    if (!adminSession) return
    const rawId = String(req.params.studentId || '').trim()
    const studentId = Number(rawId)
    if (!Number.isFinite(studentId) || studentId <= 0) {
      res.status(400).json({ success: false, message: 'Invalid student id.' })
      return
    }
    try {
      const result = await fetchArchivedStudentWork(pool, studentId, { omitStudentPassword })
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message })
        return
      }
      const recordName = studentDisplayName(result.data.student) || `Student #${studentId}`
      await auditInstituteRecord(adminSession, 'ARCHIVED_RECORD_ACCESSED', {
        recordType: 'student',
        recordId: String(studentId),
        description: `Admin viewed archived student work history for ${recordName}`,
        details: {
          record_type: 'student',
          record_id: String(studentId),
          record_name: recordName,
          accessed_at: new Date().toISOString(),
        },
      })
      res.json({ ok: true, success: true, ...result.data })
    } catch (e) {
      logStatePostgresError('GET /v1/admin/archived-student/:studentId/work', e)
      sendSafeServerError(res, e, 'GET /v1/admin/archived-student/:studentId/work')
    }
  })

  router.get('/v1/admin/archived-faculty/:facultyId/work', async (req, res) => {
    const adminSession = await requireRegistrarSession(req, res, auth)
    if (!adminSession) return
    const facultyId = String(req.params.facultyId || '').trim()
    if (!facultyId) {
      res.status(400).json({ success: false, message: 'Invalid faculty id.' })
      return
    }
    try {
      const result = await fetchArchivedFacultyWork(pool, facultyId, {
        facultyRowToResponse,
        FACULTIES_FROM,
      })
      if (!result.ok) {
        res.status(result.status).json({ success: false, message: result.message })
        return
      }
      const recordName = String(result.data.faculty?.name || '').trim() || `Faculty #${facultyId}`
      await auditInstituteRecord(adminSession, 'ARCHIVED_RECORD_ACCESSED', {
        recordType: 'faculty',
        recordId: facultyId,
        description: `Admin viewed archived faculty work history for ${recordName}`,
        details: {
          record_type: 'faculty',
          record_id: facultyId,
          record_name: recordName,
          accessed_at: new Date().toISOString(),
        },
      })
      res.json({ ok: true, success: true, ...result.data })
    } catch (e) {
      logStatePostgresError('GET /v1/admin/archived-faculty/:facultyId/work', e)
      sendSafeServerError(res, e, 'GET /v1/admin/archived-faculty/:facultyId/work')
    }
  })

  router.post('/v1/admin/restore/:type/:id', async (req, res) => {
    const adminSession = await requireRegistrarSession(req, res, auth)
    if (!adminSession) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid archive type.' })
      return
    }
    const rawId = String(req.params.id || '').trim()
    if (!rawId) {
      res.status(400).json({ success: false, message: 'Invalid id.' })
      return
    }
    const password = String(req.body?.password || '').trim()
    const adminId = String(adminSession.user?.id || adminSession.data?.user?.id || '').trim()
    const passwordCheck = await verifyAdminPassword(pool, adminId, password)
    if (!passwordCheck.ok) {
      const recordType = type === 'students' ? 'student' : 'faculty'
      await auditInstituteRecord(adminSession, 'RESTORE_PASSWORD_FAILED', {
        recordType,
        recordId: rawId,
        description: `Archive restore password confirmation failed for ${recordType} ${rawId}`,
        details: {
          record_type: recordType,
          record_id: rawId,
          error_code: passwordCheck.code,
          blocked: Boolean(passwordCheck.blocked),
        },
      })
      const status =
        passwordCheck.code === 'RATE_LIMITED' || passwordCheck.blocked ? 429 : 401
      res.status(status).json({
        success: false,
        message: passwordCheck.message,
        error: passwordCheck.code,
      })
      return
    }
    try {
      if (type === 'students') {
        const id = Number(rawId)
        if (!Number.isFinite(id) || id <= 0) {
          res.status(400).json({ success: false, message: 'Invalid student id.' })
          return
        }
        const snapshot = await fetchArchivedStudentSnapshot(pool, id)
        if (!snapshot) {
          res.status(404).json({
            success: false,
            message: 'Record not found or not currently archived.',
          })
          return
        }
        const recordName = studentDisplayName(snapshot) || `Student #${id}`
        await pool.query(
          'UPDATE public.students SET archived_at = NULL, archive_reason = NULL WHERE id = $1 AND archived_at IS NOT NULL',
          [id],
        )
        await auditInstituteRecord(adminSession, 'STUDENT_RESTORED', {
          recordType: 'student',
          recordId: String(id),
          description: `Student restored from archive: ${recordName}`,
          details: {
            record_type: 'student',
            record_id: String(id),
            record_name: recordName,
            archived_at: snapshot.archived_at instanceof Date
              ? snapshot.archived_at.toISOString()
              : snapshot.archived_at ?? null,
            purge_type: 'restore',
            restore_confirmed_with_password: true,
          },
        })
        res.json({ ok: true, success: true, type, id: String(id) })
        return
      }
      const snapshot = await fetchArchivedFacultySnapshot(pool, rawId)
      if (!snapshot) {
        res.status(404).json({
          success: false,
          message: 'Record not found or not currently archived.',
        })
        return
      }
      const recordName = facultyDisplayName(snapshot)
      await pool.query(
        'UPDATE public.faculties SET archived_at = NULL, archive_reason = NULL WHERE id = $1 AND archived_at IS NOT NULL',
        [rawId],
      )
      await auditInstituteRecord(adminSession, 'FACULTY_RESTORED', {
        recordType: 'faculty',
        recordId: rawId,
        description: `Faculty restored from archive: ${recordName}`,
        details: {
          record_type: 'faculty',
          record_id: rawId,
          record_name: recordName,
          archived_at: snapshot.archived_at instanceof Date
            ? snapshot.archived_at.toISOString()
            : snapshot.archived_at ?? null,
          purge_type: 'restore',
          restore_confirmed_with_password: true,
        },
      })
      res.json({ ok: true, success: true, type, id: rawId })
    } catch (e) {
      logStatePostgresError('POST /v1/admin/restore/:type/:id', e)
      sendSafeServerError(res, e, 'POST /v1/admin/restore/:type/:id')
    }
  })

  router.delete('/v1/admin/permanent-purge/:type/:id', async (_req, res) => {
    res.status(403).json({
      success: false,
      error: 'PERMANENT_PURGE_DISABLED',
      message: 'Permanent delete from archive is disabled. Records are retained for data privacy.',
    })
  })

  /** Immediate roster delete disabled — use Archive with reason instead. */
  router.delete('/v1/admin/immediate-purge/:type/:id', async (_req, res) => {
    res.status(403).json({
      success: false,
      error: 'IMMEDIATE_PURGE_DISABLED',
      message: 'Immediate delete from active rosters is disabled. Archive the account instead.',
    })
  })
}
