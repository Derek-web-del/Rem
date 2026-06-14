import { useState } from 'react'
import { adminGradeOverride } from '../lib/gradesApi.js'
import { displayGrade } from '../lib/gradeStatus.js'

export default function GradeOverrideModal({ item, studentId, studentName, onClose, onSuccess }) {
  const [newScore, setNewScore] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const maxScore = item?.max_score ?? 100
  const currentPercent = displayGrade(item?.percent)

  async function handleSave() {
    const score = Number(newScore)
    if (!Number.isFinite(score) || score < 0 || score > maxScore) {
      setError(`Score must be between 0 and ${maxScore}.`)
      return
    }
    if (!String(reason).trim()) {
      setError('Reason is required.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await adminGradeOverride({
        entity_type: item.entity_type,
        submission_id: item.submission_id,
        student_id: Number(studentId),
        new_score: score,
        reason: String(reason).trim(),
      })
      onSuccess?.()
      onClose?.()
    } catch (e) {
      setError(String(e?.message || e || 'Could not save override.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">
          Grade Override — {item?.title || 'Submission'}
        </h3>

        <div className="mt-4 space-y-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Student:</span> {studentName || '—'}
          </p>
          <p>
            <span className="font-semibold">Current score:</span> {currentPercent}%
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
              placeholder="e.g. Clerical error correction"
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This action is logged and cannot be undone. A full audit record will be created.
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
            {saving ? 'Saving…' : 'Save Override'}
          </button>
        </div>
      </div>
    </div>
  )
}
