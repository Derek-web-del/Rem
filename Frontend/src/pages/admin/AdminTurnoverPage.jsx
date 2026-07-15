import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'
import { normalizeInstituteAdminDisplayName } from '../../lib/instituteAdminDisplay.js'

export default function AdminTurnoverPage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentAdmin, setCurrentAdmin] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [targetUserId, setTargetUserId] = useState('')
  const [demoteSelf, setDemoteSelf] = useState(false)
  const [checklist, setChecklist] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/v1/admin/turnover/candidates'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Could not load candidates.')
      setCurrentAdmin(data.current_admin || null)
      const list = Array.isArray(data.candidates) ? data.candidates : []
      setCandidates(
        list.filter((c) => {
          const role = String(c?.role || '').trim().toLowerCase()
          return role === 'teacher' || role === 'faculty'
        }),
      )
    } catch (e) {
      toast.error(String(e?.message || e))
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
      if (!res.ok) throw new Error(data?.message || data?.error || 'Transfer failed.')
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
          <p className="text-sm text-neutral-700">
            <span className="font-semibold">Current admin:</span>{' '}
            {normalizeInstituteAdminDisplayName(currentAdmin?.name, currentAdmin?.email) || currentAdmin?.email || '—'}
          </p>

          <label className="mt-4 block text-sm font-medium text-neutral-700">
            New primary admin
            <select
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            >
              <option value="">Select faculty member</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.name || c.email || c.id) + (c.role ? ` (${c.role})` : '')}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={demoteSelf}
              onChange={(e) => setDemoteSelf(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Demote me to Faculty after transfer
          </label>

          <button
            type="button"
            disabled={submitting || !targetUserId}
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
