import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'
import {
  normalizeInstituteAdminDisplayName,
  INSTITUTE_ADMIN_DISPLAY_NAME,
} from '../../lib/instituteAdminDisplay.js'

function mapTurnoverApiError(res, data) {
  if (res.status === 403) {
    return 'Access denied. Sign in as an institute administrator.'
  }
  if (res.status === 503) {
    return String(data?.message || 'The system database is not available. Please try again later.')
  }
  const msg = String(data?.message || data?.error || '').trim()
  if (msg && msg !== 'Something went wrong. Please try again.') return msg
  if (res.status >= 500) {
    return 'The server could not load transfer options. Please refresh the page or try again in a moment.'
  }
  return msg || 'Could not load admin transfer options.'
}

function displayCurrentAdmin(currentAdmin, loadFailed) {
  if (!currentAdmin) return loadFailed ? '—' : INSTITUTE_ADMIN_DISPLAY_NAME
  return (
    normalizeInstituteAdminDisplayName(currentAdmin.name, currentAdmin.email) ||
    currentAdmin.email ||
    INSTITUTE_ADMIN_DISPLAY_NAME
  )
}

export default function AdminTurnoverPage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [targetUserId, setTargetUserId] = useState('')
  const [demoteSelf, setDemoteSelf] = useState(false)
  const [checklist, setChecklist] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(apiUrl('/api/v1/admin/turnover/candidates'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = mapTurnoverApiError(res, data)
        setLoadError(msg)
        setCurrentAdmin(null)
        setCandidates([])
        toast.error(msg)
        return
      }
      setCurrentAdmin(data.current_admin || null)
      const list = Array.isArray(data.candidates) ? data.candidates : []
      setCandidates(
        list.filter((c) => {
          const role = String(c?.role || '').trim().toLowerCase()
          return role === 'teacher' || role === 'faculty'
        }),
      )
    } catch (e) {
      const msg = String(e?.message || 'Could not load admin transfer options.')
      setLoadError(msg)
      setCurrentAdmin(null)
      setCandidates([])
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleTransfer() {
    if (!targetUserId) {
      toast.error('Select the new primary administrator.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/admin/turnover/transfer'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, demoteSelf }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapTurnoverApiError(res, data))
      setChecklist(Array.isArray(data.checklist) ? data.checklist : [])
      toast.success('Administrator access transferred.')
      await load()
    } catch (e) {
      toast.error(String(e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-neutral-900">Transfer primary administrator</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Promote a faculty member to institute admin. This does not remove your access unless you choose to demote yourself.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
          {loadError ? (
            <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{loadError}</p>
          ) : null}

          <p className="text-sm text-neutral-700">
            <span className="font-semibold">Current admin:</span>{' '}
            {displayCurrentAdmin(currentAdmin, Boolean(loadError))}
          </p>

          <label className="mt-4 block text-sm font-medium text-neutral-700">
            New primary admin
            <select
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              disabled={Boolean(loadError)}
            >
              <option value="">Select faculty member</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.name || c.email || c.id) + (c.role ? ` (${c.role})` : '')}
                </option>
              ))}
            </select>
          </label>

          {!loadError && candidates.length === 0 ? (
            <p className="mt-2 text-sm text-amber-800">
              No faculty with login accounts found. Each faculty member in Faculties needs an email and a linked Teacher
              portal login. Re-save faculty records or ensure they can sign in to the Teacher portal.
            </p>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={demoteSelf}
              onChange={(e) => setDemoteSelf(e.target.checked)}
              className="rounded border-neutral-300"
              disabled={Boolean(loadError)}
            />
            Demote me to Faculty after transfer
          </label>

          <button
            type="button"
            disabled={submitting || !targetUserId || Boolean(loadError)}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={handleTransfer}
          >
            {submitting ? 'Transferring…' : 'Transfer admin access'}
          </button>
        </section>
      )}

      {checklist.length ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">Next steps</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
