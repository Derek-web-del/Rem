import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import { isValidSchoolYear, getSchoolYear } from '../lib/institutionSettingsDb.js'
import { computePromotionPlan, runGradePromotion } from '../lib/gradePromotionDb.js'
import { createSafetyBackup } from '../lib/lnbakEngine.js'

export function createGradePromotionV1Router(express, auth) {
  const router = express.Router()

  router.get('/v1/admin/promotion/preview', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const pool = getPgPool()
      const [plan, currentSchoolYear] = await Promise.all([
        computePromotionPlan(pool),
        getSchoolYear(pool),
      ])
      res.json({ ok: true, success: true, plan, current_school_year: currentSchoolYear })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/promotion/preview')
    }
  })

  router.post('/v1/admin/promotion/run', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      if (String(req.body?.confirm || '').trim() !== 'PROMOTE') {
        res.status(400).json({
          success: false,
          error: 'CONFIRMATION_REQUIRED',
          message: 'Send { "confirm": "PROMOTE" } in the request body.',
        })
        return
      }

      const newSchoolYear = String(req.body?.new_school_year || '').trim()
      if (!isValidSchoolYear(newSchoolYear)) {
        res.status(400).json({
          success: false,
          error: 'INVALID_SCHOOL_YEAR',
          message: 'School year must look like "2027-2028".',
        })
        return
      }

      const pool = getPgPool()
      const actor = adminSession.user ?? adminSession?.data?.user ?? {}

      let safetyBackup = null
      try {
        safetyBackup = await createSafetyBackup(actor.id)
      } catch (e) {
        console.warn('[promotion] Safety backup skipped (promotion continues):', e?.message || e)
      }

      const result = await runGradePromotion(pool, { newSchoolYear, actorId: actor.id })

      await auditInstituteRecord(adminSession, 'STUDENTS_PROMOTED', {
        recordType: 'institute_settings',
        recordId: 'default',
        description: `Year-end promotion run: ${result.promoted} promoted, ${result.graduated} graduated, school year set to ${result.school_year}`,
        details: { ...result, safety_backup: safetyBackup },
      })

      res.json({ ok: true, success: true, ...result, safety_backup: safetyBackup })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/admin/promotion/run')
    }
  })

  return router
}
