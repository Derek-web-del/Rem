import { useEffect, useMemo, useState } from 'react'
import {
  clearAuditLogs,
  fetchAuditClearPreview,
  formatClearPreviewBreakdown,
} from '../lib/auditLogsClear.js'

const CLEAR_TYPES = {
  before_date: 'before_date',
  date_range: 'date_range',
  all: 'all',
}

export default function ClearAuditLogsModal({ open, totalInList, onClose, onCleared }) {
  const [clearType, setClearType] = useState(CLEAR_TYPES.date_range)
  const [beforeDate, setBeforeDate] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [ledgerTotal, setLedgerTotal] = useState(null)
  const [ledgerBreakdown, setLedgerBreakdown] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setClearType(CLEAR_TYPES.date_range)
    setBeforeDate('')
    setFromDate('')
    setToDate('')
    setConfirmAll(false)
    setError('')
    setPreview(null)
    setLedgerBreakdown(null)
    let cancelled = false
    ;(async () => {
      try {
        const allPreview = await fetchAuditClearPreview({ clearType: 'all' })
        if (!cancelled) {
          setLedgerTotal(allPreview.count)
          setLedgerBreakdown(allPreview)
        }
      } catch {
        if (!cancelled) {
          setLedgerTotal(null)
          setLedgerBreakdown(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const previewParams = useMemo(() => {
    if (clearType === CLEAR_TYPES.before_date) {
      return beforeDate ? { clearType, beforeDate } : null
    }
    if (clearType === CLEAR_TYPES.date_range) {
      return fromDate && toDate ? { clearType, fromDate, toDate } : null
    }
    if (clearType === CLEAR_TYPES.all) {
      return { clearType: 'all' }
    }
    return null
  }, [clearType, beforeDate, fromDate, toDate])

  useEffect(() => {
    if (!open || !previewParams) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setPreviewLoading(true)
      try {
        const nextPreview = await fetchAuditClearPreview(previewParams)
        if (!cancelled) {
          setPreview(nextPreview)
          setError('')
        }
      } catch (e) {
        if (!cancelled) {
          setPreview(null)
          setError(String(e?.message || e))
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, previewParams])

  const canSubmit = useMemo(() => {
    if (clearType === CLEAR_TYPES.all) return confirmAll
    if (clearType === CLEAR_TYPES.before_date) return Boolean(beforeDate)
    if (clearType === CLEAR_TYPES.date_range) return Boolean(fromDate && toDate)
    return false
  }, [clearType, beforeDate, fromDate, toDate, confirmAll])

  if (!open) return null

  const allCount = ledgerTotal ?? totalInList ?? 0

  async function handleClear() {
    if (!canSubmit || !previewParams) return
    setSubmitting(true)
    setError('')
    try {
      const result = await clearAuditLogs(previewParams)
      onCleared?.(result)
      onClose?.()
    } catch (e) {
      setError(String(e?.message || e || 'Could not clear audit logs.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-audit-logs-title"
      >
        <h3 id="clear-audit-logs-title" className="text-lg font-bold text-neutral-900">
          Clear Audit Logs
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          Permanently removes selected audit log entries from this system. Better Auth cloud events are not deleted.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
            <input
              type="radio"
              name="clearType"
              className="mt-1"
              checked={clearType === CLEAR_TYPES.before_date}
              onChange={() => setClearType(CLEAR_TYPES.before_date)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-900">Before a date</span>
              <span className="mt-2 block text-xs font-medium text-neutral-500">Clear all logs before:</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
                value={beforeDate}
                onChange={(e) => setBeforeDate(e.target.value)}
                disabled={clearType !== CLEAR_TYPES.before_date}
              />
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50">
            <input
              type="radio"
              name="clearType"
              className="mt-1"
              checked={clearType === CLEAR_TYPES.date_range}
              onChange={() => setClearType(CLEAR_TYPES.date_range)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-900">Date range</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs font-medium text-neutral-500">
                  From
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    disabled={clearType !== CLEAR_TYPES.date_range}
                  />
                </label>
                <label className="text-xs font-medium text-neutral-500">
                  To
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    disabled={clearType !== CLEAR_TYPES.date_range}
                  />
                </label>
              </div>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3 hover:bg-red-50">
            <input
              type="radio"
              name="clearType"
              className="mt-1"
              checked={clearType === CLEAR_TYPES.all}
              onChange={() => setClearType(CLEAR_TYPES.all)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-red-800">Clear all logs</span>
              <p className="mt-1 text-sm font-medium text-red-700">
                This will permanently delete all{' '}
                <b>{Number(allCount).toLocaleString()}</b> local entries
                {ledgerBreakdown
                  ? ` (${formatClearPreviewBreakdown(ledgerBreakdown)})`
                  : ''}
                . This action cannot be undone.
              </p>
              {clearType === CLEAR_TYPES.all ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-800">
                  <input
                    type="checkbox"
                    checked={confirmAll}
                    onChange={(e) => setConfirmAll(e.target.checked)}
                  />
                  I understand this is permanent and cannot be undone
                </label>
              ) : null}
            </span>
          </label>
        </div>

        {previewParams && clearType !== CLEAR_TYPES.all ? (
          <p className="mt-3 text-sm font-semibold text-neutral-700">
            {previewLoading
              ? 'Calculating…'
              : preview != null
                ? `${Number(preview.count).toLocaleString()} ${preview.count === 1 ? 'entry' : 'entries'} will be deleted (${formatClearPreviewBreakdown(preview)}).`
                : null}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={handleClear}
            disabled={!canSubmit || submitting || previewLoading}
          >
            <span aria-hidden>🗑</span>
            {submitting ? 'Clearing…' : 'Clear Selected Logs'}
          </button>
        </div>
      </div>
    </div>
  )
}
