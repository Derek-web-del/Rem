import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { requireAnyRoleSession } from '../lib/security.js'
import { getSchoolYear, setSchoolYear, isValidSchoolYear } from '../lib/institutionSettingsDb.js'

export function createSchoolYearRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    router.get('/v1/school-year', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    router.put('/v1/school-year', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    return router
  }

  router.get('/v1/school-year', async (req, res) => {
    try {
      const session = await requireAnyRoleSession(req, res, auth, ['admin', 'registrar', 'faculty', 'student'])
      if (!session) return
      const schoolYear = await getSchoolYear(getPgPool())
      res.json({ ok: true, schoolYear })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/school-year')
    }
  })

  router.put('/v1/school-year', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const raw = req.body?.schoolYear ?? req.body?.school_year
      if (!isValidSchoolYear(raw)) {
        res.status(400).json({
          error: 'INVALID_SCHOOL_YEAR',
          message: 'School year must look like "2025-2026".',
        })
        return
      }

      const actor = adminSession.user ?? adminSession?.data?.user ?? {}
      const schoolYear = await setSchoolYear(getPgPool(), raw, actor.id)

      await auditInstituteRecord(adminSession, 'SCHOOL_YEAR_UPDATED', {
        recordType: 'institute_settings',
        recordId: 'default',
        description: `School year set to ${schoolYear}`,
        details: { schoolYear },
      })

      res.json({ ok: true, schoolYear })
    } catch (e) {
      if (e?.code === 'INVALID_SCHOOL_YEAR') {
        res.status(400).json({
          error: 'INVALID_SCHOOL_YEAR',
          message: 'School year must look like "2025-2026".',
        })
        return
      }
      sendSafeServerError(res, e, 'PUT /api/v1/school-year')
    }
  })

  return router
}
