import { useMemo, useState } from 'react'
import {
  adminGrantSubmissionExtension,
  adminUploadSubmissionOnBehalf,
  teacherGrantSubmissionExtension,
  teacherUploadSubmissionOnBehalf,
} from '../lib/gradesApi.js'

function defaultUntilLocal() {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LateSubmissionModal({
  item,
  studentId,
  studentName,
  onClose,
  onSuccess,
  actorRole = 'admin',
}) {
  const [until, setUntil] = useState(defaultUntilLocal)
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canUpload = item?.entity_type === 'assignment' || item?.entity_type === 'activity'

  const typeLabel = useMemo(() => {
    const t = String(item?.entity_type || '').toLowerCase()
    if (t === 'quiz') return 'Quiz'
    if (t === 'activity') return 'Activity'
    return 'Assignment'
  }, [item?.entity_type])

  const isTeacher = actorRole === 'teacher'
  const grantExtension = isTeacher ? teacherGrantSubmissionExtension : adminGrantSubmissionExtension
  const uploadOnBehalf = isTeacher ? teacherUploadSubmissionOnBehalf : adminUploadSubmissionOnBehalf

  async function handleSave() {
    const trimmed = String(reason).trim()
    if (trimmed.length < 10) {
      setError('Reason must be at least 10 characters.')
      return
    }
    if (!until) {
      setError('Extension until date is required.')
      return
    }
    if (file && file.type !== 'application/pdf') {
      setError('Only PDF files are accepted for upload.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await grantExtension({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        student_id: Number(studentId),
        until: new Date(until).toISOString(),
        reason: trimmed,
      })

      if (file && canUpload) {
        await uploadOnBehalf({
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          student_id: Number(studentId),
          reason: trimmed,
          file,
        })
      }

      onSuccess?.()
      onClose?.()
    } catch (e) {
      setError(String(e?.message || e || 'Could not grant late submission.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">
          Allow Late Submission — {item?.title || 'Work item'}
        </h3>

        <div className="mt-4 space-y-2 text-sm text-neutral-700">
          <p>
            <span className="font-semibold">Student:</span> {studentName || '—'}
          </p>
          <p>
            <span className="font-semibold">Type:</span> {typeLabel}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-neutral-800">
            Allow submission until
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-neutral-800">
            Reason (required, min 10 characters)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Explain why late submission is allowed…"
            />
          </label>

          {canUpload ? (
            <label className="block text-sm font-medium text-neutral-800">
              Upload PDF on student&apos;s behalf (optional)
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-neutral-600"
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Allow Late Submission'}
          </button>
        </div>
      </div>
    </div>
  )
}
