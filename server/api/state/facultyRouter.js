import { randomUUID } from 'node:crypto'
import { requireRegistrarSession, logStatePostgresError, auditInstituteRecord, readStudentField, readStudentOptional, parseFacultySectionIds, mapBodyToFacultiesRow, insertFacultiesRow, updateFacultyWithSections, getFacultiesColumnSet, facultyRowToResponse, FACULTIES_FROM, readFacultyPhotoUrl, hashFacultyPassword, buildFacultyDisplayName, normStr, archiveFacultyRecord, parseArchiveReason, purgeFacultyFromAppStateJson, upsertFacultyInAppStateJson } from './shared.js'
import {
  buildFacultyAuditTargetName,
  buildFacultyComparePayload,
  computeFacultyProfileDetailedDiffs,
  fetchFacultyPriorState,
} from '../../lib/facultyProfileAudit.js'
import { stampRowLastModified } from '../../lib/recordIntegrity.js'
import { customActivityLogger } from '../../services/CustomActivityLogger.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { requireDestructiveConfirm } from '../../lib/security.js'
import { facultyPhotoUploadMiddleware, getFacultyUploadFile, normalizeFacultyMultipartBody } from '../../lib/facultyMultipart.js'
import { resolveFacultyPhotoForDb } from '../../lib/facultyPhotoStorage.js'
import { provisionPortalAuthUser } from '../../lib/provisionPortalAuthUser.js'
import { ensurePortalUserEmailOtpMfa } from '../../lib/enrollEmailOtpMfa.js'
import { findAuthUserIdByEmail } from '../logs.js'
import { validateProfilePhotoPayload } from '../../../shared/uploadLimits.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerFacultyRoutes(router, ctx) {
  const { pool, auth } = ctx

  const listActiveFaculty = async (req, res) => {
    if (!(await requireRegistrarSession(req, res, auth))) return
    try {
      const colSet = await getFacultiesColumnSet(pool)
      const listSql = colSet.has('updated_at')
        ? `SELECT * ${FACULTIES_FROM} WHERE archived_at IS NULL ORDER BY updated_at DESC NULLS LAST, id DESC`
        : `SELECT * ${FACULTIES_FROM} WHERE archived_at IS NULL ORDER BY id DESC`
      const { rows } = await pool.query(listSql)
      res.json({ ok: true, faculty: rows.map((r) => facultyRowToResponse(r)) })
    } catch (e) {
      logStatePostgresError('GET /v1/faculty', e)
      sendSafeServerError(res, e, 'GET /v1/faculty')
    }
  }

  router.get('/v1/faculty', listActiveFaculty)
  router.get('/v1/faculties', listActiveFaculty)

  router.get('/v1/faculty/:id(\\d+)', async (req, res) => {
    if (!(await requireRegistrarSession(req, res, auth))) return
    try {
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT * ${FACULTIES_FROM} WHERE id = $1`,
        [id],
      )
      if (!rows?.length) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }
      const faculty = facultyRowToResponse(rows[0])
      const is_archived = rows[0].archived_at != null
      res.json({
        ok: true,
        faculty: {
          ...faculty,
          archived_at: rows[0].archived_at ?? null,
          archivedAt: rows[0].archived_at ?? null,
          is_archived,
          isArchived: is_archived,
        },
      })
    } catch (e) {
      logStatePostgresError('GET /v1/faculty/:id', e)
      res.status(500).json({
        success: false,
        error: GENERIC_SERVER_ERROR,
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/faculty', facultyPhotoUploadMiddleware, async (req, res) => {
    const b = normalizeFacultyMultipartBody(req.body || {})
    try {
      const adminSession = await requireRegistrarSession(req, res, auth)
      if (!adminSession) return
      const facultyCode =
        readStudentField(b, 'facultyCodeId', 'faculty_code_id') ||
        readStudentField(b, 'facultyUsername', 'faculty_username') ||
        readStudentField(b, 'facultyCode', 'faculty_code') ||
        '(none)'
      console.log(
        `[faculty] POST /v1/faculty - Processing registration for code: ${facultyCode}`,
      )
      const sectionIds = parseFacultySectionIds(b)

      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email').toLowerCase()
      let auth_user_id = readStudentField(b, 'authUserId', 'auth_user_id')

      if (!first_name || !last_name || !email) {
        res.status(400).json({
          success: false,
          error: 'Required: firstName, lastName, and email.',
        })
        return
      }

      const password = readStudentField(b, 'password', 'password')
      if (!password) {
        res.status(400).json({
          success: false,
          error: 'Password is required when creating a faculty member.',
        })
        return
      }

      if (!auth_user_id) {
        auth_user_id =
          (await findAuthUserIdByEmail(email)) ||
          (await provisionPortalAuthUser(auth, pool, {
            email,
            name: buildFacultyDisplayName(
              first_name,
              readStudentOptional(b, 'middleName', 'middle_name'),
              last_name,
              readStudentField(b, 'name', 'name'),
            ),
            password,
            username:
              readStudentField(b, 'facultyCodeId', 'faculty_code_id') ||
              readStudentField(b, 'facultyUsername', 'faculty_username') ||
              readStudentField(b, 'facultyCode', 'faculty_code'),
            role: 'teacher',
          })) ||
          ''
      }
      if (!auth_user_id) {
        console.error('[POST /v1/faculty] auth user provisioning failed — no auth_user_id')
        res.status(500).json({
          success: false,
          error: 'AUTH_USER_CREATE_FAILED',
          message: 'Could not create or link the faculty login account.',
        })
        return
      }

      try {
        await ensurePortalUserEmailOtpMfa(pool, auth_user_id, { role: 'teacher' })
      } catch (mfaErr) {
        console.warn('[POST /v1/faculty] MFA enroll failed:', mfaErr?.message || mfaErr)
      }

      if (sectionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one advisory section (sectionIds) is required.',
        })
        return
      }

      const draftFacultyId = readStudentField(b, 'id', 'id') || randomUUID()
      try {
        await resolveFacultyPhotoForDb({
          file: getFacultyUploadFile(req),
          body: b,
          facultyId: draftFacultyId,
          isUpdate: false,
        })
      } catch (photoErr) {
        res.status(400).json({ success: false, error: String(photoErr?.message || photoErr) })
        return
      }

      const { row, colSet } = await mapBodyToFacultiesRow(pool, b, {
        sectionIds,
        includeSecrets: true,
        isUpdate: false,
      })
      row.id = draftFacultyId
      row.auth_user_id = auth_user_id
      row.name = buildFacultyDisplayName(
        first_name,
        readStudentOptional(b, 'middleName', 'middle_name'),
        last_name,
        readStudentField(b, 'name', 'name'),
      )

      const client = await pool.connect()
      let inserted
      try {
        inserted = await insertFacultiesRow(client, row, colSet)
      } finally {
        client.release()
      }
      if (!inserted?.id) {
        throw new Error('Faculty insert did not return a row.')
      }
      console.log(`[faculty] POST /v1/faculty - saved id=${inserted.id}`)

      await upsertFacultyInAppStateJson(pool, inserted)

      await auditInstituteRecord(adminSession, 'FACULTY_CREATED', {
        recordType: 'faculty',
        recordId: String(inserted.id),
        description: `Faculty created: ${buildFacultyDisplayName(first_name, readStudentOptional(b, 'middleName', 'middle_name'), last_name, '')}`,
      })

      res.status(201).json({
        success: true,
        message: 'Faculty saved',
        ok: true,
        id: String(inserted.id),
        faculty: facultyRowToResponse(inserted),
      })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'A faculty member with this email or faculty code already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          success: false,
          error: 'One or more section_ids do not exist.',
        })
        return
      }
      logStatePostgresError('POST /v1/faculty', e)
      sendSafeServerError(res, e, 'POST /v1/faculty')
    }
  })

  router.put('/v1/faculty/:id', facultyPhotoUploadMiddleware, async (req, res) => {
    const b = normalizeFacultyMultipartBody(req.body || {})
    try {
      const adminSession = await requireRegistrarSession(req, res, auth)
      if (!adminSession) return

      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }

      const priorState = await fetchFacultyPriorState(pool, id)
      if (!priorState?.row) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }
      const oldData = priorState.row
      const oldSectionIds = priorState.sectionIds
      const priorPhotoUrl = String(oldData.photo_url || oldData.photo_data_url || '').trim()

      let photoResolve = { photoSent: false, photoUrl: null }
      try {
        photoResolve = await resolveFacultyPhotoForDb({
          file: getFacultyUploadFile(req),
          body: b,
          facultyId: id,
          isUpdate: true,
          priorPhotoUrl,
        })
      } catch (photoErr) {
        const code = photoErr?.statusCode === 400 ? 400 : 400
        res.status(code).json({ success: false, error: String(photoErr?.message || photoErr) })
        return
      }

      const sectionIds = parseFacultySectionIds(b)
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email').toLowerCase()

      if (!first_name || !last_name || !email) {
        res.status(400).json({
          success: false,
          error: 'Update requires firstName, lastName, and email.',
        })
        return
      }
      if (sectionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one advisory section (sectionIds) is required.',
        })
        return
      }

      const { row, colSet } = await mapBodyToFacultiesRow(pool, b, {
        sectionIds,
        includeSecrets: true,
        isUpdate: true,
      })
      row.name = buildFacultyDisplayName(
        first_name,
        readStudentOptional(b, 'middleName', 'middle_name'),
        last_name,
        readStudentField(b, 'name', 'name'),
      )
      await stampRowLastModified(
        pool,
        'faculties',
        row,
        String(adminSession.user?.id || adminSession.data?.user?.id || ''),
      )
      const client = await pool.connect()
      let updated
      try {
        updated = await updateFacultyWithSections(client, id, row, colSet, sectionIds)
      } catch (e) {
        console.error('[PUT /v1/faculty/:id]', e)
        logStatePostgresError('PUT /v1/faculty/:id update', e)
        throw e
      } finally {
        client.release()
      }

      if (!updated) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }

      const incomingAuthUserId = readStudentField(b, 'authUserId', 'auth_user_id')
      const oldAuthUserId = String(oldData.auth_user_id || '').trim()
      if (incomingAuthUserId && !oldAuthUserId) {
        await pool.query(
          `UPDATE faculties SET auth_user_id = $1 WHERE id = $2 AND archived_at IS NULL`,
          [incomingAuthUserId, id],
        )
        updated.auth_user_id = incomingAuthUserId
      }

      await auditInstituteRecord(adminSession, 'FACULTY_UPDATED', {
        recordType: 'faculty',
        recordId: id,
        description: `Faculty updated: ${buildFacultyAuditTargetName(updated)}`,
      })

      try {
        const newCompare = buildFacultyComparePayload(b, sectionIds)
        const photoUploaded = Boolean(getFacultyUploadFile(req))
        const photoFlag =
          b?.photoChanged === true || String(b?.photoChanged || '').toLowerCase() === 'true'
        const oldPhoto = normStr(oldData.photo_url ?? oldData.photo_data_url)
        const newPhoto = normStr(photoResolve.photoUrl ?? newCompare.photoUrl)
        const photoChanged =
          photoUploaded ||
          photoFlag ||
          (photoResolve.photoSent && newPhoto !== '' && newPhoto !== oldPhoto)
        const passwordChanged = Boolean(readStudentField(b, 'password', 'password'))
        const appPwRaw =
          readStudentField(b, 'appPasswordGmail', 'app_password_gmail') ||
          readStudentField(b, 'appPassword', 'app_password')
        const appPasswordInBody = Boolean(appPwRaw)

        const detailedDiffs = await computeFacultyProfileDetailedDiffs(oldData, newCompare, {
          pool,
          oldSectionIds,
          newSectionIds: sectionIds,
          passwordChanged,
          appPasswordInBody,
          photoChanged,
        })
        const updatedFieldKeys = Object.keys(detailedDiffs)

        if (updatedFieldKeys.length > 0) {
          const actor = adminSession.user || adminSession.data?.user || {}
          const actorId = String(actor.id || '').trim()
          const targetEmail = normStr(updated.email ?? newCompare.email).toLowerCase()
          const authUserId =
            String(updated.auth_user_id || oldData.auth_user_id || '').trim() ||
            (await findAuthUserIdByEmail(targetEmail)) ||
            `faculty-record:${id}`

          await customActivityLogger.logUserAccountChanged(authUserId, {
            actorUserId: actorId,
            actorName: String(actor.name || '').trim(),
            actorEmail: String(actor.email || '').trim(),
            actorRole: 'admin',
            triggerContext: 'admin',
            userName: buildFacultyAuditTargetName(updated),
            userEmail: targetEmail,
            targetRole: 'faculty',
            updatedFields: updatedFieldKeys,
            detailedDiffs,
            source: 'admin',
          })
          console.log(
            '[Diagnostic] Audit Log for user_account_changed recorded successfully!',
            { facultyId: id, fields: updatedFieldKeys },
          )
        } else {
          console.log('[Diagnostic] No faculty field changes detected — audit log skipped.')
        }
      } catch (logErr) {
        console.warn('[Diagnostic] faculty user_account_changed audit failed:', logErr?.message || logErr)
      }

      await upsertFacultyInAppStateJson(pool, updated)

      console.log('[Diagnostic] Sending 200 response to client')
      res.json({ ok: true, success: true, faculty: facultyRowToResponse(updated) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'A faculty member with this email or faculty code already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          success: false,
          error: 'One or more section_ids do not exist.',
        })
        return
      }
      console.error('[PUT /v1/faculty/:id]', e)
      logStatePostgresError('PUT /v1/faculty/:id', e)
      sendSafeServerError(res, e, 'PUT /v1/faculty/:id')
    }
  })

  async function handleArchiveFaculty(req, res) {
    try {
      const adminSession = await requireRegistrarSession(req, res, auth)
      if (!adminSession) return
      if (req.method === 'DELETE' && !requireDestructiveConfirm(req, res, 'DELETE')) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }
      const parsedReason = parseArchiveReason(req.body)
      if (!parsedReason.ok) {
        res.status(400).json({ success: false, error: parsedReason.code, message: parsedReason.message })
        return
      }
      const archived = await archiveFacultyRecord(pool, id, parsedReason.reason)
      if (!archived) {
        res.status(404).json({ success: false, message: 'Faculty not found or already archived.' })
        return
      }
      await purgeFacultyFromAppStateJson(pool, id)
      await auditInstituteRecord(adminSession, 'FACULTY_DELETED', {
        recordType: 'faculty',
        recordId: id,
        description: `Faculty archived: ${id}`,
        details: { archive_reason: parsedReason.reason },
      })
      res.json({ ok: true, success: true, id, archived: true })
    } catch (e) {
      logStatePostgresError('archive faculty', e)
      sendSafeServerError(res, e, 'faculty route')
    }
  }

  router.post('/v1/faculties/:id/archive', handleArchiveFaculty)
  router.post('/v1/faculty/:id/archive', handleArchiveFaculty)

  router.delete('/v1/faculty/:id', handleArchiveFaculty)

}
