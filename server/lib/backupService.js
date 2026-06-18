import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getPgPool } from '../pgPool.js'
import { ensureBackupSchema } from './backupSchema.js'
import {
  BACKUP_TABLE_REGISTRY,
  DEFAULT_BACKUP_TABLE_KEYS,
  normalizeBackupTableKeys,
  LNBAK_TABLE_KEYS,
} from './backupTables.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import {
  BACKUPS_DIR,
  buildLnbakFilename,
  ensureBackupsDirectory,
  exportBackupData,
  writeLnbakArchiveToPath,
} from './lnbakEngine.js'

export { BACKUPS_DIR }

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

function rowToJson(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString()
    else if (Buffer.isBuffer(v)) out[k] = v.toString('base64')
    else out[k] = v
  }
  return out
}

async function tableExists(pool, reg) {
  const from = reg.fromSql
  const m = from.match(/^"([^"]+)"$/)
  if (m) {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [m[1]],
    )
    return rows.length > 0
  }
  const parts = from.split('.')
  const schema = parts.length > 1 ? parts[0] : 'public'
  const table = parts.length > 1 ? parts[1] : parts[0]
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table],
  )
  return rows.length > 0
}

export function mapBackupRow(row) {
  if (!row) return null
  const filePath = row.file_path ? String(row.file_path) : null
  return {
    id: String(row.id),
    name: String(row.name || ''),
    type: String(row.type || 'manual'),
    size_mb: row.size_mb != null ? Number(row.size_mb) : null,
    status: String(row.status || 'pending'),
    notes: row.notes ? String(row.notes) : '',
    tables_included: Array.isArray(row.tables_included) ? row.tables_included : [],
    created_at: row.created_at,
    completed_at: row.completed_at,
    created_by: row.created_by ? String(row.created_by) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    file_path: filePath,
    filename: filePath ? path.basename(filePath) : null,
    table_count: Array.isArray(row.tables_included) ? row.tables_included.length : LNBAK_TABLE_KEYS.length,
    files_backed_up: row.files_backed_up != null ? Number(row.files_backed_up) : null,
    uploads_size_bytes: row.uploads_size_bytes != null ? Number(row.uploads_size_bytes) : null,
    gdrive_file_id: row.gdrive_file_id ? String(row.gdrive_file_id) : null,
    gdrive_link: row.gdrive_link ? String(row.gdrive_link) : null,
    gdrive_uploaded_at: row.gdrive_uploaded_at || null,
  }
}

export async function listBackups() {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const { rows } = await pool.query(
    `SELECT id, name, type, status, size_mb, notes, tables_included, file_path, created_by, created_at, completed_at, error_message,
            files_backed_up, uploads_size_bytes,
            gdrive_file_id, gdrive_link, gdrive_uploaded_at
     FROM public.backups ORDER BY created_at DESC`,
  )
  return rows.map(mapBackupRow)
}

export async function getBackupById(backupId) {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const { rows } = await pool.query(`SELECT * FROM public.backups WHERE id = $1`, [backupId])
  return rows[0] || null
}

