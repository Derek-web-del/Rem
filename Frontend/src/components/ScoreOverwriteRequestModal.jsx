import { useState } from 'react'
import { createTeacherScoreOverwriteRequest } from '../lib/scoreOverwriteApi.js'
import { computePercent, formatScoreWithPercent } from '../lib/gradeStatus.js'

export default function ScoreOverwriteRequestModal({
  entityType,
  entityId,
  entityTitle,
  submission,
  studentName,
  maxScore = 100,
  onClose,
  onSuccess,
}) {
  const [requestedScore, setRequestedScore] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentScore = submission?.score != null ? Number(submission.score) : null

  async function handleSubmit() {
    const score = Number(requestedScore)
    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      setError(`Score must be between 0 and ${maxScore}.`)
      return
    }
    const trimmed = String(reason).trim()
    if (trimmed.length < 10) {
      setError('Reason must be at least 10 characters.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await createTeacherScoreOverwriteRequest({
        entity_type: entityType,
        entity_id: Number(entityId),
        submission_id: Number(submission.id ?? submission.submission_id),
        student_id: Number(submission.student_id),
        requested_score: score,
        reason: trimmed,
      })
      onSuccess?.()
      onClose?.()
    } catch (e) {
      setError(String(e?.message || e || 'Could not submit request.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">Request Score Change</h3>
        <p className="mt-2 text-sm text-neutral-600">
          The deadline has passed. Submit a request for admin approval to change this score.
        </p>

        <div className="mt-4 space-y-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Item:</span> {entityTitle || '—'}
          </p>
          <p>
            <span className="font-semibold">Student:</span> {studentName || '—'}
          </p>
          <p>
            <span className="font-semibold">Current score:</span>{' '}
            {currentScore != null
              ? formatScoreWithPercent(currentScore, maxScore)
              : '—'}
            {currentScore != null ? ` (${computePercent(currentScore, maxScore)}%)` : ''}
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-neutral-800">
            Requested score
            <input
              type="number"
              min={0}
              max={maxScore}
              value={requestedScore}
              onChange={(e) => setRequestedScore(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={`0 – ${maxScore}`}
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-neutral-800">
            Reason (min. 10 characters)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Explain why this score should be changed…"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
