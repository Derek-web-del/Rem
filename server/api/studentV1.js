import { getPgPool } from '../pgPool.js'

import { sendSafeServerError } from '../lib/safeApiError.js'

import { logUnauthorizedAccessFromRequest } from '../lib/security.js'

import {

  ensureQuizzesSchema,

  grantQuizAccess,

  verifyQuizPassword,

} from '../lib/quizzesDb.js'

import {
  ensureStudentTermsColumns,
  fetchStudentRowForSession,
  markStudentTermsAccepted,
  clearStudentTermsAccepted,
} from '../lib/studentSession.js'

import {

  fetchStudentActivities,

  fetchStudentAnnouncements,

  fetchStudentAnnouncementById,

  fetchStudentAssignments,

  fetchStudentQuizzesForGrade,

  fetchStudentStudyMaterials,

  fetchStudentSubjects,

  getStudentPortalProfile,

} from '../lib/studentPortalDb.js'
import {
  assertStudentCanAccessSubject,
  fetchStudentSubjectMaterials,
  sendStudentSubjectSyllabusResponse,
} from '../lib/studentSubjectMaterials.js'
import { fetchSubjectModulesWithItems, fetchSubjectStream } from '../lib/subjectCurriculumDb.js'
import { resolveStudentSectionName } from '../lib/subjectDetailsEnrich.js'
import { registerWorkRoutes } from './studentWorkV1.js'
import { registerStudentQuizRoutes } from './studentQuizV1.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { buildStudentAuditTargetName } from '../lib/studentProfileAudit.js'



async function getSessionUser(req, auth) {

  if (!auth?.api?.getSession) return null

  const session = await auth.api.getSession({ headers: req.headers })

  return (

    session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user ?? null

  )

}



async function requireStudentSession(req, res, auth) {

  if (!auth?.api?.getSession) {

    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })

    return null

  }

  try {

    const u = await getSessionUser(req, auth)

    if (!u?.id) {

      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })

      return null

    }

    const role = String(u.role || '').trim().toLowerCase()

    if (role !== 'student') {

      logUnauthorizedAccessFromRequest(req, {

        reason: 'Student API requires student role',

        requiredRole: 'student',

      })

      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Students only.' })

      return null

    }

    return { user: u }

  } catch (e) {

    sendSafeServerError(res, e, 'student session gate')

    return null

  }

}



function parseIdParam(raw) {

  const id = Number(raw)

  if (!Number.isFinite(id) || id <= 0) return null

  return id

}



async function resolveStudentContext(pool, user, res) {
  await ensureStudentTermsColumns(pool)
  const studentRow = await fetchStudentRowForSession(pool, user)

  if (!studentRow) {
    res.status(404).json({
      success: false,
      error: 'STUDENT_NOT_FOUND',
      message: 'Student profile not linked to this account.',
    })
    return null
  }

  return studentRow
}

function studentTermsAccepted(row) {
  return row?.terms_accepted === true
}

function requireTermsAccepted(studentRow, res) {
  if (studentTermsAccepted(studentRow)) return true
  res.status(403).json({
    success: false,
    error: 'TERMS_NOT_ACCEPTED',
    message: 'You must accept the Terms & Conditions before using the student portal.',
  })
  return false
}