export async function getBackupStats() {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COALESCE(SUM(size_mb) FILTER (WHERE status = 'completed'), 0)::float AS storage_mb,
      MAX(completed_at) FILTER (WHERE status = 'completed') AS last_completed
    FROM public.backups
  `)
  const r = rows[0] || {}
  const total = Number(r.total || 0)
  const completed = Number(r.completed || 0)
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 100
  return {
    total,
    completed,
    failed: Number(r.failed || 0),
    storageMb: Number(r.storage_mb || 0),
    lastCompleted: r.last_completed || null,
    successRate,
  }
}

async function insertRow(client, reg, row) {
  const keys = Object.keys(row)
  if (!keys.length) return
  const cols = keys.map(quoteIdent).join(', ')
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  const values = keys.map((k) => row[k])
  await client.query(`INSERT INTO ${reg.fromSql} (${cols}) VALUES (${placeholders})`, values)
}

export async function restoreFromBackupFile(filePath, tableKeys = null) {
  const pool = getPgPool()
  const header = Buffer.alloc(2)
  const fd = await fs.open(filePath, 'r')
  try {
    await fd.read(header, 0, 2, 0)
  } finally {
    await fd.close()
  }
  const isZip = header[0] === 0x50 && header[1] === 0x4b
  if (isZip) {
    const { readLnbakFromPath, runRestorePipeline } = await import('./lnbakEngine.js')
    const opened = await readLnbakFromPath(filePath)
    return runRestorePipeline({
      parsed: opened.parsed,
      uploadsSource: opened.uploadsPath || opened.uploadsBuffer,
      subjectAssetsSource: opened.subjectAssetsPath || opened.subjectAssetsBuffer,
      manifest: opened.manifest,
      createSafety: false,
    })
  }

  const raw = await fs.readFile(filePath)
  const snapshot = JSON.parse(raw.toString('utf8'))
  const keys =
    tableKeys && tableKeys.length
      ? normalizeBackupTableKeys(tableKeys)
      : Object.keys(snapshot.tables || {}).filter((k) => BACKUP_TABLE_REGISTRY[k])

  const deleteSorted = [...keys].sort(
    (a, b) => (BACKUP_TABLE_REGISTRY[b]?.deleteOrder || 0) - (BACKUP_TABLE_REGISTRY[a]?.deleteOrder || 0),
  )
  const insertSorted = [...keys].sort(
    (a, b) => (BACKUP_TABLE_REGISTRY[a]?.insertOrder || 0) - (BACKUP_TABLE_REGISTRY[b]?.insertOrder || 0),
  )

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const key of deleteSorted) {
      const reg = BACKUP_TABLE_REGISTRY[key]
      if (!reg) continue
      if (!(await tableExists(pool, reg))) continue
      await client.query(`DELETE FROM ${reg.fromSql}`)
    }
    for (const key of insertSorted) {
      const reg = BACKUP_TABLE_REGISTRY[key]
      const block = snapshot.tables?.[key]
      if (!reg || !block || block.skipped) continue
      const rows = Array.isArray(block.rows) ? block.rows : []
      for (const row of rows) {
        await insertRow(client, reg, row)
      }
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  return {}
}

export async function runBackupJob({
  name,
  type = 'manual',
  notes = '',
  tables = LNBAK_TABLE_KEYS,
  createdBy = null,
  backupId = randomUUID(),
}) {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  ensureBackupsDirectory()
  const tableList = normalizeBackupTableKeys(tables.length ? tables : LNBAK_TABLE_KEYS)
  const displayName =
    String(name || '').trim() || buildLnbakFilename(type).replace('.lnbak', '')

  await pool.query(
    `INSERT INTO public.backups (id, name, type, status, notes, tables_included, created_by)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
    [backupId, displayName, type, notes || null, tableList, createdBy],
  )

  try {
    const { meta, data, manifest } = await exportBackupData(pool, { createdBy })
    const filename = buildLnbakFilename(type)
    const filePath = path.join(BACKUPS_DIR, filename)
    const { sizeMb, files_backed_up, uploads_size_bytes } = await writeLnbakArchiveToPath({
      meta,
      data,
      diskPath: filePath,
      manifest,
    })
    await pool.query(
      `UPDATE public.backups
       SET status = 'completed', size_mb = $2, file_path = $3, completed_at = NOW(), error_message = NULL,
           files_backed_up = $4, uploads_size_bytes = $5
       WHERE id = $1`,
      [backupId, sizeMb, filePath, files_backed_up ?? null, uploads_size_bytes ?? null],
    )

    let gdrive = { uploaded: false, skipped: true, failed: false }
    let driveActor = createdBy
      ? { id: createdBy, name: 'Administrator', email: '' }
      : null
    if (!driveActor) {
      const { findConnectedDriveAdminActor } = await import('./googleDriveUpload.js')
      const connectedAdmin = await findConnectedDriveAdminActor()
      if (connectedAdmin?.id) {
        driveActor = {
          id: connectedAdmin.id,
          name: 'Administrator',
          email: connectedAdmin.email || '',
        }
      }
    }
    if (driveActor?.id) {
      gdrive = await maybeUploadBackupToDrive({
        backupId,
        filePath,
        filename: path.basename(filePath),
        actor: driveActor,
      })
    }

    return {
      id: backupId,
      name: displayName,
      status: 'completed',
      size_mb: sizeMb,
      file_path: filePath,
      filename: path.basename(filePath),
      files_backed_up,
      uploads_size_bytes,
      gdrive,
    }
  } catch (e) {
    await pool.query(
      `UPDATE public.backups SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1`,
      [backupId, String(e?.message || e)],
    )
    throw e
  }
}

