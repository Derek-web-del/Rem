import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'

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
      setCandidates(Array.isArray(data.candidates) ? data.candidates : [])
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
          Promote another user to institute admin. This does not remove your access unless you choose to demote yourself.
        </p>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Before you transfer</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The new admin will have full Institute portal access including backup and audit logs.</li>
          <li>Update deployment env vars (e.g. INSTITUTE_ADMIN_EMAIL) if your school uses email-based portal access.</li>
        </ul>
      </section>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <section className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
          <p className="text-sm text-neutral-700">
            <span className="font-semibold">Current admin:</span>{' '}
            {currentAdmin?.name || currentAdmin?.email || '—'}
          </p>

          <label className="mt-4 block text-sm font-medium text-neutral-700">
            New primary admin
            <select
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            >
              <option value="">Select user</option>
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
