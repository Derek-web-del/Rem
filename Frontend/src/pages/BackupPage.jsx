import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BackButton from '../components/BackButton.jsx'
import { useNotify } from '../components/notifications.jsx'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { dispatchAuditLogsRefresh, dispatchBackupRestored } from '../lib/auditLogRefresh.js'

const ACTION_BLUE = '#1e4fa3'

const BACKUP_CHECKLIST = [
  'Students + grades',
  'Curriculum + curriculum guides',
  'Faculties + profiles',
  'Subjects',
  'Sections + advisories',
  'Announcements',
  'Assignments + submissions',
  'Audit logs + LMS activity logs',
  'Activities + submissions',
  'Quiz results + password access grants',
  'Study materials',
  'Teacher/admin auth users + login credentials (account table)',
  'Institute app_state snapshot (curriculum UI blob)',
  'All uploaded files (PDFs, photos, submissions)',
]

const RESTORE_STEPS = [
  'Validating backup file',
  'Creating safety snapshot',
  'Restoring database',
  'Restoring uploaded files',
  'Verifying file integrity',
  'Complete',
]

function formatRestoreErrorMessage(errOrPayload) {
  const p = errOrPayload?.restoreDetails || errOrPayload || {}
  const failedTable = p.failed_table || p.failedTable
  const reason = p.reason || p.constraint || null
  const detail = p.detail || p.message || String(errOrPayload?.message || errOrPayload || 'Restore failed')
  const lines = ['Restore failed', '']
  if (failedTable) lines.push(`Failed at: ${failedTable}`)
  if (reason) lines.push(`Reason: ${reason}`)
  else if (detail && !failedTable) lines.push(`Reason: ${detail}`)
  else if (detail && detail !== reason) lines.push(`Detail: ${detail}`)
  lines.push('')
  lines.push(
    p.hint ||
      'Your database was automatically rolled back. No data was lost. Try again or contact support.',
  )
  return lines.join('\n')
}

function RestoreErrorPanel({ error, onDismiss }) {
  if (!error) return null
  const failedTable = error.failed_table || error.failedTable
  const reason = error.reason || error.constraint || error.detail || error.message
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-semibold">Restore failed</p>
      {failedTable ? (
        <p className="mt-2">
          <span className="font-medium">Failed at:</span> {failedTable}
        </p>
      ) : null}
      {reason ? (
        <p className="mt-1">
          <span className="font-medium">Reason:</span> {String(reason)}
        </p>
      ) : null}
      <p className="mt-2 text-red-800">
        {error.hint ||
          'Your database was automatically rolled back. No data was lost. Try again or contact support.'}
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-800"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

function attachRestoreErrorDetails(err, event) {
  const e = new Error(String(event?.message || err?.message || 'Restore failed'))
  e.failed_table = event?.failed_table ?? null
  e.constraint = event?.constraint ?? null
  e.pg_code = event?.pg_code ?? null
  e.reason = event?.reason ?? null
  e.detail = event?.detail ?? null
  e.hint = event?.hint ?? null
  e.rolled_back = event?.rolled_back !== false
  return e
}

async function runStreamRestore(url, { method = 'POST', body = null, onStep } = {}) {
  const headers = { Accept: 'application/x-ndjson' }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body,
  })
  if (!res.ok && !res.body) {
    const err = await res.json().catch(() => ({}))
    throw attachRestoreErrorDetails(new Error(), err)
  }
  if (!res.body) {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw attachRestoreErrorDetails(new Error(), data)
    return data
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastStep = 0
  let finalResult = null
  let streamError = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event
      try {
        event = JSON.parse(trimmed)
      } catch {
        continue
      }
      if (event.type === 'progress' && typeof event.step === 'number') {
        lastStep = event.step
        if (onStep) onStep(event.step, event)
      } else if (event.type === 'complete') {
        finalResult = event
      } else if (event.type === 'error') {
        streamError = attachRestoreErrorDetails(new Error(), event)
      }
    }
  }

  if (streamError) throw streamError
  if (!res.ok && !finalResult) {
    throw new Error(`Restore failed (${res.status})`)
  }
  return { ...(finalResult || {}), _lastStep: lastStep }
}

function formatRelativeTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`
  return d.toLocaleDateString()
}

function formatStorage(mb) {
  const n = Number(mb || 0)
  if (n >= 1024) return `${(n / 1024).toFixed(2)} GB`
  return `${n.toFixed(2)} MB`
}

function formatBackupDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFileSize(bytes) {
  const n = Number(bytes || 0)
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function googleDriveConnectErrorMessage(reason) {
  switch (String(reason || '').trim()) {
    case 'invalid_state':
      return 'Google sign-in session expired. Open LenLearn at the same URL as BETTER_AUTH_URL (e.g. http://localhost:5173) and try again.'
    case 'exchange_failed':
      return 'Google token exchange failed. Check GOOGLE_CLIENT_SECRET, server logs, and that the redirect URI in Google Cloud matches diagnostics below.'
    case 'denied':
      return 'Google sign-in was cancelled. Click Connect Google Drive and choose Allow.'
    case 'not_configured':
      return 'Google Drive OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.'
    default:
      return 'Could not connect Google Drive. Please try again.'
  }
}

function warningMatches(text, patterns) {
  const s = String(text).toLowerCase()
  return patterns.some((p) => s.includes(p))
}

/** Red-banner hints when a module looks empty after restore. */
function moduleRestoreWarnings(result) {
  if (!result) return []
  const warnings = []
  const restoreWarnings = result.restore_warnings || []

  if (Number(result.faculties_restored ?? -1) === 0) {
    warnings.push({
      key: 'faculty',
      message:
        'Faculty roster shows 0 active profiles after restore. The backup may not have included faculty data, or you may need to refresh the dashboard.',
    })
  } else if (
    restoreWarnings.some((w) =>
      warningMatches(w, ['no faculty', 'faculty roster', 'faculties and no app_state']),
    )
  ) {
    warnings.push({
      key: 'faculty',
      message: 'Faculty roster warnings were reported for this backup — verify the Faculties page.',
    })
  }

  const studentsPg = Number(result.students_restored ?? result.row_counts?.students ?? -1)
  if (studentsPg === 0) {
    warnings.push({
      key: 'students',
      message:
        'Student roster shows 0 active students after restore. The backup may not have included student rows.',
    })
  } else if (restoreWarnings.some((w) => warningMatches(w, ['no student roster', 'students page may be empty']))) {
    warnings.push({
      key: 'students',
      message: 'Student roster warnings were reported for this backup — verify the Students page.',
    })
  }

  const sectionsPg = Number(result.sections_restored ?? result.row_counts?.sections ?? -1)
  const sectionsState = Number(result.sections_in_app_state ?? -1)
  if (sectionsPg === 0 && sectionsState === 0) {
    warnings.push({
      key: 'sections',
      message:
        'Sections show 0 rows in PostgreSQL and app_state — institute sections may be empty after restore.',
    })
  } else if (restoreWarnings.some((w) => warningMatches(w, ['no section rows', 'sections may be empty']))) {
    warnings.push({
      key: 'sections',
      message: 'Section warnings were reported for this backup — verify Sections on the dashboard.',
    })
  }

  const subjectsPg = Number(result.subjects_restored ?? result.row_counts?.subjects ?? -1)
  if (subjectsPg === 0) {
    warnings.push({
      key: 'subjects',
      message: 'Subjects list shows 0 rows after restore. The backup may not have included subject catalog data.',
    })
  } else if (restoreWarnings.some((w) => warningMatches(w, ['no subject rows', 'subjects list may be empty']))) {
    warnings.push({
      key: 'subjects',
      message: 'Subject warnings were reported for this backup — verify the Subjects page.',
    })
  }

  const curriculumPg = Number(result.curriculum_rows_restored ?? result.row_counts?.curriculum ?? -1)
  const curriculumState = Number(result.curriculums_in_app_state ?? -1)
  if (curriculumPg === 0 && curriculumState === 0) {
    warnings.push({
      key: 'curriculum',
      message:
        'Curriculum shows 0 rows in PostgreSQL and app_state — the Curriculum page may be empty after restore.',
    })
  } else if (
    restoreWarnings.some(
      (w) => warningMatches(w, ['curriculum']) && warningMatches(w, ['empty', '0 rows', 'no curriculum']),
    )
  ) {
    warnings.push({
      key: 'curriculum',
      message: 'Curriculum warnings were reported for this backup — verify the Curriculum page.',
    })
  }

  return warnings
}

function typeLabel(type) {
  const t = String(type || 'manual').toLowerCase()
  if (t === 'manual') return 'Manual'
  if (t === 'daily') return 'Auto · Daily'
  if (t === 'weekly') return 'Auto · Weekly'
  if (t === 'monthly') return 'Auto · Monthly'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status}).`))
  }
  return data
}

