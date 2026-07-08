/**
 * Visible role / access scope for portal headers (panel defense requirement).
 */
export function AdminAccessBadge({ displayName = '' }) {
  const name = String(displayName || '').trim()
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-800">
        System Administrator
      </span>
      <span className="text-neutral-600">
        Full institute access — roster, curriculum, audit logs, backup
        {name ? ` · ${name}` : ''}
      </span>
    </div>
  )
}

export function FacultyAccessBadge({ advisoryLabel = '', facultyCode = '' }) {
  const advisory = String(advisoryLabel || '').trim()
  const code = String(facultyCode || '').trim()
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
        Faculty Portal
      </span>
      <span className="text-neutral-600">
        Access: assigned subjects, advisory roster (no student PII), grades
        {code ? ` · ID ${code}` : ''}
        {advisory ? ` · Advisory: ${advisory}` : ''}
      </span>
    </div>
  )
}
