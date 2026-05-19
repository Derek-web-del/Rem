import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { isBackupDbConfigured } from '../lib/backupSchema.js'
import {
  listBackups,
  getBackupById,
  getBackupStats,
  runBackupJob,
  restoreFromBackupFile,
  deleteBackupRecord,
  getScheduleSettings,
  updateScheduleSettings,
  logBackupAudit,
  mapBackupRow,
} from '../lib/backupService.js'
import { DEFAULT_BACKUP_TABLE_KEYS } from '../lib/backupTables.js'
function actorFromSession(session) {
  const user = session?.user || session?.data?.user || {}
  return {
    id: String(user.id || '').trim(),
    name: String(user.name || 'Administrator').trim(),
    email: String(user.email || '').trim(),
  }
}

function backupUnavailable(res) {
  res.status(503).json({
    success: false,
    error: 'DATABASE_NOT_CONFIGURED',
    message: 'Backup requires PostgreSQL. Set DATABASE_URL and restart the server.',
  })
}

export function createBackupRouter(express, auth) {
  const router = express.Router()

  async function requireAdmin(req, res) {
    if (!isBackupDbConfigured()) {
      backupUnavailable(res)
      return null
    }
    const session = await auth.api.getSession({ headers: req.headers })
    const role = String(session?.user?.role || session?.data?.user?.role || '').trim().toLowerCase()
    if (!session?.user?.id || role !== 'admin') {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Institute admin session required.' })
      return null
    }
    return session
  }

  router.get('/schedule', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const schedule = await getScheduleSettings()
      res.json({ ok: true, schedule })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup/schedule')
    }
  })

  router.put('/schedule', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const { daily, weekly, monthly } = req.body || {}
      const schedule = await updateScheduleSettings({
        daily: typeof daily === 'boolean' ? daily : undefined,
        weekly: typeof weekly === 'boolean' ? weekly : undefined,
        monthly: typeof monthly === 'boolean' ? monthly : undefined,
      })
      res.json({ ok: true, schedule })
    } catch (e) {
      sendSafeServerError(res, e, 'PUT /api/backup/schedule')
    }
  })

  router.get('/', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const [backups, stats] = await Promise.all([listBackups(), getBackupStats()])
      res.json({ ok: true, backups, stats })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup')
    }
  })

  router.post('/', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      const actor = actorFromSession(session)
      const { name, notes, tables } = req.body || {}
      const backupId = randomUUID()
      const result = await runBackupJob({
        backupId,
        name,
        type: 'manual',
        notes,
        tables: tables || DEFAULT_BACKUP_TABLE_KEYS,
        createdBy: actor.id,
      })
      await logBackupAudit(actor, 'BACKUP_CREATED', {
        backupId: result.id,
        backupName: result.name,
        description: `Manual backup "${result.name}" created`,
        details: {
          tablesCount: (tables || DEFAULT_BACKUP_TABLE_KEYS).length,
          sizeMb: result.size_mb,
        },
      })
      const row = await getBackupById(result.id)
      res.status(201).json({ ok: true, backup: mapBackupRow(row) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/backup')
    }
  })

  router.get('/:id/download', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const row = await getBackupById(req.params.id)
      if (!row?.file_path) {
        res.status(404).json({ success: false, error: 'Backup file not found.' })
        return
      }
      const fileName = path.basename(row.file_path)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      res.send(await fs.readFile(row.file_path, 'utf8'))
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup/:id/download')
    }
  })

  router.post('/:id/restore', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      if (String(req.body?.confirm || '').trim() !== 'RESTORE') {
        res.status(400).json({
          success: false,
          error: 'Confirmation required. Send { "confirm": "RESTORE" } in the request body.',
        })
        return
      }
      const row = await getBackupById(req.params.id)
      if (!row?.file_path) {
        res.status(404).json({ success: false, error: 'Backup not found.' })
        return
      }
      if (row.status !== 'completed') {
        res.status(400).json({ success: false, error: 'Only completed backups can be restored.' })
        return
      }
      await restoreFromBackupFile(row.file_path, row.tables_included)
      const actor = actorFromSession(session)
      await logBackupAudit(actor, 'BACKUP_RESTORED', {
        backupId: row.id,
        backupName: row.name,
        description: `Data restored from backup "${row.name}"`,
        details: { restoredAt: new Date().toISOString() },
      })
      res.json({ ok: true, success: true, message: 'Backup restored successfully.' })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/backup/:id/restore')
    }
  })

  router.post('/:id/retry', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      const existing = await getBackupById(req.params.id)
      if (!existing) {
        res.status(404).json({ success: false, error: 'Backup not found.' })
        return
      }
      const actor = actorFromSession(session)
      const result = await runBackupJob({
        backupId: existing.id,
        name: existing.name,
        type: existing.type || 'manual',
        notes: existing.notes,
        tables: existing.tables_included || DEFAULT_BACKUP_TABLE_KEYS,
        createdBy: actor.id,
      })
      await logBackupAudit(actor, 'BACKUP_CREATED', {
        backupId: result.id,
        backupName: result.name,
        description: `Backup "${result.name}" retried successfully`,
        details: { retried: true, sizeMb: result.size_mb },
      })
      const row = await getBackupById(result.id)
      res.json({ ok: true, backup: mapBackupRow(row) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/backup/:id/retry')
    }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      const row = await deleteBackupRecord(req.params.id)
      if (!row) {
        res.status(404).json({ success: false, error: 'Backup not found.' })
        return
      }
      const actor = actorFromSession(session)
      await logBackupAudit(actor, 'BACKUP_DELETED', {
        backupId: row.id,
        backupName: row.name,
        description: `Backup "${row.name}" deleted`,
      })
      res.json({ ok: true, success: true })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/backup/:id')
    }
  })

  return router
}
