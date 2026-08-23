import { WORK_TYPE_CONFIG } from './workRowConfig.js'

export default function LessonRow({
  lesson,
  editable = false,
  onEdit,
  onDelete,
  onView,
  isDragOver = false,
}) {
  const cfg = WORK_TYPE_CONFIG.lesson

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 ${isDragOver ? 'border-t-2 border-t-sky-400 bg-sky-50' : ''}`}
    >
      <button
        type="button"
        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${onView ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => onView?.(lesson)}
        disabled={!onView}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${cfg.bg}`}>
          <i className={`ti ${cfg.icon} text-sm ${cfg.color}`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">{lesson.title}</span>
          <span className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </span>
        {onView ? <i className="ti ti-chevron-right shrink-0 text-neutral-300" aria-hidden="true" /> : null}
      </button>
      {editable ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            onClick={() => onEdit?.(lesson)}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={() => onDelete?.(lesson)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
