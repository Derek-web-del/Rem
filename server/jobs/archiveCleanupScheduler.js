import cron from 'node-cron'
import { getPgPool } from '../pgPool.js'
import {
  auditSystemEvent,
  ARCHIVE_RETENTION_DAYS,
  computeArchiveRetention,
  purgeFacultyFromAppStateJson,
  FACULTIES_FROM,
} from '../api/state/shared.js'
import { studentDisplayName, decryptStudentPiiFields } from '../lib/studentPiiCrypto.js'

let started = false
/** @type {import('node-cron').ScheduledTask[]} */
const scheduledTasks = []

async function safeCount(pool, sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params)
    return Number(rows[0]?.c ?? 0)
  } catch {
    return 0
  }
}

async function hasRecentSystemEvent(pool, activityType, recordId, withinDays = 8) {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM public.lms_activity_logs
       WHERE "activityType" = $1
         AND "resourceId" = $2
         AND "timestamp"::timestamptz >= NOW() - ($3::text || ' days')::interval
       LIMIT 1`,
      [activityType, String(recordId), String(withinDays)],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

async function buildStudentDataSummary(pool, studentId) {
  const [assignment_submissions, activity_submissions, quiz_submissions] = await Promise.all([
    safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM public.assignment_submissions WHERE student_id = $1`,
      [studentId],
    ),
    safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM public.activity_submissions WHERE student_id = $1`,
      [studentId],
    ),
    safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM public.quiz_submissions WHERE student_id = $1`,
      [studentId],
    ),
  ])
  return { assignment_submissions, activity_submissions, quiz_submissions }
}

async function buildFacultyDataSummary(pool, facultyId) {
  const [assignments, activities, study_materials, announcements, quizzes] = await Promise.all([
    safeCount(pool, `SELECT COUNT(*)::int AS c FROM public.assignments WHERE faculty_id::text = $1`, [
      facultyId,
    ]),
    safeCount(pool, `SELECT COUNT(*)::int AS c FROM public.activities WHERE faculty_id::text = $1`, [
      facultyId,
    ]),
    safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM public.study_materials WHERE uploaded_by::text = $1`,
      [facultyId],
    ),
    safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM public.announcements WHERE uploaded_by::text = $1`,
      [facultyId],
    ),
    safeCount(pool, `SELECT COUNT(*)::int AS c FROM public.quizzes WHERE created_by::text = $1`, [
      facultyId,
    ]),
  ])
  return { assignments, activities, study_materials, announcements, quizzes }
}

function facultyDisplayName(row) {
  return (
    String(row?.name || '').trim() ||
    studentDisplayName(row) ||
    `Faculty #${row?.id || ''}`
  )
}

function formatArchivedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown date'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

async function fetchArchivedStudents(pool) {
  const { rows } = await pool.query(`
    SELECT id, first_name, middle_name, last_name, archived_at
    FROM public.students
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at ASC
  `)
  return rows.map((r) => {
    const decrypted = decryptStudentPiiFields(r)
    return {
      type: 'students',
      recordType: 'student',
      role: 'student',
      id: decrypted.id,
      name: studentDisplayName(decrypted) || `Student #${decrypted.id}`,
      archived_at: decrypted.archived_at,
    }
  })
}

async function fetchArchivedFaculties(pool) {
  const { rows } = await pool.query(`
    SELECT id, name, first_name, middle_name, last_name, archived_at ${FACULTIES_FROM}
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at ASC
  `)
  return rows.map((r) => ({
    type: 'faculties',
    recordType: 'faculty',
    role: 'faculty',
    id: String(r.id),
    name: facultyDisplayName(r),
    archived_at: r.archived_at,
  }))
}

async function logPurgeWarning(pool, record, daysLeft) {
  const recordId = String(record.id)
  if (await hasRecentSystemEvent(pool, 'ACCOUNT_AUTO_PURGE_WARNING', recordId)) return
  const archivedLabel = formatArchivedAt(record.archived_at)
  await auditSystemEvent('ACCOUNT_AUTO_PURGE_WARNING', {
    recordType: record.recordType,
    recordId,
    description: `Account ${record.name} will be permanently deleted in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (archived on ${archivedLabel}). Create a backup to preserve records.`,
    details: {
      record_type: record.recordType,
      record_id: recordId,
      record_name: record.name,
      role: record.role,
      archived_at:
        record.archived_at instanceof Date
          ? record.archived_at.toISOString()
          : record.archived_at,
      days_until_deletion: daysLeft,
      event_type: 'ACCOUNT_AUTO_PURGE_WARNING',
    },
  })
}

