import LessonRow from './LessonRow.jsx'
import WorkRow from './WorkRow.jsx'
import TopicAddItemMenu from './TopicAddItemMenu.jsx'
import { buildTopicEntries, entryDragPayload, readDragDataFromEvent } from './classworkDragDrop.js'
import { studentNavPath, teacherNavPath } from './workRowConfig.js'

export default function TopicGroup({
  topic,
  subjectId,
  role = 'teacher',
  editable = false,
  collapsed = false,
  buildQuery = () => '',
  showAddItemMenu = true,
  onToggle,
  onEditTopic,
  onDeleteTopic,
  onEditLesson,
  onDeleteLesson,
  onViewLesson,
  lessonsEditable = false,
  onEditWork,
  onDeleteWork,
  onTopicDragStart,
  onTopicDragEnd,
  onTopicDragOver,
  onTopicDrop,
  onItemDragStart,
  onItemDragEnd,
  onItemDragOver,
  onItemDrop,
  dragOverTopicId,
  dragOverItemKey,
  topicDraggable = false,
}) {
  const entries = buildTopicEntries(topic)
  const navFn = role === 'student' ? studentNavPath : teacherNavPath
  const isTopicDropTarget = dragOverTopicId === topic.id
  const itemCount = entries.length

  const handleHeaderDragOver = (e) => {
    e.preventDefault()
    onTopicDragOver?.(e, topic)
    onItemDragOver?.(e, topic.id, 0)
  }

  const handleHeaderDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const dragData = readDragDataFromEvent(e)
    if (dragData?.kind === 'topic') {
      onTopicDrop?.(e, topic)
    } else {
      onItemDrop?.(e, topic.id, 0)
    }
  }

  return (
    <div
      className={`mb-3 overflow-hidden rounded-xl border bg-white shadow-sm last:mb-0 ${isTopicDropTarget ? 'border-sky-300 ring-2 ring-sky-100' : 'border-neutral-200'}`}
      onDragOver={editable ? (e) => onItemDragOver?.(e, topic.id, entries.length) : undefined}
      onDrop={editable ? (e) => onItemDrop?.(e, topic.id, entries.length) : undefined}
    >
      <div
        className={`flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 ${isTopicDropTarget ? 'bg-sky-50' : ''}`}
        onDragOver={editable ? handleHeaderDragOver : undefined}
        onDrop={editable ? handleHeaderDrop : undefined}
      >
        {editable && topicDraggable && topic.id !== 'uncategorized' ? (
          <span
            draggable
            onDragStart={(e) => onTopicDragStart?.(e, topic)}
            onDragEnd={onTopicDragEnd}
            className="shrink-0 cursor-grab rounded p-1 text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
            aria-label="Drag topic"
          >
            <i className="ti ti-grip-vertical" aria-hidden="true" />
          </span>
        ) : null}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggle}>
          <i
            className={`ti ti-chevron-right shrink-0 text-sm text-neutral-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
            aria-hidden="true"
          />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-700">
            <i className="ti ti-books text-sm" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{topic.title}</span>
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {editable && showAddItemMenu ? (
            <TopicAddItemMenu
              subjectId={subjectId}
              topicId={topic.id}
              buildQuery={buildQuery}
              allowLessons={lessonsEditable}
            />
          ) : null}
          {editable && topic.id !== 'uncategorized' ? (
            <div className="flex items-center gap-1" data-no-drag="">
              <button
                type="button"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
                aria-label="Edit topic"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTopic?.(topic)
                }}
              >
                <i className="ti ti-pencil" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                draggable={false}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteTopic?.(topic)
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {!collapsed ? (
        <div className="divide-y divide-neutral-100">
          {entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-neutral-400">No items in this module yet.</p>
          ) : null}
          {entries.map((entry, index) => {
            const isOver = dragOverItemKey === `${topic.id}:${index}`
            const onDragStart = editable
              ? (e) => {
                  e.stopPropagation()
                  onItemDragStart?.(e, entry, topic.id)
                }
              : undefined
            const onDropAt = editable
              ? (e) => {
                  e.stopPropagation()
                  onItemDrop?.(e, topic.id, index)
                }
              : undefined
            if (entry.kind === 'lesson') {
              return (
                <div
                  key={entry.key}
                  onDragOver={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(e, topic.id, index) } : undefined}
                  onDrop={onDropAt}
                >
                  <LessonRow
                    lesson={entry.data}
                    editable={editable && lessonsEditable}
                    draggable={editable}
                    onDragStart={onDragStart}
                    onDragEnd={onItemDragEnd}
                    isDragOver={isOver}
                    onEdit={onEditLesson}
                    onDelete={onDeleteLesson}
                    onView={!lessonsEditable ? onViewLesson : undefined}
                  />
                </div>
              )
            }
            return (
              <div
                key={entry.key}
                onDragOver={editable ? (e) => { e.preventDefault(); e.stopPropagation(); onItemDragOver?.(e, topic.id, index) } : undefined}
                onDrop={onDropAt}
              >
                <WorkRow
                  item={entry.data}
                  subjectId={subjectId}
                  role={role}
                  navPath={editable ? null : navFn(entry.data)}
                  editable={editable}
                  draggable={editable && !entry.data?.is_syllabus && !entry.data?.is_locked}
                  onDragStart={onDragStart}
                  onDragEnd={onItemDragEnd}
                  isDragOver={isOver}
                  onEdit={onEditWork}
                  onDelete={onDeleteWork}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export { entryDragPayload }
