import { useEffect, useState } from 'react'

export const ARCHIVE_REASON_MIN_LEN = 10
export const ARCHIVE_REASON_MAX_LEN = 500

/**
 * Modal requiring a free-text reason before archiving a student or faculty account.
 */
export default function ArchiveReasonModal({
  open,
  entityLabel = 'Account',
  targetName = '',
  submitting = false,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < ARCHIVE_REASON_MIN_LEN
  const tooLong = trimmed.length > ARCHIVE_REASON_MAX_LEN
  const canSubmit = trimmed.length >= ARCHIVE_REASON_MIN_LEN && trimmed.length <= ARCHIVE_REASON_MAX_LEN

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    await onConfirm?.(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-neutral-900">Archive {entityLabel}</h3>
        <p className="mt-2 text-sm text-neutral-700">
          Archive <span className="font-semibold">{targetName || entityLabel}</span>? They will be removed from
          active rosters and moved to the Archive Vault. You can restore them later.
        </p>
        <form className="mt-4 space-y-2" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-neutral-700" htmlFor="archive-reason">
            Reason for archiving <span className="text-red-600">*</span>
          </label>
          <textarea
            id="archive-reason"
            rows={4}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={ARCHIVE_REASON_MAX_LEN}
            placeholder="Describe why this account is being archived (required)."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-[#1e4fa3] focus:outline-none focus:ring-2 focus:ring-[#1e4fa3]/20"
          />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>
              {tooShort ? (
                <span className="text-amber-700">At least {ARCHIVE_REASON_MIN_LEN} characters required.</span>
              ) : tooLong ? (
                <span className="text-red-600">Reason is too long.</span>
              ) : (
                <span>Minimum {ARCHIVE_REASON_MIN_LEN} characters.</span>
              )}
            </span>
            <span>
              {trimmed.length}/{ARCHIVE_REASON_MAX_LEN}
            </span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
