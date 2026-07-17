import { Fragment, useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'

const STATUS_OPTIONS = [
  { id: '', label: 'All statuses' },
  { id: 'open', label: 'Open' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
]

const SEVERITY_OPTIONS = [
  { id: '', label: 'All severities' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
]

const TYPE_OPTIONS = [
  { id: '', label: 'All types' },
  { id: 'AUTH_BRUTE_FORCE', label: 'Login lockout' },
  { id: 'QUIZ_INTEGRITY', label: 'Quiz integrity' },
  { id: 'DATA_RECOVERY_EVENT', label: 'Data recovery' },
]

const TYPE_LABELS = {
  AUTH_BRUTE_FORCE: 'Login lockout',
  QUIZ_INTEGRITY: 'Quiz integrity',
  DATA_RECOVERY_EVENT: 'Data recovery',
}

const STATUS_BADGE_CLASS = {
  open: 'bg-red-50 text-red-700 border-red-200',
  investigating: 'bg-amber-50 text-amber-800 border-amber-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}

const SEVERITY_BADGE_CLASS = {
  low: 'bg-neutral-100 text-neutral-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-100 text-red-800',
}

function mapIncidentsApiError(res, data) {
  if (res.status === 403) return 'Access denied. Sign in as an institute administrator.'
  if (res.status === 503) {
    return String(data?.message || 'The system database is not available. Please try again later.')
  }
  const msg = String(data?.message || data?.error || '').trim()
  if (msg && msg !== 'Something went wrong. Please try again.') return msg
  if (res.status >= 500) {
    return 'The server could not load incidents. Please refresh the page or try again in a moment.'
  }
  return msg || 'Could not load incidents.'
}

function formatDateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function incidentTypeLabel(t) {
  return TYPE_LABELS[t] || String(t || '').replace(/_/g, ' ')
}

export default function IncidentResponsePage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [incidents, setIncidents] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [drafts, setDrafts] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (severityFilter) params.set('severity', severityFilter)
      if (typeFilter) params.set('incident_type', typeFilter)
      const res = await fetch(apiUrl(`/api/v1/admin/security-incidents?${params.toString()}`), {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = mapIncidentsApiError(res, data)
        setLoadError(msg)
        setIncidents([])
        return
      }
      setIncidents(Array.isArray(data.incidents) ? data.incidents : [])
    } catch (e) {
      setLoadError(String(e?.message || 'Could not load incidents.'))
      setIncidents([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

  function draftFor(incident) {
    return (
      drafts[incident.id] || {
        status: incident.status,
        assignedTo: incident.assigned_to || '',
        resolutionNotes: incident.resolution_notes || '',
      }
    )
  }

  function updateDraft(incident, patch) {
    setDrafts((prev) => ({
      ...prev,
      [incident.id]: { ...draftFor(incident), ...prev[incident.id], ...patch },
    }))
  }

  async function saveIncident(incident) {
    const draft = draftFor(incident)
    setSavingId(incident.id)
    try {
      const res = await fetch(apiUrl(`/api/v1/admin/security-incidents/${incident.id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: draft.status,
          assignedTo: draft.assignedTo,
          resolutionNotes: draft.resolutionNotes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(mapIncidentsApiError(res, data))
      toast.success('Incident updated.')
      await load()
    } catch (e) {
      toast.error(String(e?.message || e))
    } finally {
      setSavingId(null)
    }
  }

  const openCount = incidents.filter((i) => i.status === 'open').length
  const highSeverityCount = incidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-neutral-900">Incident Response</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Tracked security cases detected from login lockouts, quiz integrity violations, and backup restores.
          Triage, assign, and resolve them here.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">Open incidents</div>
          <div className="text-2xl font-bold text-neutral-900">{openCount}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">High / critical</div>
          <div className="text-2xl font-bold text-neutral-900">{highSeverityCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-[42px] rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.id || 'all'} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="h-[42px] rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          {SEVERITY_OPTIONS.map((o) => (
            <option key={o.id || 'all'} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className="h-[42px] rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.id || 'all'} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="h-[42px] rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          Refresh
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{loadError}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Incident</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detected</th>
                <th className="px-4 py-3 text-right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {incidents.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-neutral-500" colSpan={5}>
                    No incidents match the current filters.
                  </td>
                </tr>
              ) : (
                incidents.map((incident) => {
                  const draft = draftFor(incident)
                  const expanded = expandedId === incident.id
                  return (
                    <Fragment key={incident.id}>
                      <tr
                        className="cursor-pointer hover:bg-neutral-50"
                        onClick={() => setExpandedId(expanded ? null : incident.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-900">{incidentTypeLabel(incident.incident_type)}</div>
                          <div className="text-xs font-medium text-neutral-500">{incident.summary}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE_CLASS[incident.severity] || SEVERITY_BADGE_CLASS.medium}`}
                          >
                            {incident.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[incident.status] || STATUS_BADGE_CLASS.open}`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-neutral-700">
                          {formatDateTime(incident.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-sm font-semibold text-blue-700 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedId(expanded ? null : incident.id)
                            }}
                          >
                            {expanded ? 'Hide' : 'Triage'}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-neutral-50/60">
                          <td className="px-4 py-4" colSpan={5}>
                            <div className="grid gap-4 md:grid-cols-3">
                              <label className="text-sm font-medium text-neutral-700">
                                Status
                                <select
                                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                  value={draft.status}
                                  onChange={(e) => updateDraft(incident, { status: e.target.value })}
                                >
                                  {STATUS_OPTIONS.filter((o) => o.id).map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-sm font-medium text-neutral-700">
                                Assigned to
                                <input
                                  type="text"
                                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                  placeholder="Admin name or ID"
                                  value={draft.assignedTo}
                                  onChange={(e) => updateDraft(incident, { assignedTo: e.target.value })}
                                />
                              </label>
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  disabled={savingId === incident.id}
                                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                  onClick={() => saveIncident(incident)}
                                >
                                  {savingId === incident.id ? 'Saving…' : 'Save changes'}
                                </button>
                              </div>
                              <label className="text-sm font-medium text-neutral-700 md:col-span-3">
                                Resolution notes
                                <textarea
                                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                                  rows={2}
                                  placeholder="What was done to investigate or resolve this incident?"
                                  value={draft.resolutionNotes}
                                  onChange={(e) => updateDraft(incident, { resolutionNotes: e.target.value })}
                                />
                              </label>
                              <div className="text-xs font-medium text-neutral-500 md:col-span-3">
                                {incident.affected_user_label ? (
                                  <div>Affected: {incident.affected_user_label}</div>
                                ) : null}
                                {incident.resolved_at ? <div>Resolved: {formatDateTime(incident.resolved_at)}</div> : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
