import cron from 'node-cron'
import { isBackupDbConfigured } from '../lib/backupSchema.js'
import { runBackupJob } from '../lib/backupService.js'
import { DEFAULT_BACKUP_TABLE_KEYS } from '../lib/backupTables.js'
import { getPgPool } from '../pgPool.js'

let started = false
/** @type {import('node-cron').ScheduledTask[]} */
const scheduledTasks = []

async function isScheduleActive(frequency) {
  const pool = getPgPool()
  if (!pool) return false
  const { rows } = await pool.query(
    `SELECT is_active FROM public.backup_schedules WHERE frequency = $1 LIMIT 1`,
    [frequency],
  )
  return Boolean(rows[0]?.is_active)
}

async function markScheduleRun(frequency) {
  const pool = getPgPool()
  if (!pool) return
  await pool.query(
    `UPDATE public.backup_schedules SET last_run = NOW(), next_run = NOW() + interval '1 day' WHERE frequency = $1`,
    [frequency],
  )
}

export async function createAutoBackup(frequency) {
  if (!isBackupDbConfigured()) return
  const active = await isScheduleActive(frequency)
  if (!active) return

  const name = `backup_auto_${frequency}_${new Date().toISOString().slice(0, 10)}`
  console.log(`[BACKUP] Running ${frequency} auto backup: ${name}`)
  try {
    await runBackupJob({
      name,
      type: frequency,
      notes: `Scheduled ${frequency} backup`,
      tables: DEFAULT_BACKUP_TABLE_KEYS,
      createdBy: null,
    })
    await markScheduleRun(frequency)
    console.log(`[BACKUP] ${frequency} backup completed:`, name)
  } catch (e) {
    console.error(`[BACKUP] ${frequency} backup failed:`, e?.message || e)
  }
}

export function stopBackupScheduler() {
  for (const task of scheduledTasks) {
    try {
      task.stop()
    } catch {
      /* ignore */
    }
  }
  scheduledTasks.length = 0
  started = false
}

export function startBackupScheduler() {
  if (started || !isBackupDbConfigured()) return
  if (process.env.NODE_ENV === 'test') return
  started = true

  scheduledTasks.push(
    cron.schedule('0 2 * * *', () => {
      void createAutoBackup('daily')
    }),
  )

  scheduledTasks.push(
    cron.schedule('0 1 * * 0', () => {
      void createAutoBackup('weekly')
    }),
  )

  scheduledTasks.push(
    cron.schedule('0 0 1 * *', () => {
      void createAutoBackup('monthly')
    }),
  )

  console.log('[BACKUP] Scheduler started (daily 02:00, weekly Sun 01:00, monthly 1st 00:00)')
}

export default { createAutoBackup, startBackupScheduler, stopBackupScheduler }
