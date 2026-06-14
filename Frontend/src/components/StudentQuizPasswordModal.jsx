import { useEffect, useState } from 'react'
import PasswordInput from './PasswordInput.jsx'
import { ACTION_BLUE } from '../pages/teachers/instituteChrome.js'

export default function StudentQuizPasswordModal({ open, onCancel, onSubmit, submitting, error }) {
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) setPassword('')
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">Enter pass code</h3>
        <p className="mt-2 text-sm text-neutral-600">Enter the pass code provided by your teacher to start.</p>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pass code
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter pass code"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => onSubmit(password)}
            disabled={submitting || !String(password).trim()}
          >
            {submitting ? 'Verifying…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
