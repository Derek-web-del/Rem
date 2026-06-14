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
  buildQuery,
  onToggle,
  onEditTopic,
  onDeleteTopic,
  onEditLesson,
  onDeleteLesson,
  onViewLesson,
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
      className={`border-b border-neutral-200 ${isTopicDropTarget ? 'ring-2 ring-inset ring-sky-200' : ''}`}
      onDragOver={editable ? (e) => onItemDragOver?.(e, topic.id, entries.length) : undefined}
      onDrop={editable ? (e) => onItemDrop?.(e, topic.id, entries.length) : undefined}
    >
      <div
        className={`flex items-center justify-between bg-neutral-50/80 px-4 py-3 ${isTopicDropTarget ? 'bg-sky-50/60' : ''}`}
        onDragOver={editable ? handleHeaderDragOver : undefined}
        onDrop={editable ? handleHeaderDrop : undefined}
      >
        {editable && topicDraggable && topic.id !== 'uncategorized' ? (
          <span
            draggable
            onDragStart={(e) => onTopicDragStart?.(e, topic)}
            onDragEnd={onTopicDragEnd}
            className="mr-1 shrink-0 cursor-grab rounded p-1 text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing"
            aria-label="Drag topic"
          >
            <i className="ti ti-grip-vertical" aria-hidden="true" />
          </span>
        ) : null}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-neutral-900"
          onClick={onToggle}
        >
          <i className={`ti ti-chevron-right text-xs transition-transform ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true" />
          <i className="ti ti-bookmark text-neutral-400" aria-hidden="true" />
          {topic.title}
        </button>
        <div className="flex items-center gap-1">
          {editable ? <TopicAddItemMenu subjectId={subjectId} topicId={topic.id} buildQuery={buildQuery} /> : null}
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
        <div>
          {entries.length === 0 ? (
            <p className="px-4 py-4 text-xs text-neutral-400">No items in this topic.</p>
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
                    editable={editable}
                    isDragOver={isOver}
                    onEdit={onEditLesson}
                    onDelete={onDeleteLesson}
                    onView={editable ? undefined : onViewLesson}
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
                  navPath={editable ? null : navFn(entry.data)}
                  editable={editable}
                  draggable={editable}
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