async function logPurgeDryRun(pool, record, dataSummary) {
  const recordId = String(record.id)
  if (await hasRecentSystemEvent(pool, 'ACCOUNT_AUTO_PURGE_DRY_RUN', recordId)) return
  const archivedLabel = formatArchivedAt(record.archived_at)
  await auditSystemEvent('ACCOUNT_AUTO_PURGE_DRY_RUN', {
    recordType: record.recordType,
    recordId,
    description: `Dry-run: Account ${record.name} (archived on ${archivedLabel}) will be permanently auto-deleted tomorrow.`,
    details: {
      record_type: record.recordType,
      record_id: recordId,
      record_name: record.name,
      role: record.role,
      archived_at:
        record.archived_at instanceof Date
          ? record.archived_at.toISOString()
          : record.archived_at,
      deletion_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      data_summary: dataSummary,
      event_type: 'ACCOUNT_AUTO_PURGE_DRY_RUN',
    },
  })
}

async function autoPurgeRecord(pool, record) {
  const recordId = String(record.id)
  const archivedAt =
    record.archived_at instanceof Date
      ? record.archived_at.toISOString()
      : record.archived_at ?? null
  const dataSummary =
    record.type === 'students'
      ? await buildStudentDataSummary(pool, record.id)
      : await buildFacultyDataSummary(pool, recordId)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (record.type === 'faculties') {
      await client.query('DELETE FROM public.faculties WHERE id = $1', [recordId])
      await purgeFacultyFromAppStateJson(client, recordId)
    } else {
      await client.query('DELETE FROM public.students WHERE id = $1', [record.id])
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }

  await auditSystemEvent('ACCOUNT_AUTO_PURGED', {
    recordType: record.recordType,
    recordId,
    description: `Account permanently deleted after ${ARCHIVE_RETENTION_DAYS}-day archive retention period: ${record.name}`,
    details: {
      record_type: record.recordType,
      record_id: recordId,
      record_name: record.name,
      role: record.role,
      archived_at: archivedAt,
      deletion_date: new Date().toISOString(),
      data_summary: dataSummary,
      event_type: 'ACCOUNT_AUTO_PURGED',
    },
  })
}

export async function runArchiveCleanupJob() {
  const pool = getPgPool()
  if (!pool) {
    console.warn('[ARCHIVE-CLEANUP] Skipped — no database pool')
    return
  }

  const [students, faculties] = await Promise.all([
    fetchArchivedStudents(pool),
    fetchArchivedFaculties(pool),
  ])
  const records = [...students, ...faculties]

  let warnings = 0
  let dryRuns = 0
  let purged = 0
  let failed = 0

  for (const record of records) {
    const { days_until_deletion } = computeArchiveRetention(record.archived_at)

    if (days_until_deletion >= 1 && days_until_deletion <= 7) {
      try {
        await logPurgeWarning(pool, record, days_until_deletion)
        warnings++
      } catch (e) {
        console.error('[ARCHIVE-CLEANUP] Warning log failed:', record.id, e?.message || e)
      }
    }

    if (days_until_deletion === 1) {
      try {
        const dataSummary =
          record.type === 'students'
            ? await buildStudentDataSummary(pool, record.id)
            : await buildFacultyDataSummary(pool, String(record.id))
        await logPurgeDryRun(pool, record, dataSummary)
        dryRuns++
      } catch (e) {
        console.error('[ARCHIVE-CLEANUP] Dry-run log failed:', record.id, e?.message || e)
      }
    }

    if (days_until_deletion <= 0) {
      try {
        await autoPurgeRecord(pool, record)
        purged++
        console.log(`[ARCHIVE-CLEANUP] Auto-purged ${record.type} ${record.id} (${record.name})`)
      } catch (e) {
        failed++
        console.error('[ARCHIVE-CLEANUP] Auto-purge failed:', record.id, e?.message || e)
      }
    }
  }

  console.log(
    `[ARCHIVE-CLEANUP] Completed — scanned ${records.length}, warnings ${warnings}, dry-runs ${dryRuns}, purged ${purged}, failed ${failed}`,
  )
}

export function stopArchiveCleanupScheduler() {
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

export function startArchiveCleanupScheduler() {
  // Auto-purge after retention period disabled — archived accounts are kept indefinitely.
  if (started) return
  started = true
}

export default {
  runArchiveCleanupJob,
  startArchiveCleanupScheduler,
  stopArchiveCleanupScheduler,
}