export async function deleteBackupRecord(backupId) {
  const pool = getPgPool()
  const row = await getBackupById(backupId)
  if (!row) return null
  if (row.file_path) {
    try {
      await fs.unlink(row.file_path)
    } catch {
      /* ignore missing file */
    }
  }
  await pool.query(`DELETE FROM public.backups WHERE id = $1`, [backupId])
  return row
}

export async function getScheduleSettings() {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const { rows } = await pool.query(`SELECT * FROM public.backup_schedules ORDER BY frequency`)
  const out = {
    daily: { active: true, time: '02:00:00', last_run: null, next_run: null },
    weekly: { active: false, time: '01:00:00', last_run: null, next_run: null },
    monthly: { active: false, time: '00:00:00', last_run: null, next_run: null },
  }
  for (const r of rows) {
    const f = String(r.frequency || '').toLowerCase()
    if (!out[f]) continue
    out[f] = {
      active: Boolean(r.is_active),
      time: String(r.time_of_day || '').slice(0, 8),
      last_run: r.last_run,
      next_run: r.next_run,
    }
  }
  return out
}

export async function updateScheduleSettings({ daily, weekly, monthly }) {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const map = { daily, weekly, monthly }
  for (const [frequency, active] of Object.entries(map)) {
    if (typeof active !== 'boolean') continue
    await pool.query(
      `UPDATE public.backup_schedules SET is_active = $2 WHERE frequency = $1`,
      [frequency, active],
    )
  }
  return getScheduleSettings()
}

export async function logBackupAudit(actor, activityType, payload) {
  const actorId = String(actor?.id || 'system').trim() || 'system'
  await customActivityLogger.logBackupEvent(actorId, activityType, {
    actorName: String(actor?.name || 'Administrator').trim(),
    actorEmail: String(actor?.email || '').trim(),
    actorRole: 'admin',
    ...payload,
  })
}

/**
 * Upload backup to Google Drive when the user has connected tokens.
 * @returns {Promise<{ uploaded: boolean, skipped: boolean, failed: boolean, fileId?: string, link?: string, error?: string }>}
 */
export async function maybeUploadBackupToDrive({ backupId, filePath, filename, actor }) {
  const userId = String(actor?.id || '').trim()
  if (!userId || !backupId || !filePath) {
    return { uploaded: false, skipped: true, failed: false }
  }

  try {
    const { getTokenStatusForUser, uploadBackupToDrive, isGoogleDriveConfigured } = await import(
      './googleDriveUpload.js'
    )
    if (!isGoogleDriveConfigured()) {
      return { uploaded: false, skipped: true, failed: false }
    }
    const tokenStatus = await getTokenStatusForUser(userId)
    if (!tokenStatus.connected) {
      return { uploaded: false, skipped: true, failed: false }
    }
    if (tokenStatus.needsReconnect) {
      return {
        uploaded: false,
        skipped: false,
        failed: true,
        needsReconnect: true,
        error:
          'Google Drive permissions are outdated. Disconnect and reconnect Google Drive, then retry upload.',
      }
    }

    const result = await uploadBackupToDrive({
      userId,
      filePath,
      filename: filename || path.basename(filePath),
    })
    if (!result?.fileId) {
      return { uploaded: false, skipped: false, failed: true, error: 'Upload returned no file id' }
    }

    const pool = getPgPool()
    await pool.query(
      `UPDATE public.backups
       SET gdrive_file_id = $2, gdrive_link = $3, gdrive_uploaded_at = NOW()
       WHERE id = $1`,
      [backupId, result.fileId, result.link],
    )

    await logBackupAudit(actor, 'backup_uploaded_to_gdrive', {
      backupId,
      description: `Backup uploaded to Google Drive`,
      details: { fileId: result.fileId, link: result.link },
    })

    return { uploaded: true, skipped: false, failed: false, fileId: result.fileId, link: result.link }
  } catch (e) {
    console.warn('[backup] Google Drive upload failed:', e?.message || e)
    const { isInsufficientScopeError } = await import('./googleDriveUpload.js')
    const msg = String(e?.message || e)
    const needsReconnect =
      msg.includes('GOOGLE_DRIVE_NEEDS_RECONNECT') || isInsufficientScopeError(e)
    return {
      uploaded: false,
      skipped: false,
      failed: true,
      needsReconnect,
      error: needsReconnect
        ? 'Google Drive permissions are outdated. Disconnect and reconnect Google Drive, then retry upload.'
        : msg,
    }
  }
}