function SummaryCard({ title, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
      {sub ? <p className="mt-1 text-sm text-neutral-500">{sub}</p> : null}
    </div>
  )
}

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed') {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
        Completed
      </span>
    )
  }
  if (s === 'failed') {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      {status || 'Pending'}
    </span>
  )
}

export default function BackupPage() {
  const navigate = useNavigate()
  const toast = useNotify()
  const fileRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [backups, setBackups] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    storageMb: 0,
    lastCompleted: null,
    successRate: 100,
  })
  const [schedule, setSchedule] = useState({
    daily: { active: true },
    weekly: { active: false },
    monthly: { active: false },
  })
  const [scheduleSaving, setScheduleSaving] = useState('')
  const [actionId, setActionId] = useState('')
  const [creating, setCreating] = useState(false)
  const [driveStatus, setDriveStatus] = useState({
    connected: false,
    email: null,
    loading: true,
    needsReconnect: false,
  })
  const [driveDiagnostics, setDriveDiagnostics] = useState(null)
  const [driveAction, setDriveAction] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()

  const [droppedFile, setDroppedFile] = useState(null)
  const [restoreFailure, setRestoreFailure] = useState(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreStep, setRestoreStep] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [restoreResult, setRestoreResult] = useState(null)

  const [restoreTarget, setRestoreTarget] = useState(null)
  const [historyRestoreConfirm, setHistoryRestoreConfirm] = useState('')
  const [historyRestoreSubmitting, setHistoryRestoreSubmitting] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [mainRes, schedRes] = await Promise.all([
        fetch(apiUrl('/api/backup'), { credentials: 'include' }),
        fetch(apiUrl('/api/backup/schedule'), { credentials: 'include' }),
      ])
      const main = await readJson(mainRes)
      const sched = await readJson(schedRes)
      setBackups(Array.isArray(main.backups) ? main.backups : [])
      setStats(main.stats || {})
      setSchedule(sched.schedule || schedule)
    } catch (e) {
      setLoadError(String(e?.message || e || 'Could not load backups.'))
      setBackups([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDriveStatus = useCallback(async () => {
    setDriveStatus((prev) => ({ ...prev, loading: true }))
    try {
      const [statusRes, diagRes] = await Promise.all([
        fetch(apiUrl('/api/auth/google/status'), { credentials: 'include' }),
        fetch(apiUrl('/api/auth/google/diagnostics'), { credentials: 'include' }),
      ])
      const data = await statusRes.json().catch(() => ({}))
      const diag = await diagRes.json().catch(() => ({}))
      if (diagRes.ok) setDriveDiagnostics(diag)
      if (statusRes.ok) {
        setDriveStatus({
          connected: Boolean(data.connected),
          email: data.email || null,
          loading: false,
          needsReconnect: Boolean(data.needsReconnect),
        })
      } else {
        setDriveStatus({ connected: false, email: null, loading: false, needsReconnect: false })
      }
    } catch {
      setDriveStatus({ connected: false, email: null, loading: false, needsReconnect: false })
    }
  }, [])

  useEffect(() => {
    loadAll()
    loadDriveStatus()
  }, [loadAll, loadDriveStatus])

  useEffect(() => {
    const gdrive = searchParams.get('google_drive')
    if (!gdrive) return
    if (gdrive === 'connected') {
      toast.created('Google Drive connected successfully.', { title: 'Google Drive' })
      void loadDriveStatus()
    } else if (gdrive === 'error') {
      const reason = searchParams.get('reason')
      toast.error(googleDriveConnectErrorMessage(reason), { title: 'Google Drive', durationMs: 9000 })
      void loadDriveStatus()
    }
    searchParams.delete('google_drive')
    searchParams.delete('reason')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams, loadDriveStatus, toast])

  async function updateScheduleFrequency(freq, active) {
    setScheduleSaving(freq)
    try {
      const body = {
        daily: schedule.daily?.active,
        weekly: schedule.weekly?.active,
        monthly: schedule.monthly?.active,
      }
      body[freq] = active
      const res = await fetch(apiUrl('/api/backup/schedule'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readJson(res)
      setSchedule(data.schedule || schedule)
      toast.updated(`${freq.charAt(0).toUpperCase() + freq.slice(1)} auto backup ${active ? 'enabled' : 'paused'}.`, {
        title: 'Schedule updated',
      })
    } catch (e) {
      toast.error(String(e?.message || e), { title: 'Schedule update failed' })
    } finally {
      setScheduleSaving('')
    }
  }

  async function handleCreateBackup() {
    setCreating(true)
    try {
      const res = await fetch(apiUrl('/api/backup/create'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || err.error || 'Backup failed')
      }
      const gdriveHeader = res.headers.get('X-Backup-GDrive-Status') || ''
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition')
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || 'backup.lnbak'
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      await loadAll()

      const backupId = res.headers.get('X-Backup-Id')
      const latest = backupId
        ? (await fetch(apiUrl('/api/backup'), { credentials: 'include' })
            .then((r) => r.json())
            .then((d) => (Array.isArray(d.backups) ? d.backups : []).find((b) => b.id === backupId))
            .catch(() => null))
        : null

      const uploaded =
        gdriveHeader === 'success' || Boolean(latest?.gdrive_file_id || latest?.gdrive_link)
      const failed = gdriveHeader === 'failed'
      const connected = driveStatus.connected

      if (connected && uploaded) {
        toast.created('Backup created and saved to Google Drive.', { title: 'Backup' })
      } else if (connected && failed) {
        toast.error('Backup saved locally. Google Drive upload failed.', { title: 'Backup' })
      } else {
        toast.created('Backup saved locally.', { title: 'Backup' })
      }
      dispatchAuditLogsRefresh({ reason: 'backup_created' })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Backup failed' })
    } finally {
      setCreating(false)
    }
  }

  function validateDroppedFile(file) {
    if (!file) return 'No file selected.'
    if (!String(file.name || '').toLowerCase().endsWith('.lnbak')) return 'Only .lnbak files accepted'
    return ''
  }

  function handleFileSelect(file) {
    const err = validateDroppedFile(file)
    setRestoreError(err)
    setRestoreResult(null)
    setShowConfirm(false)
    setRestoreConfirmText('')
    setDroppedFile(err ? null : file)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    handleFileSelect(file)
  }

  async function handleRestoreUpload() {
    if (!droppedFile) return
    setIsRestoring(true)
    setRestoreStep(0)
    setRestoreFailure(null)
    try {
      const form = new FormData()
      form.append('file', droppedFile)
      const data = await runStreamRestore(apiUrl('/api/backup/restore-upload?stream=1'), {
        body: form,
        onStep: (step) => setRestoreStep(step),
      })
      setRestoreStep(5)
      setRestoreResult(data)
      setDroppedFile(null)
      setShowConfirm(false)
      setRestoreConfirmText('')
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_restored' })
      dispatchBackupRestored(data)
    } catch (err) {
      setRestoreFailure(err)
      toast.error(formatRestoreErrorMessage(err), { title: 'Restore failed', durationMs: 12000 })
      setRestoreStep(0)
    } finally {
      setIsRestoring(false)
    }
  }

  function downloadByFilename(filename) {
    if (!filename) return
    window.open(apiUrl(`/api/backup/download/${encodeURIComponent(filename)}`), '_blank')
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete backup "${row.name}"? This cannot be undone.`)) return
    const key = `del:${row.id}`
    setActionId(key)
    try {
      const res = await fetch(apiUrl(`/api/backup/${encodeURIComponent(row.id)}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      await readJson(res)
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_deleted' })
      toast.deleted('Backup removed.', { title: 'Deleted' })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Delete failed' })
    } finally {
      setActionId('')
    }
  }

  async function handleDisconnectDrive() {
    setDriveAction('disconnect')
    try {
      const res = await fetch(apiUrl('/api/auth/google/disconnect'), {
        method: 'DELETE',
        credentials: 'include',
      })
      await readJson(res)
      setDriveStatus({ connected: false, email: null, loading: false, needsReconnect: false })
      toast.updated('Google Drive disconnected.', { title: 'Google Drive' })
      dispatchAuditLogsRefresh({ reason: 'google_drive_disconnected' })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Disconnect failed' })
    } finally {
      setDriveAction('')
    }
  }

  async function handleUploadToDrive(row) {
    const key = `drive:${row.id}`
    setActionId(key)
    try {
      const res = await fetch(apiUrl(`/api/backup/${encodeURIComponent(row.id)}/upload-to-drive`), {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = String(data?.message || data?.error || `Request failed (${res.status}).`)
        if (data?.error === 'GOOGLE_DRIVE_NEEDS_RECONNECT' || data?.needsReconnect) {
          toast.error(
            'Google Drive permissions are outdated. Click Disconnect, then Connect Google Drive, and retry upload.',
            { title: 'Reconnect Google Drive', durationMs: 10000 },
          )
          void loadDriveStatus()
          return
        }
        throw new Error(msg)
      }
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_uploaded_to_gdrive' })
      toast.updated('Backup uploaded to Google Drive.', { title: 'Google Drive' })
    } catch (err) {
      const msg = String(err?.message || err)
      if (msg.toLowerCase().includes('insufficient') && msg.toLowerCase().includes('scope')) {
        toast.error(
          'Google Drive permissions are outdated. Disconnect and reconnect Google Drive, then retry upload.',
          { title: 'Reconnect Google Drive', durationMs: 10000 },
        )
        void loadDriveStatus()
      } else {
        toast.error(msg, { title: 'Upload failed' })
      }
    } finally {
      setActionId('')
    }
  }

  async function handleRetry(row) {
    const key = `retry:${row.id}`
    setActionId(key)
    try {
      const res = await fetch(apiUrl(`/api/backup/${encodeURIComponent(row.id)}/retry`), {
        method: 'POST',
        credentials: 'include',
      })
      await readJson(res)
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_created' })
      toast.updated('Backup retried successfully.', { title: 'Retry' })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Retry failed' })
    } finally {
      setActionId('')
    }
  }

  async function handleHistoryRestore() {
    if (!restoreTarget) return
    setHistoryRestoreSubmitting(true)
    setIsRestoring(true)
    setRestoreStep(0)
    setRestoreFailure(null)
    try {
      const data = await runStreamRestore(
        apiUrl(`/api/backup/${encodeURIComponent(restoreTarget.id)}/restore?stream=1`),
        {
          method: 'POST',
          body: JSON.stringify({ confirm: 'RESTORE' }),
          onStep: (step) => setRestoreStep(step),
        },
      )
      setRestoreStep(5)
      setRestoreTarget(null)
      setHistoryRestoreConfirm('')
      setRestoreResult(data)
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_restored' })
      dispatchBackupRestored(data)
      toast.updated('Data restored from backup.', { title: 'Restored', durationMs: 6000 })
    } catch (err) {
      setRestoreFailure(err)
      toast.error(formatRestoreErrorMessage(err), { title: 'Restore failed', durationMs: 12000 })
      setRestoreStep(0)
    } finally {
      setHistoryRestoreSubmitting(false)
      setIsRestoring(false)
    }
  }

  const historyRestoreReady = historyRestoreConfirm.trim() === 'RESTORE'
  const uploadRestoreReady = restoreConfirmText.trim() === 'RESTORE'

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate(-1)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-3xl font-bold text-neutral-900">Data Recovery &amp; Backup</h2>
        <button
          type="button"
          onClick={handleCreateBackup}
          disabled={creating}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: ACTION_BLUE }}
        >
          {creating ? 'Creating backup…' : 'Create backup now'}
        </button>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      ) : null}

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">Google Drive Backup</h2>
        {driveStatus.needsReconnect || driveDiagnostics?.needsReconnect ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-semibold">Reconnect Google Drive required</p>
            <p className="mt-1 text-xs">
              Your Google account is missing Drive upload permission (or permissions changed). Disconnect, then
              connect again and allow all requested permissions. Then use <strong>Retry Upload</strong>.
            </p>
            {driveDiagnostics?.missingScopes?.length ? (
              <p className="mt-1 text-xs text-amber-800">
                Missing scope: {driveDiagnostics.missingScopes.join(', ')}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={driveAction === 'disconnect'}
                onClick={() => void handleDisconnectDrive()}
                className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {driveAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = apiUrl('/api/auth/google')
                }}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: ACTION_BLUE }}
              >
                Connect Google Drive
              </button>
            </div>
          </div>
        ) : null}
        {driveStatus.loading ? (
          <p className="mt-2 text-sm text-neutral-500">Checking Google Drive connection…</p>
        ) : driveStatus.connected ? (
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-800">Google Drive Connected</p>
              <p className="mt-1 text-sm text-neutral-600">
                Backups will automatically upload to your &quot;LenLearn Backups&quot; folder in Google Drive.
              </p>
              {driveStatus.email ? (
                <p className="mt-1 text-sm text-neutral-500">Connected as: {driveStatus.email}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={driveAction === 'disconnect'}
              onClick={() => void handleDisconnectDrive()}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {driveAction === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="text-sm text-neutral-600">
                Connect your Google Drive to automatically save backup files there.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = apiUrl('/api/auth/google')
                }}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
                style={{ backgroundColor: ACTION_BLUE }}
              >
                Connect Google Drive
              </button>
            </div>
            {driveDiagnostics?.redirectUri ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <p className="font-semibold">Google Cloud setup</p>
                <p className="mt-1">
                  Add this exact URI under <strong>Authorized redirect URIs</strong> for your OAuth client
                  {driveDiagnostics.clientIdSuffix ? ` (…${driveDiagnostics.clientIdSuffix})` : ''}:
                </p>
                <code className="mt-1 block break-all rounded bg-white/80 px-2 py-1 text-[11px]">
                  {driveDiagnostics.redirectUri}
                </code>
                {!driveDiagnostics.configured ? (
                  <p className="mt-1 text-amber-800">OAuth env vars are incomplete — check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total backups" value={loading ? '…' : String(stats.total ?? 0)} />
        <SummaryCard
          title="Last backup"
          value={loading ? '…' : formatRelativeTime(stats.lastCompleted)}
          sub={stats.lastCompleted ? formatBackupDate(stats.lastCompleted) : 'No completed backups yet'}
        />
        <SummaryCard title="Storage used" value={loading ? '…' : formatStorage(stats.storageMb)} />
        <SummaryCard
          title="Success rate"
          value={loading ? '…' : `${stats.successRate ?? 100}%`}
          sub="Completed vs all attempts"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900">Auto backup schedule</h2>
          <p className="mt-1 text-sm text-neutral-500">Daily 2:00 AM · Weekly Sun 1:00 AM · Monthly 1st midnight</p>
          <ul className="mt-4 space-y-3">
            {['daily', 'weekly', 'monthly'].map((freq) => {
              const active = Boolean(schedule[freq]?.active)
              const saving = scheduleSaving === freq
              return (
                <li
                  key={freq}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/80 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold capitalize text-neutral-900">{freq}</p>
                    <p className="text-xs text-neutral-500">{active ? 'Active' : 'Paused'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!!scheduleSaving}
                    onClick={() => updateScheduleFrequency(freq, !active)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                    } disabled:opacity-50`}
                  >
                    {saving ? 'Saving…' : active ? 'Pause' : 'Enable'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900">What gets backed up</h2>
          <p className="mt-1 text-sm text-neutral-500">Included in manual and scheduled .lnbak snapshots</p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BACKUP_CHECKLIST.map((label) => (
              <li key={label} className="flex items-center gap-2 text-sm text-neutral-700">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-50 text-[10px] text-emerald-700">
                  ✓
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">Restore from backup file</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Upload a .lnbak archive to restore database and uploaded files. Large archives are supported (limited only
          by server disk space).
        </p>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
          }}
          className="mt-4 cursor-pointer rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-6 py-10 text-center transition hover:border-blue-300 hover:bg-blue-50/40"
        >
          <p className="text-sm font-semibold text-neutral-800">Drop your .lnbak file here</p>
          <p className="mt-1 text-sm text-neutral-500">or click to browse</p>
          <p className="mt-2 text-xs text-neutral-400">Only .lnbak files · Any size</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".lnbak"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
        />

        <RestoreErrorPanel error={restoreFailure} onDismiss={() => setRestoreFailure(null)} />

        {droppedFile ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              <p className="font-semibold text-neutral-900">{droppedFile.name}</p>
              <p className="text-neutral-600">{formatFileSize(droppedFile.size)}</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Restoring will overwrite ALL current data including students, faculty, grades, and uploaded files. A safety
              backup is created automatically before restore begins.
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              This action cannot be undone.
            </div>

            {!showConfirm ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Restore from this file
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDroppedFile(null)
                    setRestoreError('')
                  }}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
                <p className="text-sm text-neutral-700">
                  Are you absolutely sure? Type <span className="font-mono font-bold">RESTORE</span> to confirm.
                </p>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono"
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!uploadRestoreReady || isRestoring}
                    onClick={handleRestoreUpload}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {isRestoring ? 'Restoring…' : 'Confirm restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirm(false)
                      setRestoreConfirmText('')
                    }}
                    className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {isRestoring ? (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-blue-900">Restore in progress</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-800">
              {RESTORE_STEPS.map((step, idx) => (
                <li key={step} className={idx <= restoreStep ? 'font-semibold' : 'text-blue-600/70'}>
                  {idx < restoreStep ? '✓ ' : idx === restoreStep ? '→ ' : '  '}
                  {step}
                  {idx === 2 && restoreStep >= 2 ? ' (all tables)' : ''}
                  {idx === 3 && restoreStep >= 3 ? ' (uploaded files)' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-lg font-bold text-neutral-900">Backup history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Backup</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Tables</th>
                <th className="px-4 py-3">Files</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Google Drive</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                    Loading backups…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                    No backups yet. Create your first backup above.
                  </td>
                </tr>
              ) : (
                backups.map((row) => {
                  const busy = actionId.includes(row.id)
                  const failed = String(row.status).toLowerCase() === 'failed'
                  const completed = String(row.status).toLowerCase() === 'completed'
                  const filename = row.filename || (row.file_path ? row.file_path.split(/[/\\]/).pop() : null)
                  return (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-neutral-900">{row.name}</div>
                        <div className="text-xs text-neutral-500">{formatBackupDate(row.created_at)}</div>
                        {row.notes ? <div className="mt-0.5 text-xs text-neutral-400">{row.notes}</div> : null}
                        {failed && row.error_message ? (
                          <div className="mt-1 text-xs text-red-600">{row.error_message}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{typeLabel(row.type)}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.size_mb != null ? formatStorage(row.size_mb) : '—'}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{row.table_count ?? row.tables_included?.length ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.files_backed_up != null ? row.files_backed_up.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.gdrive_link ? (
                          <a
                            href={row.gdrive_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-blue-700 hover:underline"
                          >
                            View in Drive
                          </a>
                        ) : driveStatus.connected ||
                          driveStatus.needsReconnect ||
                          driveDiagnostics?.needsReconnect ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-neutral-500">Not uploaded</span>
                            {completed ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleUploadToDrive(row)}
                                  className="w-fit rounded border border-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                >
                                  Retry Upload
                                </button>
                                {driveStatus.needsReconnect || driveDiagnostics?.needsReconnect ? (
                                  <span className="text-[10px] text-amber-700">Reconnect Drive first</span>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">Drive not connected</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {completed && filename ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => downloadByFilename(filename)}
                                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Download
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setHistoryRestoreConfirm('')
                                  setRestoreTarget(row)
                                }}
                                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Restore
                              </button>
                            </>
                          ) : null}
                          {failed ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRetry(row)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(row)}
                            className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {restoreResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Restore completed</h3>
            <p className="mt-2 text-sm text-neutral-600">{restoreResult.message}</p>
            <p className="mt-1 text-xs text-neutral-500">Restored at: {formatBackupDate(restoreResult.restored_at)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              Safety backup: <span className="font-mono">{restoreResult.safety_backup}</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Files restored: {restoreResult.files_restored ? 'Yes' : 'No (see server logs)'}
              {restoreResult.files_restored_count != null
                ? ` (${Number(restoreResult.files_restored_count).toLocaleString()} files in backup)`
                : ''}
            </p>
            {restoreResult.file_verification ? (
              <p className="mt-1 text-xs text-neutral-500">
                File verification: {restoreResult.file_verification.verified}/
                {restoreResult.file_verification.sample_checked} sample paths OK
                {restoreResult.file_verification.missing?.length
                  ? ` · ${restoreResult.file_verification.missing.length} missing`
                  : ''}
              </p>
            ) : null}
            <div className="mt-4 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-3 text-sm text-neutral-800">
              <p className="font-semibold text-neutral-900">Institute data after restore</p>
              <p className="mt-2">
                <span className="font-semibold">Students (active):</span>{' '}
                {restoreResult.students_restored ?? restoreResult.row_counts?.students ?? '—'}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Faculty (active):</span>{' '}
                {restoreResult.faculties_restored ?? restoreResult.row_counts?.faculties ?? '—'}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Sections:</span>{' '}
                {restoreResult.sections_restored ?? restoreResult.row_counts?.sections ?? '—'}
                {' · '}
                <span className="font-semibold">in app_state:</span>{' '}
                {restoreResult.sections_in_app_state ?? '—'}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Subjects:</span>{' '}
                {restoreResult.subjects_restored ?? restoreResult.row_counts?.subjects ?? '—'}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Curriculum rows:</span>{' '}
                {restoreResult.curriculum_rows_restored ?? restoreResult.row_counts?.curriculum ?? '—'}
                {' · '}
                <span className="font-semibold">guides in app_state:</span>{' '}
                {restoreResult.curriculums_in_app_state ?? '—'}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Auth users:</span> teachers{' '}
                {restoreResult.teacher_users_restored ?? restoreResult.row_counts?.user ?? '—'}
                {' · '}
                students {restoreResult.student_users_restored ?? '—'}
                {' · '}
                admins {restoreResult.admin_users_restored ?? '—'}
              </p>
              {(restoreResult.faculty_missing_auth_link ?? 0) > 0 ? (
                <p className="mt-1 text-amber-800">
                  {restoreResult.faculty_missing_auth_link} faculty profile(s) still missing a linked login — run{' '}
                  <span className="font-mono text-xs">node scripts/repairFacultyAuthLinks.js</span>.
                </p>
              ) : null}
              {(restoreResult.student_missing_auth_link ?? 0) > 0 ? (
                <p className="mt-1 text-amber-800">
                  {restoreResult.student_missing_auth_link} student profile(s) still missing a linked login — run{' '}
                  <span className="font-mono text-xs">node scripts/repairStudentAuthLinks.js</span>.
                </p>
              ) : null}
              {restoreResult.app_state?.synced_faculties > 0 ? (
                <p className="mt-1 text-emerald-800">
                  Synced {restoreResult.app_state.synced_faculties} faculty row(s) from app_state snapshot.
                </p>
              ) : null}
              {(restoreResult.sections_synced ?? restoreResult.app_state?.synced_sections) > 0 ? (
                <p className="mt-1 text-emerald-800">
                  Synced {restoreResult.sections_synced ?? restoreResult.app_state?.synced_sections} section(s) from
                  app_state into institute_sections.
                </p>
              ) : null}
              {(restoreResult.curriculums_synced ?? restoreResult.app_state?.synced_curriculums) > 0 ? (
                <p className="mt-1 text-emerald-800">
                  Synced {restoreResult.curriculums_synced ?? restoreResult.app_state?.synced_curriculums} curriculum
                  guide(s) from app_state into PostgreSQL.
                </p>
              ) : null}
              {restoreResult.auth_repair?.linked > 0 ? (
                <p className="mt-1 text-emerald-800">
                  Linked {restoreResult.auth_repair.linked} faculty profile(s) to auth users after restore.
                </p>
              ) : null}
              {restoreResult.student_auth_repair?.linked > 0 ? (
                <p className="mt-1 text-emerald-800">
                  Linked {restoreResult.student_auth_repair.linked} student profile(s) to auth users after restore.
                </p>
              ) : null}
            </div>
            {moduleRestoreWarnings(restoreResult).map((w) => (
              <div key={w.key} className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-sm font-semibold text-red-900">Possible issue: {w.key}</p>
                <p className="mt-2 text-sm text-red-900">{w.message}</p>
                <p className="mt-2 text-sm text-red-900">
                  If data is missing, restore an older{' '}
                  <span className="font-mono text-xs">backup_pre_restore_*.lnbak</span> from the server{' '}
                  <span className="font-mono text-xs">backups/</span> folder, then refresh the institute dashboard.
                </p>
              </div>
            ))}
            {(restoreResult.restore_warnings || []).length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-semibold text-amber-900">Warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {restoreResult.restore_warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {restoreResult.restore_validation?.lines?.length > 0 ? (
              <div
                className={`mt-4 rounded-lg border px-3 py-3 ${
                  restoreResult.restore_validation.validation_ok
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <p className="text-sm font-semibold text-neutral-900">Restore validation</p>
                <ul className="mt-2 space-y-1 text-sm text-neutral-800">
                  {restoreResult.restore_validation.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="text-sm font-semibold text-neutral-800">Tables restored</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-neutral-700">
                {(restoreResult.tables_restored || []).map((t) => (
                  <li key={t}>
                    {t}: {restoreResult.row_counts?.[t] ?? 0} rows
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setRestoreResult(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: ACTION_BLUE }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Restore backup</h3>
            <p className="mt-2 text-sm text-red-700">
              This will overwrite ALL current data with the selected backup. This cannot be undone.
            </p>
            <p className="mt-2 text-sm font-medium text-neutral-800">{restoreTarget.name}</p>
            <label className="mt-4 block">
              <span className="text-sm text-neutral-600">Type RESTORE to confirm</span>
              <input
                type="text"
                value={historyRestoreConfirm}
                onChange={(e) => setHistoryRestoreConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono"
                autoComplete="off"
              />
            </label>
            {historyRestoreSubmitting ? (
              <ul className="mt-4 space-y-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {RESTORE_STEPS.map((step, idx) => (
                  <li key={`hist-${step}`} className={idx <= restoreStep ? 'font-semibold' : 'text-blue-600/70'}>
                    {idx < restoreStep ? '✓ ' : idx === restoreStep ? '→ ' : '  '}
                    {step}
                  </li>
                ))}
              </ul>
            ) : null}
            <RestoreErrorPanel error={restoreFailure} onDismiss={() => setRestoreFailure(null)} />
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRestoreTarget(null)
                  setHistoryRestoreConfirm('')
                }}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!historyRestoreReady || historyRestoreSubmitting}
                onClick={handleHistoryRestore}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {historyRestoreSubmitting ? 'Restoring…' : 'Restore now'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
