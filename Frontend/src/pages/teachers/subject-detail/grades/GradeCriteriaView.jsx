function mapsToLabels(row) {
  const labels = []
  if (row?.is_quiz) labels.push('Quiz')
  if (row?.maps_to_assignment) labels.push('Assignment')
  if (row?.maps_to_activity) labels.push('Activity')
  if (Array.isArray(row?.maps_to) && row.maps_to.length) return row.maps_to
  return labels
}

function CriteriaBar({ name, pct, color }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-36 shrink-0 text-sm text-neutral-700">
        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {name}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold text-neutral-800">{pct}%</span>
    </div>
  )
}

export default function GradeCriteriaView({ criteria, subject }) {
  const rows = Array.isArray(criteria?.components) && criteria.components.length
    ? criteria.components
    : Array.isArray(criteria?.criteria) && criteria.criteria.length
      ? criteria.criteria
      : []
  const total = rows.reduce((s, r) => s + Number(r.percentage || 0), 0)
  const title = [subject?.subject_name, subject?.grade_level].filter(Boolean).join(' · ')

  return (
    <div>
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">Grade criteria{title ? ` — ${title}` : ''}</h3>
      </div>
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div>
          {rows.length === 0 ? (
            <p className="text-sm text-neutral-500">No grade components configured yet.</p>
          ) : null}
          {rows.map((row) => (
            <CriteriaBar key={row.name} name={row.name} pct={row.percentage} color={row.color} />
          ))}
          <div className="mt-2 flex items-center gap-3 border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
            <span className="w-36">Total</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-[#185FA5]" style={{ width: `${Math.min(total, 100)}%` }} />
            </div>
            <span className="w-10 text-right">{total}%</span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Maps to work types</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                <th className="py-2 pr-2">Component</th>
                <th className="py-2 pr-2">Weight</th>
                <th className="py-2">Maps to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-neutral-100">
                  <td className="py-2 pr-2">{row.name}</td>
                  <td className="py-2 pr-2">{row.percentage}%</td>
                  <td className="py-2">
                    {mapsToLabels(row).length ? (
                      <div className="flex flex-wrap gap-1">
                        {mapsToLabels(row).map((m) => (
                          <span key={m} className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-800">
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
