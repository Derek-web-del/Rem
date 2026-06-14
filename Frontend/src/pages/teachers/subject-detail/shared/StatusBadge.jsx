const TYPE_STYLES = {
  assignment: 'bg-amber-50 text-amber-800 border-amber-200',
  activity: 'bg-amber-50 text-amber-800 border-amber-200',
  quiz: 'bg-purple-50 text-purple-800 border-purple-200',
  material: 'bg-blue-50 text-blue-800 border-blue-200',
}

const STATUS_STYLES = {
  published: 'bg-green-50 text-green-800 border-green-200',
  draft: 'bg-neutral-100 text-neutral-600 border-neutral-200',
}

export function ItemTypeBadge({ type }) {
  const label = type === 'material' ? 'Material' : type === 'quiz' ? 'Quiz' : type === 'activity' ? 'Activity' : 'Assignment'
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[type] || 'bg-neutral-50 text-neutral-600'}`}>
      {label}
    </span>
  )
}

export default function StatusBadge({ status }) {
  const st = String(status || 'published').toLowerCase()
  const label = st === 'draft' ? 'Draft' : 'Published'
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[st] || STATUS_STYLES.published}`}>
      {label}
    </span>
  )
}
