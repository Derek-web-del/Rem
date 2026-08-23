import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { useNotify } from './notifications.jsx'

function formatBytes(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return '—'
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  return `${(num / (1024 * 1024)).toFixed(1)} MB`
}

function formatDeletedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function RecycleBinPanel() {
  const toast = useNotify()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [purgeTarget, setPurgeTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(apiUrl('/api/backup/recycle-bin'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Could not load recycle bin (HTTP ${res.status}).`)
      }
      setFiles(Array.isArray(data.files) ? data.files : [])
    } catch (e) {
      setError(String(e?.message || 'Could not load recycle bin.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRestore(file) {
    if (busyId) return
    setBusyId(file.id)
    try {
      const res = await fetch(apiUrl(`/api/backup/recycle-bin/${encodeURIComponent(file.id)}/restore`), {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Could not restore file (HTTP ${res.status}).`)
      }
      toast.success(`Restored "${file.file_name || file.original_path}".`)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
    } catch (e) {
      toast.error(String(e?.message || 'Could not restore file.'))
    } finally {
      setBusyId('')
    }
  }

  async function handlePurgeConfirmed() {
    const file = purgeTarget
    if (!file || busyId) return
    setBusyId(file.id)
    try {
      const res = await fetch(apiUrl(`/api/backup/recycle-bin/${encodeURIComponent(file.id)}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Could not delete file (HTTP ${res.status}).`)
      }
      toast.success(`Permanently deleted "${file.file_name || file.original_path}".`)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
    } catch (e) {
      toast.error(String(e?.message || 'Could not delete file.'))
    } finally {
      setBusyId('')
      setPurgeTarget(null)
    }
  }

  return (
    <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Recycle Bin</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Any file replaced or removed anywhere in the system (curriculum guides, syllabi, submissions,
            announcement images, and more) lands here first instead of being deleted outright — recoverable
            instantly, no backup needed. Nothing here is deleted automatically; remove items permanently when
            you're sure.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
        >
          {expanded ? 'Hide' : 'Show'} ({files.length})
        </button>
      </div>

      {expanded ? (
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : files.length === 0 ? (
            <p className="text-sm text-neutral-500">Recycle bin is empty.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      File
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Type
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Size
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Deleted
                    </th>
                    <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td className="px-4 py-3 font-medium text-neutral-900">{f.file_name || f.original_path}</td>
                      <td className="px-4 py-3 text-neutral-600">{f.context || 'Uploaded file'}</td>
                      <td className="px-4 py-3 tabular-nums text-neutral-600">{formatBytes(f.size_bytes)}</td>
                      <td className="px-4 py-3 text-neutral-600">
                        {formatDeletedAt(f.deleted_at)}
                        {f.deleted_by_name ? <span className="text-neutral-400"> · {f.deleted_by_name}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(busyId)}
                            onClick={() => void handleRestore(f)}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                          >
                            {busyId === f.id ? 'Restoring…' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyId)}
                            onClick={() => setPurgeTarget(f)}
                            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                          >
                            Delete Permanently
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {purgeTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900">Delete permanently?</h3>
            <p className="mt-2 text-sm text-neutral-700">
              "{purgeTarget.file_name || purgeTarget.original_path}" will be gone for good — this cannot be undone
              from the app.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPurgeTarget(null)}
                disabled={Boolean(busyId)}
                className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePurgeConfirmed()}
                disabled={Boolean(busyId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {busyId === purgeTarget.id ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
