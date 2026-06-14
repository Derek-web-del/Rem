import { Link } from 'react-router-dom'
import { WORK_TYPE_CONFIG, formatDueDate } from './workRowConfig.js'

const actionBtnProps = {
  draggable: false,
  onMouseDown: (e) => e.stopPropagation(),
  onPointerDown: (e) => e.stopPropagation(),
}

export default function WorkRow({
  item,
  navPath,
  editable = false,
  onEdit,
  onDelete,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragOver = false,
}) {
  const cfg = WORK_TYPE_CONFIG[item.item_type] || WORK_TYPE_CONFIG.material
  const points = item.total_score != null ? `${item.total_score} pts` : null

  const handleDragStart = (e) => {
    if (e.target.closest('button, a, input, textarea, select, [data-no-drag]')) {
      e.preventDefault()
      return
    }
    onDragStart?.(e)
  }

  const dragProps =
    editable && draggable
      ? {
          draggable: true,
          onDragStart: handleDragStart,
          onDragEnd,
        }
      : {}

  const inner = (
    <div className="flex flex-1 items-center justify-between gap-3 py-2.5">
      {editable && draggable ? (
        <span className="shrink-0 cursor-grab rounded p-1 text-neutral-400 active:cursor-grabbing" aria-hidden="true">
          <i className="ti ti-grip-vertical" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${cfg.bg}`}>
          <i className={`ti ${cfg.icon} ${cfg.color}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900">{item.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className={`rounded-full border px-2 py-0.5 font-semibold uppercase ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {points ? <span>{points}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2" data-no-drag={editable ? '' : undefined}>
        <span className="text-[11px] text-neutral-500">{formatDueDate(item.submission_deadline)}</span>
        {editable ? (
          <>
            <button
              type="button"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
              aria-label="Edit"
              {...actionBtnProps}
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.(item)
              }}
            >
              <i className="ti ti-pencil" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              {...actionBtnProps}
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(item)
              }}
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
    </div>
  )

  if (navPath && !editable) {
    return (
      <Link to={navPath} className={`block border-b border-neutral-100 px-4 hover:bg-neutral-50 ${isDragOver ? 'bg-sky-50' : ''}`}>
        {inner}
      </Link>
    )
  }
  return (
    <div
      className={`border-b border-neutral-100 px-4 hover:bg-neutral-50 ${isDragOver ? 'border-t-2 border-t-sky-400 bg-sky-50' : ''}`}
      {...dragProps}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
    >
      {inner}
    </div>
  )
}
