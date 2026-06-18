import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminScoreOverwriteRequests,
  reviewAdminScoreOverwriteRequest,
} from '../lib/scoreOverwriteApi.js'

function formatEntityType(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'assignment') return 'Assignment'
  if (t === 'activity') return 'Activity'
  if (t === 'quiz') return 'Quiz'
  return type || '—'
}

export default function AdminScoreOverwriteRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminScoreOverwriteRequests({ status: statusFilter })
      setRequests(Array.isArray(data?.requests) ? data.requests : [])
    } catch (e) {
      setError(String(e?.message || e || 'Could not load requests.'))
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function handleReview(action) {
    if (!reviewTarget) return
    if (action === 'reject' && !String(adminNotes).trim()) {
      setError('Notes are required when rejecting a request.')
      return
    }
    setReviewing(true)
    setError('')
    try {
      await reviewAdminScoreOverwriteRequest(reviewTarget.id, {
        action,
        admin_notes: String(adminNotes).trim() || null,
      })
      setReviewTarget(null)
      setAdminNotes('')
      await load()
    } catch (e) {
      setError(String(e?.message || e || 'Could not update request.'))
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Score Overwrite Requests</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Review teacher requests to change scores after deadlines have passed.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
          No {statusFilter} score overwrite requests.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Current → Requested</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {requests.map((req) => (
                <tr key={req.id} className="text-neutral-800">
                  <td className="px-4 py-3 font-medium">{req.student_name || `Student #${req.student_id}`}</td>
                  <td className="px-4 py-3">{formatEntityType(req.entity_type)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {req.current_score != null ? req.current_score : '—'} → {req.requested_score}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-neutral-600">{req.reason}</td>
                  <td className="px-4 py-3 tabular-nums text-neutral-600">
                    {req.created_at ? new Date(req.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewTarget(req)
                          setAdminNotes('')
                          setError('')
                        }}
                        className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Review
                      </button>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-neutral-500">{req.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Review Score Overwrite Request</h3>
            <div className="mt-4 space-y-2 text-sm text-neutral-700">
              <p>
                <span className="font-semibold">Student:</span> {reviewTarget.student_name || '—'}
              </p>
              <p>
                <span className="font-semibold">Type:</span> {formatEntityType(reviewTarget.entity_type)}
              </p>
              <p>
                <span className="font-semibold">Change:</span>{' '}
                {reviewTarget.current_score != null ? reviewTarget.current_score : '—'} →{' '}
                {reviewTarget.requested_score}
              </p>
              <p>
                <span className="font-semibold">Teacher reason:</span> {reviewTarget.reason}
              </p>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-neutral-800">
                Admin notes (required for rejection)
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                disabled={reviewing}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleReview('reject')}
                disabled={reviewing}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void handleReview('approve')}
                disabled={reviewing}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {reviewing ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
