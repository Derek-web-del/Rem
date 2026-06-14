import {
  logStatePostgresError,
  STATE_ID,
  syncSections,
  syncFaculties,
  syncCurriculums,
  syncCurriculumManifest,
  requireAdminSession,
} from './shared.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerStateRoutes(router, ctx) {
  const { pool, auth } = ctx
  router.get('/v1/state', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT json FROM app_state WHERE id = $1', [STATE_ID])
      const row = rows?.[0]
      if (!row?.json) {
        res.json({ ok: true, state: null })
        return
      }
      try {
        res.json({ ok: true, state: JSON.parse(row.json) })
      } catch {
        res.status(500).json({ error: 'STATE_CORRUPT', message: 'Saved state could not be parsed.' })
      }
    } catch (e) {
      logStatePostgresError('GET /v1/state', e)
      sendSafeServerError(res, e, 'GET /v1/state')
    }
  })

  router.put('/v1/state', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const state = req.body?.state
      if (state === undefined) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Expected JSON body: { state: ... }' })
        return
      }

      let previousState = {}
      try {
        const { rows } = await pool.query('SELECT json FROM app_state WHERE id = $1', [STATE_ID])
        const raw = rows?.[0]?.json
        if (raw) {
          previousState = JSON.parse(raw)
        }
      } catch {
        previousState = {}
      }

      const mergedState = {
        ...previousState,
        ...state,
        adminAvatarDataUrl:
          state?.adminAvatarDataUrl != null
            ? state.adminAvatarDataUrl
            : (previousState.adminAvatarDataUrl ?? ''),
      }

      const json = JSON.stringify(mergedState)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `
            INSERT INTO app_state (id, json, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = NOW()
          `,
          [STATE_ID, json],
        )
        if (Array.isArray(state?.faculties) && state?.__localFacultyMirror === true) {
          await syncFaculties(client, { ...mergedState, faculties: state.faculties })
        }
        if (Array.isArray(state?.sections)) {
          await syncSections(client, { ...mergedState, sections: state.sections })
        }
        if (Array.isArray(state?.curriculums)) {
          await syncCurriculums(client, { ...mergedState, curriculums: state.curriculums })
          await syncCurriculumManifest(client, { ...mergedState, curriculums: state.curriculums })
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }

      res.json({ ok: true })
    } catch (e) {
      logStatePostgresError('PUT /v1/state', e)
      res.status(500).json({
        error: 'STATE_SAVE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })
}
