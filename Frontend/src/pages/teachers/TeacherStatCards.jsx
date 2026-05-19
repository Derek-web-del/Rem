function HelpCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  )
}

function BriefcaseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  )
}

function LayoutGridOutlineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function PencilIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function StatCard({ label, value, icon }) {
  const IconComponent = icon
  const display = value === null || value === undefined || value === '' ? '—' : value
  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/90 p-5 shadow-sm">
      <div className="min-w-0 pr-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
        <div className="mt-2 break-words text-2xl font-bold tracking-tight text-neutral-900 tabular-nums sm:text-3xl">
          {display}
        </div>
      </div>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-200/80">
        <IconComponent className="h-6 w-6" />
      </div>
    </div>
  )
}

export default function TeacherStatCards({ totalQuery, totalAssignment, totalActivity, totalSections }) {
  const sec = totalSections ?? 0
  const act = totalActivity ?? 0
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="TOTAL STUDY MATERIALS" value={totalQuery} icon={HelpCircleIcon} />
      <StatCard label="TOTAL ASSIGNMENT" value={totalAssignment} icon={BriefcaseIcon} />
      <StatCard label="TOTAL ACTIVITIES" value={act} icon={PencilIcon} />
      <StatCard label="TOTAL SECTIONS" value={sec} icon={LayoutGridOutlineIcon} />
    </div>
  )
}
