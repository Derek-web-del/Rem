import { useEffect, useState } from 'react'
import { useNotify } from './notifications.jsx'

const REPORT_TYPES = [
  { value: 'all', label: 'All events' },
  { value: 'admin_actions', label: 'Admin actions' },
  { value: 'data_access', label: 'Data access' },
  { value: 'security_events', label: 'Security events' },
]

function filenameFromContentDisposition(header) {
  const match = /filename="?([^"; ]+)"?/i.exec(header || '')
  return match?.[1] || ''
}

export default function ComplianceExport({ onClose }) {
  const toast = useNotify()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reportType, setReportType] = useState('all')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const dTo = new Date()
    const dFrom = new Date()
    dFrom.setDate(dFrom.getDate() - 30)
    setFrom(dFrom.toISOString().slice(0, 10))
    setTo(dTo.toISOString().slice(0, 10))
  }, [])

  async function exportCsv() {
    setLoading(true)
    setErr('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('dateFrom', from)
      if (to) params.set('dateTo', to)
      params.set('reportType', reportType)

      const res = await fetch(`/api/monitoring/compliance-report?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || `Could not export compliance report (HTTP ${res.status}).`)
      }

      const blob = await res.blob()
      const filename =
        filenameFromContentDisposition(res.headers.get('content-disposition')) ||
        `lenlearn_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success('Compliance CSV exported.')
      onClose?.()
    } catch (e) {
      setErr(String(e?.message || e || 'Could not export compliance report.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
      <div className="text-sm font-bold text-neutral-900">RA 10173 Compliance Export</div>
      <div className="mt-1 text-xs font-medium text-neutral-500">
        Exports admin, data-access, and security audit events for a date range as CSV.
      </div>

      <div className="mt-3 grid gap-2">
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          From
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          To
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
          Report type
          <select
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-800"
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {REPORT_TYPES.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">
          {err}
        </div>
      ) : null}

      <button
        type="button"
        onClick={exportCsv}
        disabled={loading}
        className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
      >
        {loading ? 'Exporting…' : '🔒 Export CSV'}
      </button>
    </div>
  )
}
