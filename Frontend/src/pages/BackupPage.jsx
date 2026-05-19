import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton.jsx'
import { useNotify } from '../components/notifications.jsx'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { dispatchAuditLogsRefresh } from '../lib/auditLogRefresh.js'

const ACTION_BLUE = '#1e4fa3'

const TABLE_OPTIONS = [
  { key: 'sections', label: 'Sections' },
  { key: 'curriculum', label: 'Curriculum' },
  { key: 'students', label: 'Students' },
  { key: 'faculties', label: 'Faculties' },
  { key: 'faculty_sections', label: 'Faculty sections' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'audit_logs', label: 'Audit logs' },
  { key: 'lms_activity_logs', label: 'LMS activity logs' },
  { key: 'users', label: 'Users' },
]

const DEFAULT_TABLE_KEYS = TABLE_OPTIONS.map((t) => t.key)

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

function typeLabel(type) {
  const t = String(type || 'manual').toLowerCase()
  if (t === 'manual') return 'Manual'
  if (t === 'daily') return 'Auto · Daily'
  if (t === 'weekly') return 'Auto · Weekly'
  if (t === 'monthly') return 'Auto · Monthly'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function defaultBackupName() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `backup_manual_${y}-${m}-${day}`
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

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState(defaultBackupName())
  const [createNotes, setCreateNotes] = useState('')
  const [createTables, setCreateTables] = useState(() => [...DEFAULT_TABLE_KEYS])
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState(null)
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoreSubmitting, setRestoreSubmitting] = useState(false)

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

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const estimatedSizeLabel = useMemo(() => {
    const n = createTables.length
    const est = Math.max(0.05, n * 0.12)
    return `~${est.toFixed(2)} MB (estimate for ${n} table${n === 1 ? '' : 's'})`
  }, [createTables.length])

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

  async function handleCreateBackup(e) {
    e.preventDefault()
    if (!createTables.length) {
      toast.error('Select at least one table to include.', { title: 'Validation' })
      return
    }
    setCreateSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/backup'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim() || defaultBackupName(),
          notes: createNotes.trim(),
          tables: createTables,
        }),
      })
      await readJson(res)
      setCreateOpen(false)
      setCreateNotes('')
      setCreateName(defaultBackupName())
      setCreateTables([...DEFAULT_TABLE_KEYS])
      await loadAll()
      dispatchAuditLogsRefresh({ reason: 'backup_created' })
      toast.created('Backup created successfully.', { title: 'Backup' })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Backup failed' })
    } finally {
      setCreateSubmitting(false)
    }
  }

  async function handleDownload(id, name) {
    const key = `dl:${id}`
    setActionId(key)
    try {
      const res = await fetch(apiUrl(`/api/backup/${encodeURIComponent(id)}/download`), {
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(String(data?.message || data?.error || `Download failed (${res.status}).`))
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${String(name || 'backup').replace(/[^\w.-]+/g, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Download failed' })
    } finally {
      setActionId('')
    }
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

  async function handleRestore() {
    if (!restoreTarget) return
    setRestoreSubmitting(true)
    try {
      const res = await fetch(apiUrl(`/api/backup/${encodeURIComponent(restoreTarget.id)}/restore`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESTORE' }),
      })
      await readJson(res)
      setRestoreTarget(null)
      setRestoreConfirm('')
      dispatchAuditLogsRefresh({ reason: 'backup_restored' })
      toast.updated('Data restored from backup.', { title: 'Restored', durationMs: 6000 })
    } catch (err) {
      toast.error(String(err?.message || err), { title: 'Restore failed' })
    } finally {
      setRestoreSubmitting(false)
    }
  }

  const restoreReady = restoreConfirm.trim() === 'RESTORE'

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate(-1)} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h2 className="m-0 text-3xl font-bold text-neutral-900">Data Recovery &amp; Backup</h2>

        <button
          type="button"
          onClick={() => {
            setCreateName(defaultBackupName())
            setCreateOpen(true)
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
          style={{ backgroundColor: ACTION_BLUE }}
        >
          Create backup now
        </button>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total backups" value={loading ? '…' : String(stats.total ?? 0)} />
        <SummaryCard
          title="Last backup"
          value={loading ? '…' : formatRelativeTime(stats.lastCompleted)}
          sub={stats.lastCompleted ? formatBackupDate(stats.lastCompleted) : 'No completed backups yet'}
        />
        <SummaryCard
          title="Storage used"
          value={loading ? '…' : formatStorage(stats.storageMb)}
        />
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
          <p className="mt-1 text-sm text-neutral-500">Included in manual and scheduled snapshots</p>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TABLE_OPTIONS.map(({ key, label }) => (
              <li key={key} className="flex items-center gap-2 text-sm text-neutral-700">
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-50 text-[10px] text-emerald-700">
                  ✓
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-lg font-bold text-neutral-900">Backup history</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Backup</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    Loading backups…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No backups yet. Create your first backup above.
                  </td>
                </tr>
              ) : (
                backups.map((row) => {
                  const busy = actionId.startsWith(String(row.id)) || actionId.includes(row.id)
                  const failed = String(row.status).toLowerCase() === 'failed'
                  const completed = String(row.status).toLowerCase() === 'completed'
                  return (
                    <tr key={row.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-neutral-900">{row.name}</div>
                        <div className="text-xs text-neutral-500">{formatBackupDate(row.created_at)}</div>
                        {row.notes ? (
                          <div className="mt-0.5 text-xs text-neutral-400">{row.notes}</div>
                        ) : null}
                        {failed && row.error_message ? (
                          <div className="mt-1 text-xs text-red-600">{row.error_message}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{typeLabel(row.type)}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {row.size_mb != null ? formatStorage(row.size_mb) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {completed ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setRestoreConfirm('')
                                  setRestoreTarget(row)
                                }}
                                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDownload(row.id, row.name)}
                                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                              >
                                Download
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

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Create backup</h3>
            <form className="mt-4 space-y-4" onSubmit={handleCreateBackup}>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Backup name</span>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  required
                />
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-neutral-700">Tables to include</legend>
                <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-neutral-100 p-3">
                  {TABLE_OPTIONS.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createTables.includes(key)}
                        onChange={(e) => {
                          setCreateTables((prev) =>
                            e.target.checked ? [...prev, key] : prev.filter((k) => k !== key),
                          )
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Notes (optional)</span>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Estimated size: {estimatedSizeLabel}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: ACTION_BLUE }}
                >
                  {createSubmitting ? 'Creating…' : 'Create backup'}
                </button>
              </div>
            </form>
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
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono"
                autoComplete="off"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRestoreTarget(null)
                  setRestoreConfirm('')
                }}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!restoreReady || restoreSubmitting}
                onClick={handleRestore}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {restoreSubmitting ? 'Restoring…' : 'Restore now'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

