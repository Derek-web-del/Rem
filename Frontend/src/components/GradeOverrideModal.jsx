import { useState } from 'react'
import { adminGradeOverride } from '../lib/gradesApi.js'
import { computePercent, displayGrade } from '../lib/gradeStatus.js'

export default function GradeOverrideModal({ item, studentId, studentName, onClose, onSuccess }) {
  const [newScore, setNewScore] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const maxScore = item?.max_score ?? 100
  const currentScore = item?.score != null ? Number(item.score) : null
  const currentPercent =
    currentScore != null && Number.isFinite(currentScore)
      ? computePercent(currentScore, maxScore)
      : displayGrade(item?.percent)

  async function handleSave() {
    const score = Number(newScore)
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
      await adminGradeOverride({
        entity_type: item.entity_type,
        submission_id: item.submission_id ?? null,
        entity_id: item.entity_id ?? null,
        student_id: Number(studentId),
        new_score: score,
        reason: trimmed,
      })
      onSuccess?.()
      onClose?.()
    } catch (e) {
      setError(String(e?.message || e || 'Could not overwrite score.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">
          Overwrite Score — {item?.title || 'Submission'}
        </h3>

        <div className="mt-4 space-y-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Student:</span> {studentName || '—'}
          </p>
          <p>
            <span className="font-semibold">Current score:</span>{' '}
            {currentScore != null && Number.isFinite(currentScore)
              ? `${currentScore}/${maxScore} (${currentPercent != null ? `${currentPercent}%` : '—'})`
              : item?.is_no_submission
                ? `0/${maxScore} (0%) — no submission`
                : currentPercent != null
                  ? `${currentPercent}%`
                  : '—'}
          </p>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-neutral-800">
            New score
            <input
              type="number"
              min={0}
              max={maxScore}
              value={newScore}
              onChange={(e) => setNewScore(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={`0 – ${maxScore}`}
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-neutral-800">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="e.g. Clerical error correction after deadline"
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          A valid reason is required. This action is logged and cannot be undone.
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
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