export function createStudentV1Router(express, auth) {
  const router = express.Router()

  router.get('/v1/student/terms-status', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      const acceptedAt =
        studentRow.terms_accepted_at instanceof Date
          ? studentRow.terms_accepted_at.toISOString()
          : studentRow.terms_accepted_at ?? null
      res.json({
        success: true,
        accepted: studentTermsAccepted(studentRow),
        accepted_at: acceptedAt,
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/terms-status')
    }
  })

  router.post('/v1/student/accept-terms', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      const alreadyAccepted = studentTermsAccepted(studentRow)
      const updated = await markStudentTermsAccepted(pool, studentRow.id)
      const acceptedAt =
        updated?.terms_accepted_at instanceof Date
          ? updated.terms_accepted_at.toISOString()
          : updated?.terms_accepted_at ?? null
      if (!alreadyAccepted) {
        try {
          await customActivityLogger.logTermsAccepted(
            String(gate.user.id),
            {
              portal: 'student',
              acceptedAt,
              userName: buildStudentAuditTargetName(studentRow),
              userEmail: String(gate.user?.email || studentRow?.email || '').trim().toLowerCase(),
            },
            { userRole: 'student' },
          )
        } catch {
          /* ignore */
        }
      }
      res.json({ success: true, accepted_at: acceptedAt })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/accept-terms')
    }
  })

  router.post('/v1/student/logout-terms-reset', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      await clearStudentTermsAccepted(pool, studentRow.id)
      res.json({ success: true, accepted: false })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/student/logout-terms-reset')
    }
  })

  router.get('/v1/student/profile', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const profile = await getStudentPortalProfile(pool, gate.user, studentRow)

      if (!profile) {

        res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' })

        return

      }

      res.json({ success: true, profile })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/profile')

    }

  })



  router.get('/v1/student/subjects', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const subjects = await fetchStudentSubjects(pool, studentRow)

      res.json({ success: true, subjects })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/subjects')

    }

  })

  router.get('/v1/student/subjects/:id/materials', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const subjectId = parseIdParam(req.params.id)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const subject = await assertStudentCanAccessSubject(pool, studentRow, subjectId)
      if (!subject) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const materials = await fetchStudentSubjectMaterials(pool, subjectId, subject)
      res.json({ success: true, materials })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/subjects/:id/materials')
    }
  })

  router.get('/v1/student/subjects/:id/syllabus-file', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const subjectId = parseIdParam(req.params.id)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const subject = await assertStudentCanAccessSubject(pool, studentRow, subjectId)
      if (!subject) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT syllabus_pdf, subject_code FROM subjects WHERE id = $1 LIMIT 1`,
        [subjectId],
      )
      const syllabusRaw = String(rows?.[0]?.syllabus_pdf ?? '').trim()
      const fileName = subject.syllabus_file_name || 'syllabus.pdf'
      await sendStudentSubjectSyllabusResponse(res, syllabusRaw, fileName)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/subjects/:id/syllabus-file')
    }
  })

  router.get('/v1/student/subjects/:id', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const subjectId = parseIdParam(req.params.id)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const subject = await assertStudentCanAccessSubject(pool, studentRow, subjectId)
      if (!subject) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const section_name = await resolveStudentSectionName(pool, studentRow.section_id)
      res.json({ success: true, subject: { ...subject, section_name } })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/subjects/:id')
    }
  })

  router.get('/v1/student/subjects/:id/stream', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const subjectId = parseIdParam(req.params.id)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const subject = await assertStudentCanAccessSubject(pool, studentRow, subjectId)
      if (!subject) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const topics = await fetchSubjectStream(pool, subjectId, { publishedOnly: true })
      res.json({ success: true, topics: topics || [] })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/subjects/:id/stream')
    }
  })

  router.get('/v1/student/subjects/:id/modules', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const subjectId = parseIdParam(req.params.id)
      if (!subjectId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid subject id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const subject = await assertStudentCanAccessSubject(pool, studentRow, subjectId)
      if (!subject) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Subject not found.' })
        return
      }
      const modules = await fetchSubjectModulesWithItems(pool, subjectId, { publishedOnly: true })
      res.json({ success: true, modules: modules || [] })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/subjects/:id/modules')
    }
  })



  router.get('/v1/student/assignments', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const assignments = await fetchStudentAssignments(pool, studentRow)

      res.json({ success: true, assignments })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/assignments')

    }

  })



  router.get('/v1/student/activities', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const activities = await fetchStudentActivities(pool, studentRow)

      res.json({ success: true, activities })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/activities')

    }

  })



  router.get('/v1/student/quizzes', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const quizzes = await fetchStudentQuizzesForGrade(pool, studentRow)

      res.json({ success: true, quizzes })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/quizzes')

    }

  })



  router.post('/v1/student/quizzes/:id/verify-password', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const id = parseIdParam(req.params.id)

      if (!id) {

        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid quiz id.' })

        return

      }

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      await ensureQuizzesSchema(pool)

      const ok = await verifyQuizPassword(pool, id, req.body?.password)

      if (!ok) {

        res.status(401).json({

          success: false,

          error: 'INCORRECT_PASSWORD',

          message: 'Incorrect password. Please try again.',

        })

        return

      }

      await grantQuizAccess(pool, gate.user.id, id)

      res.json({ success: true })

    } catch (e) {

      sendSafeServerError(res, e, 'POST /api/v1/student/quizzes/:id/verify-password')

    }

  })



  router.get('/v1/student/announcements', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const announcements = await fetchStudentAnnouncements(pool)

      res.json({ success: true, announcements })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/announcements')

    }

  })

  router.get('/v1/student/announcements/:id', async (req, res) => {
    try {
      const gate = await requireStudentSession(req, res, auth)
      if (!gate) return
      const announcementId = parseIdParam(req.params.id)
      if (!announcementId) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid announcement id.' })
        return
      }
      const pool = getPgPool()
      const studentRow = await resolveStudentContext(pool, gate.user, res)
      if (!studentRow) return
      if (!requireTermsAccepted(studentRow, res)) return
      const announcement = await fetchStudentAnnouncementById(pool, announcementId)
      if (!announcement) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Announcement not found.' })
        return
      }
      res.json({ success: true, announcement })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/student/announcements/:id')
    }
  })



  router.get('/v1/student/study-materials', async (req, res) => {

    try {

      const gate = await requireStudentSession(req, res, auth)

      if (!gate) return

      const pool = getPgPool()

      const studentRow = await resolveStudentContext(pool, gate.user, res)

      if (!studentRow) return

      if (!requireTermsAccepted(studentRow, res)) return


      const search = String(req.query.search ?? req.query.q ?? '').trim()
      const materials = await fetchStudentStudyMaterials(pool, studentRow, { search })

      res.json({ success: true, materials })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/v1/student/study-materials')

    }

  })

  registerWorkRoutes(router, {
    requireStudentSession,
    resolveStudentContext,
    requireTermsAccepted,
    auth,
  })

  registerStudentQuizRoutes(router, {
    requireStudentSession,
    resolveStudentContext,
    requireTermsAccepted,
    auth,
  })

  return router
}


