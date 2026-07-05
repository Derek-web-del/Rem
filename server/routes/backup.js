import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import multer from 'multer'
import { sendSafeServerError, sendRestoreError, formatRestoreErrorPayload, describeRestoreFailureReason } from '../lib/safeApiError.js'
import { BACKUP_RESTORE_MAX_BYTES } from '../lib/uploadLimitsConfig.js'
import { isBackupDbConfigured, ensureBackupSchema } from '../lib/backupSchema.js'
import {
  listBackups,
  getBackupById,
  getBackupStats,
  runBackupJob,
  deleteBackupRecord,
  getScheduleSettings,
  updateScheduleSettings,
  logBackupAudit,
  mapBackupRow,
  maybeUploadBackupToDrive,
} from '../lib/backupService.js'
import { LNBAK_TABLE_KEYS } from '../lib/backupTables.js'
import {
  BACKUPS_DIR,
  BACKUP_UPLOADS_DIR,
  buildLnbakFilename,
  ensureBackupsDirectory,
  exportBackupData,
  writeLnbakArchiveToPath,
  readLnbakFromPath,
  runRestorePipeline,
  RESTORE_ENGINE_VERSION,
  LNBAK_TABLE_ORDER,
  testRestoreFkBypassCapability,
} from '../lib/lnbakEngine.js'
import { getPgPool } from '../pgPool.js'

ensureBackupsDirectory()

const restoreUploadLimits = BACKUP_RESTORE_MAX_BYTES > 0 ? { fileSize: BACKUP_RESTORE_MAX_BYTES } : {}

const restoreUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, BACKUP_UPLOADS_DIR)
    },
    filename(_req, file, cb) {
      const base = String(file.originalname || 'restore.lnbak').replace(/[^\w.\-]+/g, '_')
      cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${base}`)
    },
  }),
  limits: restoreUploadLimits,
  fileFilter: (_req, file, cb) => {
    if (!String(file.originalname || '').toLowerCase().endsWith('.lnbak')) {
      cb(new Error('Only .lnbak files are accepted'))
      return
    }
    cb(null, true)
  },
})

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

function validationError(res, message) {
  res.status(400).json({ success: false, message })
}

function wantsStreamRestore(req) {
  return (
    String(req.query?.stream || '').trim() === '1' ||
    String(req.headers.accept || '').includes('application/x-ndjson')
  )
}

async function logRestoreFailure(actor, err, meta = {}) {
  try {
    const payload = formatRestoreErrorPayload(err)
    await logBackupAudit(actor, 'BACKUP_RESTORE_FAILED', {
      description: describeRestoreFailureReason(err),
      details: {
        failed_at: payload.failed_table,
        constraint: payload.constraint,
        reason: payload.reason,
        detail: payload.detail,
        rolled_back: payload.rolled_back,
        ...meta,
      },
    })
  } catch (auditErr) {
    console.error('[BACKUP] Failed to write restore failure audit:', auditErr)
  }
}

async function executeStreamRestore(res, runner, { onError } = {}) {
  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders?.()

  const writeEvent = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`)
  }

  try {
    const result = await runner((event) => {
      writeEvent({ type: 'progress', ...event })
    })
    writeEvent({ type: 'complete', success: true, ...result })
    res.end()
  } catch (e) {
    if (onError) {
      try {
        await onError(e)
      } catch {
        /* audit failure must not mask restore error */
      }
    }
    writeEvent({
      type: 'error',
      success: false,
      ...formatRestoreErrorPayload(e),
    })
    res.end()
  }
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

  router.get('/restore-diagnostics', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const pool = getPgPool()
      const fkBypass = await testRestoreFkBypassCapability(pool)
      let backupsWritable = false
      let backupsFreeBytes = null
      try {
        ensureBackupsDirectory()
        const probe = path.join(BACKUPS_DIR, `.write-probe-${Date.now()}`)
        await fsp.writeFile(probe, 'ok')
        await fsp.unlink(probe)
        backupsWritable = true
      } catch {
        backupsWritable = false
      }
      res.json({
        ok: true,
        restore_engine: RESTORE_ENGINE_VERSION,
        subject_topics_before_modules:
          LNBAK_TABLE_ORDER.indexOf('subject_topics') <
          LNBAK_TABLE_ORDER.indexOf('subject_modules'),
        fk_bypass: fkBypass,
        storage: {
          backups_dir: BACKUPS_DIR,
          backups_writable: backupsWritable,
          uploads_dir: process.env.UPLOAD_DIR || '(default public/uploads)',
          backup_dir_env_set: Boolean(String(process.env.BACKUP_DIR || process.env.BACKUPS_DIR || '').trim()),
          hint: backupsWritable
            ? 'Backup directory is writable.'
            : 'Mount a DigitalOcean Volume and set BACKUP_DIR to a path on that volume (e.g. /data/backups).',
        },
      })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup/restore-diagnostics')
    }
  })

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
      const session = await requireAdmin(req, res)
      if (!session) return
      const actor = actorFromSession(session)
      const before = await getScheduleSettings()
      const { daily, weekly, monthly } = req.body || {}
      const schedule = await updateScheduleSettings({
        daily: typeof daily === 'boolean' ? daily : undefined,
        weekly: typeof weekly === 'boolean' ? weekly : undefined,
        monthly: typeof monthly === 'boolean' ? monthly : undefined,
      })
      await logBackupAudit(actor, 'BACKUP_SCHEDULE_UPDATED', {
        description: 'Backup schedule updated',
        details: { before, after: schedule },
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

  router.post('/create', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      const actor = actorFromSession(session)
      const type = String(req.body?.type || 'manual').trim() || 'manual'
      const backupId = randomUUID()
      const pool = getPgPool()
      await ensureBackupSchema(pool)
      const { meta, data, manifest } = await exportBackupData(pool, { createdBy: actor.id })

      const dateStr = new Date().toISOString().slice(0, 10)
      const downloadName = `backup_manual_${dateStr}.lnbak`
      const diskName = buildLnbakFilename(type)
      const diskPath = path.join(BACKUPS_DIR, diskName)

      const { sizeMb, filePath, files_backed_up, uploads_size_bytes } = await writeLnbakArchiveToPath({
        meta,
        data,
        diskPath,
        manifest,
      })

      await pool.query(
        `INSERT INTO public.backups (id, name, type, status, size_mb, file_path, notes, tables_included, created_by, completed_at, files_backed_up, uploads_size_bytes)
         VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, NOW(), $9, $10)`,
        [
          backupId,
          downloadName.replace('.lnbak', ''),
          type,
          sizeMb,
          filePath,
          req.body?.notes || null,
          LNBAK_TABLE_KEYS,
          actor.id,
          files_backed_up ?? null,
          uploads_size_bytes ?? null,
        ],
      )

      const gdrive = await maybeUploadBackupToDrive({
        backupId,
        filePath,
        filename: downloadName,
        actor,
      })

      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('X-Backup-Id', backupId)
      if (gdrive.uploaded) {
        res.setHeader('X-Backup-GDrive-Status', 'success')
        if (gdrive.link) res.setHeader('X-Backup-GDrive-Link', gdrive.link)
      } else if (gdrive.failed) {
        res.setHeader('X-Backup-GDrive-Status', 'failed')
      } else {
        res.setHeader('X-Backup-GDrive-Status', 'skipped')
      }

      await logBackupAudit(actor, 'BACKUP_CREATED', {
        backupId,
        backupName: downloadName,
        description: `Manual backup "${downloadName}" created and downloaded`,
        details: { tablesCount: LNBAK_TABLE_KEYS.length, sizeMb, files_backed_up, gdrive },
      })

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath)
        stream.on('error', reject)
        res.on('finish', resolve)
        res.on('error', reject)
        stream.pipe(res)
      })
    } catch (e) {
      if (!res.headersSent) {
        sendSafeServerError(res, e, 'POST /api/backup/create')
      }
    }
  })

  router.post('/restore-upload', restoreUpload.single('file'), async (req, res) => {
    let uploadPath = req.file?.path || null
    let actor = null
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      actor = actorFromSession(session)

      if (!uploadPath) {
        validationError(res, 'No backup file uploaded.')
        return
      }

      let opened
      try {
        opened = await readLnbakFromPath(uploadPath)
      } catch (e) {
        validationError(res, String(e?.message || e))
        return
      }

      const { parsed, uploadsBuffer, uploadsPath, manifest, subjectAssetsPath, subjectAssetsBuffer } = opened

      const runRestore = async (onProgress) =>
        runRestorePipeline({
          parsed,
          uploadsSource: uploadsPath || uploadsBuffer,
          subjectAssetsSource: subjectAssetsPath || subjectAssetsBuffer,
          manifest,
          createdBy: actor.id,
          createSafety: true,
          onProgress,
        })

      if (wantsStreamRestore(req)) {
        await executeStreamRestore(
          res,
          async (onProgress) => {
            const restoreDetails = await runRestore(onProgress)
            await logBackupAudit(actor, 'BACKUP_RESTORED', {
              backupId: null,
              backupName: req.file.originalname,
              description: `Data restored from uploaded backup (${req.file.originalname})`,
              details: { restoredAt: new Date().toISOString(), ...restoreDetails },
            })
            return {
              message: 'Restore completed successfully',
              restored_at: new Date().toISOString(),
              ...restoreDetails,
            }
          },
          {
            onError: async (e) => {
              await logRestoreFailure(actor, e, {
                source: 'upload',
                backupName: req.file.originalname,
              })
            },
          },
        )
        return
      }

      const restoreDetails = await runRestore()
      await logBackupAudit(actor, 'BACKUP_RESTORED', {
        backupId: null,
        backupName: req.file.originalname,
        description: `Data restored from uploaded backup (${req.file.originalname})`,
        details: { restoredAt: new Date().toISOString(), ...restoreDetails },
      })

      res.json({
        success: true,
        message: 'Restore completed successfully',
        restored_at: new Date().toISOString(),
        ...restoreDetails,
      })
    } catch (e) {
      if (e?.message === 'Only .lnbak files are accepted') {
        validationError(res, e.message)
        return
      }
      if (e?.code === 'LIMIT_FILE_SIZE') {
        const cap =
          BACKUP_RESTORE_MAX_BYTES > 0
            ? `${Math.round(BACKUP_RESTORE_MAX_BYTES / (1024 * 1024))} MB`
            : 'configured limit'
        validationError(res, `Backup file exceeds ${cap} restore upload limit.`)
        return
      }
      if (actor) {
        await logRestoreFailure(actor, e, {
          source: 'upload',
          backupName: req.file?.originalname || null,
        })
      }
      if (!res.headersSent) {
        sendRestoreError(res, e, 'POST /api/backup/restore-upload')
      }
    } finally {
      if (uploadPath) {
        await fsp.unlink(uploadPath).catch(() => {})
      }
    }
  })

  router.get('/download/:filename', async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return
      const filename = String(req.params.filename || '').trim()
      if (!/^[a-zA-Z0-9_\-\.]+\.lnbak$/.test(filename)) {
        res.status(403).json({ success: false, message: 'Invalid filename' })
        return
      }
      const backupsRoot = path.resolve(BACKUPS_DIR)
      const filePath = path.resolve(path.join(BACKUPS_DIR, filename))
      if (!filePath.startsWith(backupsRoot + path.sep) && filePath !== backupsRoot) {
        res.status(403).json({ success: false, message: 'Access denied' })
        return
      }
      try {
        await fsp.access(filePath, fs.constants.R_OK)
      } catch {
        res.status(404).json({ success: false, message: 'Backup file not found.' })
        return
      }
      res.download(filePath, filename)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup/download/:filename')
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
        tables: tables || LNBAK_TABLE_KEYS,
        createdBy: actor.id,
      })
      await logBackupAudit(actor, 'BACKUP_CREATED', {
        backupId: result.id,
        backupName: result.name,
        description: `Manual backup "${result.name}" created`,
        details: {
          tablesCount: (tables || LNBAK_TABLE_KEYS).length,
          sizeMb: result.size_mb,
        },
      })
      const row = await getBackupById(result.id)
      res.status(201).json({ ok: true, backup: mapBackupRow(row) })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/backup')
    }
  })

  router.post('/:id/upload-to-drive', async (req, res) => {
    try {
      const session = await requireAdmin(req, res)
      if (!session) return
      const actor = actorFromSession(session)
      const row = await getBackupById(req.params.id)
      if (!row?.file_path) {
        res.status(404).json({ success: false, error: 'Backup not found.' })
        return
      }
      if (row.status !== 'completed') {
        res.status(400).json({ success: false, error: 'Only completed backups can be uploaded to Drive.' })
        return
      }
      try {
        await fsp.access(row.file_path, fs.constants.R_OK)
      } catch {
        res.status(404).json({ success: false, error: 'Backup file not found on disk.' })
        return
      }

      const gdrive = await maybeUploadBackupToDrive({
        backupId: row.id,
        filePath: row.file_path,
        filename: path.basename(row.file_path),
        actor,
      })

      if (gdrive.skipped) {
        res.status(400).json({
          success: false,
          error: 'GOOGLE_DRIVE_NOT_CONNECTED',
          message: 'Google Drive is not connected for this admin account.',
        })
        return
      }
      if (gdrive.failed) {
        const status = gdrive.needsReconnect ? 403 : 502
        res.status(status).json({
          success: false,
          error: gdrive.needsReconnect ? 'GOOGLE_DRIVE_NEEDS_RECONNECT' : 'GOOGLE_DRIVE_UPLOAD_FAILED',
          message: gdrive.error || 'Google Drive upload failed.',
          needsReconnect: Boolean(gdrive.needsReconnect),
        })
        return
      }

      const updated = await getBackupById(row.id)
      res.json({
        ok: true,
        gdrive_file_id: gdrive.fileId,
        gdrive_link: gdrive.link,
        backup: mapBackupRow(updated),
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/backup/:id/upload-to-drive')
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
      const filePath = path.resolve(row.file_path)
      const backupsRoot = path.resolve(BACKUPS_DIR)
      if (!filePath.startsWith(backupsRoot + path.sep)) {
        res.status(403).json({ success: false, message: 'Access denied' })
        return
      }
      res.download(filePath, fileName)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/backup/:id/download')
    }
  })

  router.post('/:id/restore', async (req, res) => {
    let actor = null
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
      actor = actorFromSession(session)
      const opened = await readLnbakFromPath(row.file_path)

      const runRestore = async (onProgress) =>
        runRestorePipeline({
          parsed: opened.parsed,
          uploadsSource: opened.uploadsPath || opened.uploadsBuffer,
          subjectAssetsSource: opened.subjectAssetsPath || opened.subjectAssetsBuffer,
          manifest: opened.manifest,
          createdBy: actor.id,
          createSafety: true,
          onProgress,
        })

      if (wantsStreamRestore(req)) {
        await executeStreamRestore(
          res,
          async (onProgress) => {
            const restoreDetails = await runRestore(onProgress)
            await logBackupAudit(actor, 'BACKUP_RESTORED', {
              backupId: row.id,
              backupName: row.name,
              description: `Data restored from backup "${row.name}"`,
              details: { restoredAt: new Date().toISOString(), ...restoreDetails },
            })
            return {
              message: 'Restore completed successfully',
              restored_at: new Date().toISOString(),
              ...restoreDetails,
            }
          },
          {
            onError: async (e) => {
              await logRestoreFailure(actor, e, {
                source: 'history',
                backupId: row.id,
                backupName: row.name,
              })
            },
          },
        )
        return
      }

      const restoreDetails = await runRestore()
      await logBackupAudit(actor, 'BACKUP_RESTORED', {
        backupId: row.id,
        backupName: row.name,
        description: `Data restored from backup "${row.name}"`,
        details: { restoredAt: new Date().toISOString(), ...restoreDetails },
      })
      res.json({
        ok: true,
        success: true,
        message: 'Restore completed successfully',
        restored_at: new Date().toISOString(),
        ...restoreDetails,
      })
    } catch (e) {
      if (actor) {
        await logRestoreFailure(actor, e, {
          source: 'history',
          backupId: req.params.id,
        })
      }
      sendRestoreError(res, e, 'POST /api/backup/:id/restore')
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
        tables: existing.tables_included || LNBAK_TABLE_KEYS,
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
