import { useEffect, useState } from 'react'
import { authClient } from '../lib/auth-client.js'
import { useNotify } from './notifications.jsx'

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function pickTime(e) {
  return e?.time || e?.timestamp || e?.createdAt || e?.created_at || e?.occurredAt || e?.occurred_at
}

export default function ComplianceExport() {
  const toast = useNotify()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const dTo = new Date()
    const dFrom = new Date()
    dFrom.setDate(dFrom.getDate() - 30)
    setFrom(dFrom.toISOString().slice(0, 10))
    setTo(dTo.toISOString().slice(0, 10))
  }, [])

  async function assertAdmin() {
    const s = await authClient.getSession()
    const role = s?.data?.user?.role
    if (role !== 'admin') throw new Error('Admins only: you do not have permission to export compliance reports.')
    return s
  }

  async function exportCsv() {
    setLoading(true)
    setErr('')
    try {
      const session = await assertAdmin()

      // Fetch pages until outside date range or cap.
      const dateFromIso = from ? new Date(`${from}T00:00:00.000`).toISOString() : ''
      const dateToIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : ''
      const fromMs = dateFromIso ? new Date(dateFromIso).getTime() : NaN
      const toMs = dateToIso ? new Date(dateToIso).getTime() : NaN

      const collected = []
      const limit = 200
      const maxPages = 10
      for (let page = 0; page < maxPages; page++) {
        const res = await authClient.dash.getAuditLogs({
          session: session.data,
          limit,
          offset: page * limit,
        })
        const data = res?.data
        const events = Array.isArray(data?.events) ? data.events : []
        if (events.length === 0) break

        for (const e of events) {
          const ts = pickTime(e)
          const ms = ts ? new Date(ts).getTime() : NaN
          if (Number.isFinite(fromMs) && Number.isFinite(ms) && ms < fromMs) continue
          if (Number.isFinite(toMs) && Number.isFinite(ms) && ms > toMs) continue
          collected.push(e)
        }

        const last = events[events.length - 1]
        const lastMs = pickTime(last) ? new Date(pickTime(last)).getTime() : NaN
        if (Number.isFinite(fromMs) && Number.isFinite(lastMs) && lastMs < fromMs) break
      }

      const rows = [
        ['Timestamp', 'User ID', 'User Email', 'Event Type', 'Details'],
        ...collected.map((e) => [
          String(pickTime(e) || ''),
          String(e?.userId || e?.user?.id || ''),
          String(e?.user?.email || e?.actor?.email || e?.email || ''),
          String(e?.eventType || e?.type || e?.event || ''),
          JSON.stringify(e?.details ?? e?.metadata ?? e?.data ?? {}),
        ]),
      ]

      const filename = `lenlearn_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`
      downloadCsv(filename, rows)
      toast.info('Compliance CSV exported.')
    } catch (e) {
      setErr(String(e?.message || e || 'Could not export compliance report.'))
      toast.error(String(e?.message || e || 'Could not export compliance report.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-neutral-900">RA 10173 Compliance Report</div>
          <div className="mt-1 text-sm font-medium text-neutral-500">Exports Better Auth audit logs for a date range.</div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
          disabled={loading}
        >
          🔒 Export RA 10173 Compliance Report
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-neutral-700">
          From
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm font-semibold text-neutral-700">
          To
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      {err ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</div> : null}
    </div>
  )
}

