import { useEffect, useMemo, useState } from 'react'
import { EVENT_LABELS, formatAuditTime, humanEventType } from '../lib/auditStatisticsCore.js'
import { fetchDashAuditLogs, mapDashAuditRows } from '../lib/dashAuditLogs.js'

const FILTERS = [
  { id: '', label: 'All events', types: [] },
  { id: 'sign-ins', label: 'Sign-ins', types: ['user_signed_in'] },
  { id: 'sign-ups', label: 'Sign-ups', types: ['user_signed_up', 'user_created'] },
  {
    id: 'profile',
    label: 'Profile updates',
    types: ['profile_updated', 'user_profile_updated', 'user_account_changed'],
  },
  { id: 'avatar', label: 'Profile photos', types: ['profile_image_updated', 'user_profile_image_updated'] },
  { id: 'password', label: 'Password changes', types: ['password_changed'] },
  { id: 'sessions', label: 'Sessions', types: ['session_created', 'session_revoked'] },
  { id: 'bans', label: 'User bans', types: ['user_banned'] },
]

function safeString(v) {
  try {
    if (v == null) return ''
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

function readChangedFields(details) {
  if (!details || typeof details !== 'object') return []
  const raw =
    details.updatedFields ||
    details.changed_fields ||
    (details.payload && typeof details.payload === 'object' ? details.payload.updatedFields : null) ||
    (details.payload && typeof details.payload === 'object' ? details.payload.changed_fields : null)
  if (Array.isArray(raw)) return raw.map((f) => String(f)).filter(Boolean)
  return []
}

function formatAccountChangedDetails(details) {
  const fields = readChangedFields(details)
  if (!fields.length) return '—'
  return `Changed Fields: ${fields.join(', ')}`
}

function eventLabel(eventType) {
  const key = String(eventType || '')
  return EVENT_LABELS[key] ? `${EVENT_LABELS[key]} (${key})` : humanEventType(key) || key || '—'
}

export default function AuditLogsViewer({ pageSize = 50 }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filterId, setFilterId] = useState('')
  const [adminOnlyErr, setAdminOnlyErr] = useState('')

  const activeFilter = useMemo(() => FILTERS.find((f) => f.id === filterId) || FILTERS[0], [filterId])

  async function load(nextOffset = offset) {
    setLoading(true)
    setErr('')
    setAdminOnlyErr('')
    try {
      const types = activeFilter.types
      const eventType = types.length === 1 ? types[0] : undefined

      const data = await fetchDashAuditLogs({
        limit: pageSize,
        offset: nextOffset,
        eventType,
      })

      let normalized = mapDashAuditRows(data.events)
      if (types.length > 1) {
        normalized = normalized.filter((r) => types.includes(String(r.eventType)))
      }

      setRows(normalized)
      setTotal(Number(data?.total ?? normalized.length ?? 0))
      setOffset(nextOffset)
    } catch (e) {
      const msg = String(e?.message || e || 'Could not load audit logs.')
      if (msg.toLowerCase().includes('admins only')) setAdminOnlyErr(msg)
      else setErr(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-700">Better Auth audit logs</div>
          <p className="mt-0.5 text-xs font-medium text-neutral-500">
            Powered by Better Auth Infra <code className="text-neutral-600">dash()</code> — profile, password, and
            session events from official auth endpoints.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800"
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load(offset)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {adminOnlyErr ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {adminOnlyErr}
        </div>
      ) : null}
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</div> : null}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Event Type</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-neutral-500" colSpan={4}>
                  No audit logs.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={`${r.time || 't'}-${idx}`} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 whitespace-nowrap">{formatAuditTime(r.time)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-neutral-900">{r.userEmail || '—'}</div>
                    <div className="text-xs text-neutral-500">{r.userId || '—'}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-neutral-900">{eventLabel(r.eventType)}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {String(r.eventType) === 'user_account_changed' ? (
                      <div className="text-sm text-neutral-700">
                        <div className="text-xs font-medium text-neutral-500">Fields changed</div>
                        <div className="mt-1 font-semibold">{formatAccountChangedDetails(r.details)}</div>
                      </div>
                    ) : (
                      <div className="truncate">{safeString(r.details) || '—'}</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-neutral-700">
            Offset <b>{offset}</b> • Showing <b>{rows.length}</b> • Total <b>{total}</b>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              disabled={offset <= 0 || loading}
              onClick={() => load(Math.max(0, offset - pageSize))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              disabled={rows.length < pageSize || loading}
              onClick={() => load(offset + pageSize)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
