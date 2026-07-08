import { requireAdminSession, logStatePostgresError, auditInstituteRecord, readStudentField, readStudentOptional, parseStudentDob, readStudentContact, readStudentParentContact, readStudentAppPassword, readStudentPhotoUrl, parseStudentSectionId, normStr, omitStudentPassword, hashStudentPassword, archiveStudentRecord, ensureStudentsCatalogColumns } from './shared.js'
import { buildStudentAuditTargetName, computeStudentProfileDetailedDiffs } from '../../lib/studentProfileAudit.js'
import { extendUpdateSetWithIntegrity } from '../../lib/recordIntegrity.js'
import { customActivityLogger } from '../../services/CustomActivityLogger.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { requireDestructiveConfirm } from '../../lib/security.js'
import { validateProfilePhotoPayload } from '../../../shared/uploadLimits.js'
import { findAuthUserIdByEmail } from '../logs.js'
import { provisionPortalAuthUser } from '../../lib/provisionPortalAuthUser.js'
import { ensurePortalUserEmailOtpMfa } from '../../lib/enrollEmailOtpMfa.js'
import {
  decryptStudentPiiFields,
  decryptStudentRows,
  encryptStudentPiiValues,
} from '../../lib/studentPiiCrypto.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerStudentsRoutes(router, ctx) {
  const { pool, auth } = ctx
  router.get('/v1/students', async (req, res) => {
    const adminSession = await requireAdminSession(req, res, auth)
    if (!adminSession) return
    try {
      const { rows } = await pool.query(`
        SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name,
          s.email, s.contact_no, s.address, s.dob, s.parent_contact, s.parent_email,
          s.enrollment_no, s.roll_no, s.grade_level, s.semester, s.section_id,
          s.login_id, s.app_password_gmail, s.auth_user_id, s.created_at,
          sec.section_name AS section_name
        FROM students s
        LEFT JOIN sections sec ON sec.id = s.section_id
        WHERE s.archived_at IS NULL
        ORDER BY s.id DESC
      `)
      const students = decryptStudentRows(rows).map((r) => omitStudentPassword(r))
      res.json({ ok: true, students })
    } catch (e) {
      logStatePostgresError('GET /v1/students', e)
      res.status(500).json({
        error: 'STUDENTS_LIST_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.get('/v1/students/:id', async (req, res) => {
    const adminSession = await requireAdminSession(req, res, auth)
    if (!adminSession) return
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid student id.' })
      return
    }
    try {
      const { rows } = await pool.query(
        `
          SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name,
            s.email, s.contact_no, s.address, s.dob, s.parent_contact, s.parent_email,
            s.enrollment_no, s.roll_no, s.grade_level, s.semester, s.section_id,
            s.login_id, s.app_password_gmail, s.auth_user_id, s.created_at, s.archived_at,
            sec.section_name AS section_name
          FROM students s
          LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1
        `,
        [id],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }
      const student = omitStudentPassword(decryptStudentPiiFields(rows[0]))
      const is_archived = student.archived_at != null
      res.json({
        ok: true,
        student: {
          ...student,
          is_archived,
          isArchived: is_archived,
          archivedAt: student.archived_at,
        },
      })
    } catch (e) {
      logStatePostgresError('GET /v1/students/:id', e)
      res.status(500).json({
        error: 'STUDENT_GET_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/students', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      await ensureStudentsCatalogColumns(pool)
      const b = req.body || {}
      const dobParsed = parseStudentDob(b)
      if (!dobParsed.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: dobParsed.error })
        return
      }
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email')
      const contact_no = readStudentContact(b)
      const address = readStudentField(b, 'address', 'address')
      const parent_contact = readStudentParentContact(b)
      const parent_email = readStudentField(b, 'parentEmail', 'parent_email')
      const enrollment_no = readStudentField(b, 'enrollmentNo', 'enrollment_no')
      const roll_no = readStudentField(b, 'rollNo', 'roll_no')
      const grade_level = readStudentField(b, 'gradeLevel', 'grade_level')
      const semester = readStudentField(b, 'semester', 'semester')
      const login_id = readStudentField(b, 'loginId', 'login_id')
      const password = readStudentField(b, 'password', 'password')
      if (
        !first_name ||
        !last_name ||
        !email ||
        !contact_no ||
        !address ||
        !parent_contact ||
        !parent_email ||
        !enrollment_no ||
        !roll_no ||
        !grade_level ||
        !semester ||
        !login_id ||
        !password
      ) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message:
            'Required: firstName, lastName, email, contactNumber (or contactNo), address, dob, parentContact, parentEmail, enrollmentNo, rollNo, gradeLevel, semester, loginId, password.',
        })
        return
      }
      const middle_name = readStudentOptional(b, 'middleName', 'middle_name')
      const photo_url = readStudentPhotoUrl(b)
      const photoErr = validateProfilePhotoPayload(photo_url)
      if (photoErr) {
        res.status(400).json({ error: 'BAD_REQUEST', message: photoErr })
        return
      }
      const app_password_gmail = readStudentOptional(b, 'appPasswordGmail', 'app_password_gmail')
      const section_id = parseStudentSectionId(b)
      const displayName = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim() || email

      let authUserId =
        readStudentField(b, 'authUserId', 'auth_user_id') ||
        (await findAuthUserIdByEmail(email)) ||
        ''
      if (!authUserId) {
        authUserId =
          (await provisionPortalAuthUser(auth, pool, {
            email,
            name: displayName,
            password,
            username: login_id,
            role: 'student',
          })) || ''
      }
      if (!authUserId) {
        console.error('[POST /v1/students] auth user provisioning failed — no auth_user_id')
        res.status(500).json({
          error: 'AUTH_USER_CREATE_FAILED',
          message: 'Could not create or link the student login account.',
        })
        return
      }

      try {
        await ensurePortalUserEmailOtpMfa(pool, authUserId, { role: 'student' })
      } catch (mfaErr) {
        console.warn('[POST /v1/students] MFA enroll failed:', mfaErr?.message || mfaErr)
      }

      const password_hash = await hashStudentPassword(password)
      const pii = encryptStudentPiiValues({
        first_name,
        last_name,
        contact_no,
        address,
        dob: dobParsed.value,
        parent_contact,
      })
      const { rows } = await pool.query(
        `
          INSERT INTO students (
            photo_url, first_name, middle_name, last_name, email, contact_no, address, dob,
            parent_contact, parent_email, enrollment_no, roll_no, grade_level, semester, section_id,
            login_id, password_hash, app_password_gmail, auth_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING id, photo_url, first_name, middle_name, last_name, email, contact_no, address, dob,
            parent_contact, parent_email, enrollment_no, roll_no, grade_level, semester, section_id, login_id, app_password_gmail, auth_user_id, created_at
        `,
        [
          photo_url,
          pii.first_name ?? first_name,
          middle_name,
          pii.last_name ?? last_name,
          email,
          pii.contact_no ?? contact_no,
          pii.address ?? address,
          pii.dob ?? dobParsed.value,
          pii.parent_contact ?? parent_contact,
          parent_email,
          enrollment_no,
          roll_no,
          grade_level,
          semester,
          section_id,
          login_id,
          password_hash,
          app_password_gmail,
          authUserId,
        ],
      )
      const row = decryptStudentPiiFields(rows?.[0])
      await auditInstituteRecord(adminSession, 'STUDENT_CREATED', {
        recordType: 'student',
        recordId: String(row?.id ?? ''),
        description: `Student created: ${buildStudentAuditTargetName(row)}`,
      })
      res.status(201).json({ ok: true, student: omitStudentPassword(row ?? rows?.[0]) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          error: 'DUPLICATE',
          message: 'A student with this email, enrollment number, or login id already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Invalid section_id: section does not exist.',
        })
        return
      }
      logStatePostgresError('POST /v1/students', e)
      res.status(500).json({
        error: 'STUDENTS_INSERT_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.put('/v1/students/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid student id.' })
        return
      }
      const b = req.body || {}
      const dobParsed = parseStudentDob(b)
      if (!dobParsed.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: dobParsed.error })
        return
      }
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email')
      const contact_no = readStudentContact(b)
      const address = readStudentField(b, 'address', 'address')
      const parent_contact = readStudentParentContact(b)
      const parent_email = readStudentField(b, 'parentEmail', 'parent_email')
      const enrollment_no = readStudentField(b, 'enrollmentNo', 'enrollment_no')
      const roll_no = readStudentField(b, 'rollNo', 'roll_no')
      const grade_level = readStudentField(b, 'gradeLevel', 'grade_level')
      const semester = readStudentField(b, 'semester', 'semester')
      const login_id = readStudentField(b, 'loginId', 'login_id')
      if (
        !first_name ||
        !last_name ||
        !email ||
        !contact_no ||
        !address ||
        !parent_contact ||
        !parent_email ||
        !enrollment_no ||
        !roll_no ||
        !grade_level ||
        !semester ||
        !login_id
      ) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Update requires all non-password fields (same as create, omit password to keep current).',
        })
        return
      }
      const middle_name = readStudentOptional(b, 'middleName', 'middle_name')
      const photoFromBody = readStudentPhotoUrl(b)
      const section_id = parseStudentSectionId(b)
      const newPassword = readStudentField(b, 'password', 'password')
      const appPwRaw = readStudentAppPassword(b)
      const photoSent =
        (b?.photo_url != null && String(b.photo_url).trim() !== '') ||
        (b?.photoDataUrl != null && String(b.photoDataUrl).trim() !== '') ||
        (b?.studentPhotoUrl != null && String(b.studentPhotoUrl).trim() !== '') ||
        (b?.photoUrl != null && String(b.photoUrl).trim() !== '')
      if (photoSent && photoFromBody) {
        const photoErr = validateProfilePhotoPayload(photoFromBody)
        if (photoErr) {
          res.status(400).json({ error: 'BAD_REQUEST', message: photoErr })
          return
        }
      }

      const existing = await pool.query(
        `
          SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name, s.email, s.contact_no,
            s.address, s.dob, s.parent_contact, s.parent_email, s.enrollment_no, s.roll_no,
            s.grade_level, s.semester, s.section_id, s.login_id, s.password_hash, s.app_password_gmail,
            s.auth_user_id,
            sec.section_name
          FROM students s
          LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1 AND s.archived_at IS NULL
        `,
        [id],
      )
      if (!existing.rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }
      const oldRow = decryptStudentPiiFields(existing.rows[0])
      const incomingAuthUserId = readStudentField(b, 'authUserId', 'auth_user_id')
      const photo_url =
        photoSent && photoFromBody ? photoFromBody : oldRow.photo_url || photoFromBody || null

      let newSectionName = ''
      if (section_id != null) {
        const secRow = await pool.query('SELECT section_name FROM sections WHERE id = $1', [section_id])
        newSectionName = String(secRow.rows?.[0]?.section_name || '').trim()
      }

      const newData = {
        firstName: first_name,
        middleName: middle_name || '',
        lastName: last_name,
        email,
        phoneNumber: contact_no,
        address,
        dateOfBirth: dobParsed.value,
        parentPhone: parent_contact,
        parentEmail: parent_email,
        enrollmentNo: enrollment_no,
        rollNo: roll_no,
        gradeLevel: grade_level,
        semester,
        section: newSectionName,
        sectionId: section_id,
        loginId: login_id,
        photoUrl: photo_url || '',
      }

      const passwordChanged = Boolean(newPassword)
      const appPasswordInBody = Boolean(appPwRaw)
      const photoChanged = photoSent && normStr(photo_url) !== normStr(oldRow.photo_url)

      const detailedDiffs = computeStudentProfileDetailedDiffs(oldRow, newData, {
        passwordChanged,
        appPasswordInBody,
        photoChanged,
      })
      const updatedFields = Object.keys(detailedDiffs)

      let password_hash = oldRow.password_hash
      if (newPassword) {
        password_hash = /^\$2[aby]\$\d{2}\$/.test(newPassword)
          ? newPassword
          : await hashStudentPassword(newPassword)
      }
      let app_password_gmail = oldRow.app_password_gmail
      if (appPwRaw) {
        app_password_gmail = appPwRaw
      }
      const actorId = String(adminSession.user?.id || adminSession.data?.user?.id || '')
      const piiUpdate = encryptStudentPiiValues({
        first_name,
        last_name,
        contact_no,
        address,
        dob: dobParsed.value,
        parent_contact,
      })
      const baseValues = [
        photo_url,
        piiUpdate.first_name ?? first_name,
        middle_name,
        piiUpdate.last_name ?? last_name,
        email,
        piiUpdate.contact_no ?? contact_no,
        piiUpdate.address ?? address,
        piiUpdate.dob ?? dobParsed.value,
        piiUpdate.parent_contact ?? parent_contact,
        parent_email,
        enrollment_no,
        roll_no,
        grade_level,
        semester,
        section_id,
        login_id,
        password_hash,
        app_password_gmail,
      ]
      const baseSet = `
            photo_url = $1, first_name = $2, middle_name = $3, last_name = $4, email = $5,
            contact_no = $6, address = $7, dob = $8, parent_contact = $9, parent_email = $10,
            enrollment_no = $11, roll_no = $12, grade_level = $13, semester = $14, section_id = $15,
            login_id = $16, password_hash = $17, app_password_gmail = $18`
      const extended = await extendUpdateSetWithIntegrity(
        pool,
        'students',
        baseSet,
        baseValues,
        actorId,
        19,
      )
      extended.values.push(id)
      const r = await pool.query(
        `
          UPDATE students SET ${extended.setClause}
          WHERE id = $${extended.nextParamIndex} AND archived_at IS NULL
        `,
        extended.values,
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }

      const oldAuthUserId = String(oldRow.auth_user_id || '').trim()
      if (incomingAuthUserId && !oldAuthUserId) {
        await pool.query(
          `UPDATE students SET auth_user_id = $1 WHERE id = $2 AND archived_at IS NULL`,
          [incomingAuthUserId, id],
        )
      }

      await auditInstituteRecord(adminSession, 'STUDENT_UPDATED', {
        recordType: 'student',
        recordId: String(id),
        description: `Student updated: ${buildStudentAuditTargetName({ ...oldRow, first_name, middle_name, last_name, email })}`,
      })

      if (updatedFields.length > 0) {
        try {
          const actor = adminSession.user || adminSession.data?.user || {}
          const actorId = String(actor.id || '').trim()
          const targetEmail = email.toLowerCase()
          const authUserId = (await findAuthUserIdByEmail(targetEmail)) || `student-record:${id}`
          await customActivityLogger.logUserAccountChanged(authUserId, {
            actorUserId: actorId,
            actorName: String(actor.name || '').trim(),
            actorEmail: String(actor.email || '').trim(),
            actorRole: String(actor.role || 'admin').trim(),
            triggerContext: 'admin',
            userName: buildStudentAuditTargetName({ ...oldRow, first_name, middle_name, last_name, email }),
            userEmail: targetEmail,
            targetRole: 'student',
            updatedFields,
            detailedDiffs,
            source: 'admin',
            studentRecordId: id,
          })
        } catch (logErr) {
          console.warn('[students] profile audit log failed:', logErr?.message || logErr)
        }
      }

      const { rows } = await pool.query(
        `
          SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name,
            s.email, s.contact_no, s.address, s.dob, s.parent_contact, s.parent_email,
            s.enrollment_no, s.roll_no, s.grade_level, s.semester, s.section_id,
            s.login_id, s.app_password_gmail, s.auth_user_id, s.created_at,
            sec.section_name AS section_name
          FROM students s
          LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1 AND s.archived_at IS NULL
        `,
        [id],
      )
      res.json({ ok: true, student: omitStudentPassword(decryptStudentPiiFields(rows?.[0])) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          error: 'DUPLICATE',
          message: 'A student with this email, enrollment number, or login id already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Invalid section_id: section does not exist.',
        })
        return
      }
      logStatePostgresError('PUT /v1/students/:id', e)
      res.status(500).json({
        error: 'STUDENTS_UPDATE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  async function handleArchiveStudent(req, res) {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      if (req.method === 'DELETE' && !requireDestructiveConfirm(req, res, 'DELETE')) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Invalid student id.' })
        return
      }
      const archived = await archiveStudentRecord(pool, id)
      if (!archived) {
        res.status(404).json({ success: false, message: 'Student not found or already archived.' })
        return
      }
      await auditInstituteRecord(adminSession, 'STUDENT_DELETED', {
        recordType: 'student',
        recordId: String(id),
        description: `Student archived: ${id}`,
      })
      res.json({ ok: true, success: true, id, archived: true })
    } catch (e) {
      logStatePostgresError('archive student', e)
      sendSafeServerError(res, e, 'archive route')
    }
  }

  router.post('/v1/students/:id/archive', handleArchiveStudent)

  router.delete('/v1/students/:id', async (req, res) => handleArchiveStudent(req, res))
}
