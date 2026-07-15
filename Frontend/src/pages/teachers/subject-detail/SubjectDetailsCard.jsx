import { formatSubjectScheduleLabel } from '../../../lib/subjectScheduleDisplay.js'

const ROWS = [
  { key: 'faculty_name', label: 'Faculty', icon: 'ti-user' },
  { key: 'subject_name', label: 'Subject name', icon: 'ti-book' },
  { key: 'grade_level', label: 'Grade level', icon: 'ti-school' },
  { key: 'section_name', label: 'Section', icon: 'ti-users' },
  { key: 'semester_label', label: 'Semester', icon: 'ti-layout-grid' },
]

function cell(value) {
  const s = value != null ? String(value).trim() : ''
  return s || '—'
}

export default function SubjectDetailsCard({ subject }) {
  if (!subject) return null
  const scheduleLabel = formatSubjectScheduleLabel(subject) || '—'

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Subject details</p>
      <dl className="space-y-2.5">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 text-sm">
            <dt className="flex min-w-0 items-center gap-2 text-neutral-500">
              <i className={`ti ${row.icon} text-base`} aria-hidden="true" />
              <span>{row.label}</span>
            </dt>
            <dd className="text-right font-medium text-neutral-900">{cell(subject[row.key])}</dd>
          </div>
        ))}
        <div className="flex items-start justify-between gap-3 text-sm">
          <dt className="flex min-w-0 items-center gap-2 text-neutral-500">
            <i className="ti ti-clock text-base" aria-hidden="true" />
            <span>Schedule</span>
          </dt>
          <dd className="max-w-[11rem] text-right text-sm font-medium leading-snug text-neutral-900">{scheduleLabel}</dd>
        </div>
      </dl>
    </aside>
  )
}
