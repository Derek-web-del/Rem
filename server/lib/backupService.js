import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { getPgPool } from '../pgPool.js'
import { ensureBackupSchema } from './backupSchema.js'
import {
  BACKUP_TABLE_REGISTRY,
  DEFAULT_BACKUP_TABLE_KEYS,
  normalizeBackupTableKeys,
} from './backupTables.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const BACKUPS_DIR = path.join(__dirname, '..', 'backups')

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
  }
}

export async function listBackups() {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const { rows } = await pool.query(
    `SELECT id, name, type, status, size_mb, notes, tables_included, created_by, created_at, completed_at, error_message
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

export async function createBackupSnapshot(tableKeys, backupId) {
  const pool = getPgPool()
  const keys = normalizeBackupTableKeys(tableKeys)
  const snapshot = {
    version: 1,
    backupId,
    createdAt: new Date().toISOString(),
    tables: {},
  }

  for (const key of keys) {
    const reg = BACKUP_TABLE_REGISTRY[key]
    if (!reg) continue
    if (!(await tableExists(pool, reg))) {
      snapshot.tables[key] = { skipped: true, reason: 'table_not_found', rows: [] }
      continue
    }
    try {
      const orderBy = reg.orderBy || '1'
      const { rows } = await pool.query(`SELECT * FROM ${reg.fromSql} ORDER BY ${orderBy} ASC`)
      snapshot.tables[key] = {
        rowCount: rows.length,
        rows: rows.map(rowToJson),
      }
    } catch (e) {
      snapshot.tables[key] = { skipped: true, reason: String(e?.message || e), rows: [] }
    }
  }

  await fs.mkdir(BACKUPS_DIR, { recursive: true })
  const fileName = `${backupId}_${Date.now()}.json`
  const filePath = path.join(BACKUPS_DIR, fileName)
  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8')
  const stats = await fs.stat(filePath)
  const sizeMb = Number((stats.size / (1024 * 1024)).toFixed(2))
  return { filePath, fileName, sizeMb }
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
  const raw = await fs.readFile(filePath, 'utf8')
  const snapshot = JSON.parse(raw)
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
}

export async function runBackupJob({
  name,
  type = 'manual',
  notes = '',
  tables = DEFAULT_BACKUP_TABLE_KEYS,
  createdBy = null,
  backupId = randomUUID(),
}) {
  const pool = getPgPool()
  await ensureBackupSchema(pool)
  const tableList = normalizeBackupTableKeys(tables)
  const displayName =
    String(name || '').trim() ||
    `backup_${type}_${new Date().toISOString().slice(0, 10)}`

  await pool.query(
    `INSERT INTO public.backups (id, name, type, status, notes, tables_included, created_by)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
    [backupId, displayName, type, notes || null, tableList, createdBy],
  )

  try {
    const { filePath, sizeMb } = await createBackupSnapshot(tableList, backupId)
    await pool.query(
      `UPDATE public.backups
       SET status = 'completed', size_mb = $2, file_path = $3, completed_at = NOW(), error_message = NULL
       WHERE id = $1`,
      [backupId, sizeMb, filePath],
    )
    return { id: backupId, name: displayName, status: 'completed', size_mb: sizeMb, file_path: filePath }
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
