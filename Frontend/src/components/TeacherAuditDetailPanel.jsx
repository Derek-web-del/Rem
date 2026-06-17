import { resolveAuditPortalAffected, resolveAuditPortalModule } from '../lib/auditPortalModules.js'

function isScalarDisplayValue(value) {
  return value == null || typeof value !== 'object'
}

function formatValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((item) => formatValue(item)).join(', ')
    }
    const entries = Object.entries(value)
    if (entries.length && entries.every(([, v]) => isScalarDisplayValue(v))) {
      return entries.map(([k, v]) => `${formatFieldLabel(k)}: ${formatValue(v)}`).join(' · ')
    }
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function formatFieldLabel(field) {
  return String(field || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function resolveStructuredDiffRows(ed) {
  const dd = ed?.detailedDiffs
  if (!dd || typeof dd !== 'object' || Array.isArray(dd)) return []
  return Object.entries(dd).map(([field, diff]) => ({
    field,
    before: diff?.old ?? diff?.before,
    after: diff?.new ?? diff?.after,
  }))
}

export default function TeacherAuditDetailPanel({ event, variant = 'inline' }) {
  const ed = event?.detailsObj || event?.raw?.eventData || {}
  const oldValues = ed?.old_values && typeof ed.old_values === 'object' ? ed.old_values : null
  const newValues = ed?.new_values && typeof ed.new_values === 'object' ? ed.new_values : null
  const changedFields = Array.isArray(ed?.changed_fields) ? ed.changed_fields : []
  const structuredRows = resolveStructuredDiffRows(ed)
  const isGradeCriteria = String(ed?.event_type || '').trim().toLowerCase() === 'grade_criteria_saved'
  const useStructuredDiff =
    isGradeCriteria ||
    (structuredRows.length > 0 &&
      structuredRows.every((row) => isScalarDisplayValue(row.before) && isScalarDisplayValue(row.after)))
  const diffFields =
    changedFields.length > 0
      ? changedFields
      : useStructuredDiff
        ? structuredRows.map((row) => row.field)
        : [...new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])]

  const isModal = variant === 'modal'
  const rootClass = isModal
    ? 'space-y-4 text-sm'
    : 'space-y-4 border-t border-neutral-100 bg-neutral-50 px-4 py-4 text-sm'
  const labelClass = isModal
    ? 'text-xs font-bold uppercase tracking-wider text-white/50'
    : 'text-xs font-bold uppercase tracking-wider text-neutral-500'
  const valueClass = isModal ? 'font-semibold text-white' : 'font-semibold text-neutral-900'
  const metaClass = isModal ? 'text-xs font-medium text-white/60' : 'text-xs font-medium text-neutral-500'
  const valueMutedClass = isModal ? 'text-white/80' : 'text-neutral-600'
  const valueStrongClass = isModal ? 'font-semibold text-white/90' : 'font-semibold text-neutral-700'
  const panelClass = isModal
    ? 'space-y-1 rounded-xl border border-white/10 bg-[#0f0f10] p-3'
    : 'space-y-1 rounded-lg border border-neutral-200 bg-white p-3'
  const chipClass = isModal
    ? 'rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-100'
    : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900'
  const tableWrapClass = isModal
    ? 'overflow-x-auto rounded-xl border border-white/10 bg-[#0f0f10]'
    : 'overflow-x-auto rounded-lg border border-neutral-200 bg-white'
  const tableHeadClass = isModal
    ? 'bg-white/5 text-xs font-bold uppercase tracking-wider text-white/50'
    : 'bg-neutral-50 text-xs font-bold uppercase tracking-wider text-neutral-500'
  const tableBodyDivide = isModal ? 'divide-y divide-white/10' : 'divide-y divide-neutral-100'
  const tableCellStrong = isModal ? 'font-semibold text-white/90' : 'font-semibold text-neutral-800'
  const tableCellMuted = isModal ? 'text-white/70' : 'text-neutral-600'

  return (
    <div className={rootClass}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className={labelClass}>Event type</div>
          <div className={valueClass}>{ed?.event_type || event?.eventType || '—'}</div>
        </div>
        <div>
          <div className={labelClass}>Teacher</div>
          <div className={valueClass}>{ed?.performed_by_name || ed?.userName || '—'}</div>
        </div>
        <div>
          <div className={labelClass}>Module</div>
          <div className={valueClass}>{ed?.module || '—'}</div>
        </div>
        <div>
          <div className={labelClass}>Action</div>
          <div className={valueClass}>{ed?.action || '—'}</div>
        </div>
        <div className="sm:col-span-2">
          <div className={labelClass}>Record affected</div>
          <div className={valueClass}>
            {ed?.target_label || '—'}
            {ed?.target_id ? <span className={`ml-2 ${metaClass}`}>ID: {ed.target_id}</span> : null}
          </div>
        </div>
        {ed?.user_agent ? (
          <div className="sm:col-span-2">
            <div className={labelClass}>User agent</div>
            <div className={`break-all text-xs ${metaClass}`}>{ed.user_agent}</div>
          </div>
        ) : null}
      </div>

      {changedFields.length ? (
        <div>
          <div className={`mb-1 ${labelClass}`}>Changed fields</div>
          <div className="flex flex-wrap gap-1.5">
            {changedFields.map((field) => (
              <span key={field} className={chipClass}>
                {formatFieldLabel(field)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!useStructuredDiff && oldValues && Object.keys(oldValues).length ? (
        <div>
          <div className={`mb-1 ${labelClass}`}>Before</div>
          <ul className={panelClass}>
            {Object.entries(oldValues).map(([field, value]) => (
              <li key={field} className="flex flex-wrap gap-2">
                <span className={valueStrongClass}>{formatFieldLabel(field)}:</span>
                <span className={valueMutedClass}>{formatValue(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!useStructuredDiff && newValues && Object.keys(newValues).length ? (
        <div>
          <div className={`mb-1 ${labelClass}`}>After</div>
          <ul className={panelClass}>
            {Object.entries(newValues).map(([field, value]) => (
              <li key={field} className="flex flex-wrap gap-2">
                <span className={valueStrongClass}>{formatFieldLabel(field)}:</span>
                <span className={valueMutedClass}>{formatValue(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {useStructuredDiff && structuredRows.length ? (
        <div>
          <div className={`mb-2 ${labelClass}`}>Changes</div>
          <div className={tableWrapClass}>
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Before</th>
                  <th className="px-3 py-2">After</th>
                </tr>
              </thead>
              <tbody className={tableBodyDivide}>
                {structuredRows.map((row) => (
                  <tr key={row.field}>
                    <td className={`px-3 py-2 ${tableCellStrong}`}>{formatFieldLabel(row.field)}</td>
                    <td className={`px-3 py-2 ${tableCellMuted}`}>{formatValue(row.before)}</td>
                    <td className={`px-3 py-2 ${tableCellMuted}`}>{formatValue(row.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!useStructuredDiff && oldValues && newValues && diffFields.length ? (
        <div>
          <div className={`mb-2 ${labelClass}`}>Side by side diff</div>
          <div className={tableWrapClass}>
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Before</th>
                  <th className="px-3 py-2">After</th>
                </tr>
              </thead>
              <tbody className={tableBodyDivide}>
                {diffFields.map((field) => (
                  <tr key={field}>
                    <td className={`px-3 py-2 ${tableCellStrong}`}>{formatFieldLabel(field)}</td>
                    <td className={`px-3 py-2 ${tableCellMuted}`}>{formatValue(oldValues?.[field])}</td>
                    <td className={`px-3 py-2 ${tableCellMuted}`}>{formatValue(newValues?.[field])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function isTeacherStructuredAuditEvent(event) {
  const ed = event?.detailsObj || event?.raw?.eventData || {}
  return Boolean(
    ed?.module ||
      ed?.event_type ||
      ed?.target_label ||
      ed?.old_values ||
      ed?.new_values ||
      ed?.detailedDiffs,
  )
}

export function teacherEventSubline(event) {
  const ed = event?.detailsObj || event?.raw?.eventData || {}
  if (!isTeacherStructuredAuditEvent(event)) return ''
  return ed?.action ? String(ed.action) : ''
}

export function auditRowModuleLabel(event) {
  return resolveAuditPortalModule(event)
}

export function auditRowAffectedLabel(event) {
  const portalAffected = resolveAuditPortalAffected(event)
  if (portalAffected) return portalAffected

  const ed = event?.detailsObj || event?.raw?.eventData || {}
  const raw = event?.raw || {}
  if (ed?.target_label) return String(ed.target_label)
  const targetName = ed?.targetName || raw?.targetName || ''
  const targetEmail = ed?.targetEmail || raw?.targetEmail || ''
  if (targetName || targetEmail) return targetName || targetEmail
  if (raw?.resourceId) return String(raw.resourceId)
  if (ed?.summary) return String(ed.summary)
  if (ed?.description) return String(ed.description)
  return '—'
}

export function teacherAuditRowSummary(event) {
  const ed = event?.detailsObj || event?.raw?.eventData || {}
  return ed?.summary || ed?.description || ed?.target_label || ''
}
