import { getPgPool, isPgConfigured } from '../../pgPool.js'
import { ensureRecordIntegrityColumns } from '../../lib/recordIntegrity.js'
import { registerStateRoutes } from './stateRoutes.js'
import { registerCurriculumRoutes } from './curriculumRouter.js'
import { registerSubjectsRoutes } from './subjectsRouter.js'
import { registerAnnouncementsRoutes } from './announcementsRouter.js'
import { registerFacultyRoutes } from './facultyRouter.js'
import { registerStudentsRoutes } from './studentsRouter.js'
import { registerArchiveRoutes } from './archiveRouter.js'
import {
  ensureSchema,
  getFacultiesColumnSet,
  backfillMirrorTables,
  logStatePostgresError,
  noopClose,
  resetFacultiesColumnSetCache,
} from './shared.js'

export async function createStateApiRouter(express, { auth } = {}) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const notConfiguredDetail =
      'PostgreSQL is not configured. Set DATABASE_URL in .env (e.g. postgres://user:pass@localhost:5432/lenlearn_db), run `npx auth@latest migrate --yes --config server/auth.js`, then restart the server.'
    router.get('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message:
          'Institute records are not set up on this server yet. Your sign-in still works; the dashboard may use saved or profile data.',
        detail: notConfiguredDetail,
      })
    })
    router.put('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message:
          'Institute records are not set up on this server yet. Your sign-in still works; the dashboard may use saved or profile data.',
        detail: notConfiguredDetail,
      })
    })
    const curriculum503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Curriculum API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/curriculum', curriculum503)
    router.post('/v1/curriculum', curriculum503)
    router.put('/v1/curriculum/:id', curriculum503)
    router.delete('/v1/curriculum/:id', curriculum503)
    const sections503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Sections API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/sections', sections503)
    router.post('/v1/sections', sections503)
    router.delete('/v1/sections/:id', sections503)
    const subjects503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Subjects API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/subjects', subjects503)
    router.post('/v1/subjects', subjects503)
    router.put('/v1/subjects/:id', subjects503)
    router.delete('/v1/subjects/:id', subjects503)
    const announcements503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Announcements API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/announcements', announcements503)
    router.post('/v1/announcements', announcements503)
    router.put('/v1/announcements/:id', announcements503)
    router.delete('/v1/announcements/:id', announcements503)
    const students503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Students API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/students', students503)
    router.post('/v1/students', students503)
    router.put('/v1/students/:id', students503)
    router.delete('/v1/students/:id', students503)
    const faculty503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Faculty API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/faculty', faculty503)
    router.post('/v1/faculty', faculty503)
    router.put('/v1/faculty/:id', faculty503)
    router.delete('/v1/faculty/:id', faculty503)
    return { router, close: noopClose }
  }

  let pool
  try {
    pool = getPgPool()
    if (!pool) throw new Error('PostgreSQL pool unavailable')
    await ensureSchema(pool)
    await ensureRecordIntegrityColumns(pool)
    resetFacultiesColumnSetCache()
    await getFacultiesColumnSet(pool)
    await backfillMirrorTables(pool)
  } catch (e) {
    logStatePostgresError('createStateApiRouter startup', e)
    const raw = String(e?.message || e)
    const code = e?.code
    const transientPg =
      code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND'
    const devHint = transientPg
      ? ' Start PostgreSQL, fix DATABASE_URL/host/port, or verify the database exists.'
      : ''
    const detail = raw + devHint
    const userMessage = transientPg
      ? 'The database server is not running or not reachable. Your sign-in still works; the dashboard may use saved or profile data.'
      : 'The database could not be reached. Your sign-in still works; the dashboard may use saved or profile data.'
    router.get('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: userMessage,
        detail,
      })
    })
    router.put('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: userMessage,
        detail,
      })
    })
    const curriculum503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Curriculum API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/curriculum', curriculum503b)
    router.post('/v1/curriculum', curriculum503b)
    router.put('/v1/curriculum/:id', curriculum503b)
    router.delete('/v1/curriculum/:id', curriculum503b)
    const sections503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Sections API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/sections', sections503b)
    router.post('/v1/sections', sections503b)
    router.delete('/v1/sections/:id', sections503b)
    const subjects503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Subjects API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/subjects', subjects503b)
    router.post('/v1/subjects', subjects503b)
    router.put('/v1/subjects/:id', subjects503b)
    router.delete('/v1/subjects/:id', subjects503b)
    const announcements503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Announcements API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/announcements', announcements503b)
    router.post('/v1/announcements', announcements503b)
    router.put('/v1/announcements/:id', announcements503b)
    router.delete('/v1/announcements/:id', announcements503b)
    const students503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Students API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/students', students503b)
    router.post('/v1/students', students503b)
    router.put('/v1/students/:id', students503b)
    router.delete('/v1/students/:id', students503b)
    const faculty503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Faculty API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/faculty', faculty503b)
    router.post('/v1/faculty', faculty503b)
    router.put('/v1/faculty/:id', faculty503b)
    router.delete('/v1/faculty/:id', faculty503b)
    return { router, close: noopClose }
  }

  registerStateRoutes(router, { pool, auth })
  registerCurriculumRoutes(router, { pool, auth })
  registerSubjectsRoutes(router, { pool, auth })
  registerAnnouncementsRoutes(router, { pool, auth })
  registerFacultyRoutes(router, { pool, auth })
  registerStudentsRoutes(router, { pool, auth })
  registerArchiveRoutes(router, { pool, auth })

  return {
    router,
    close: async () => {
      /* Shared pool: closed by closePgPool() from server/index.js */
    },
  }
}
