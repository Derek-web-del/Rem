export const WORK_TYPE_CONFIG = {
  assignment: { label: 'Assignment', icon: 'ti-clipboard-list', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  activity: { label: 'Activity', icon: 'ti-run', color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  quiz: { label: 'Quiz', icon: 'ti-pencil', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  material: { label: 'Material', icon: 'ti-file-text', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  lesson: { label: 'Lesson', icon: 'ti-book-2', color: 'text-neutral-600', bg: 'bg-neutral-50 border-neutral-200' },
}

export function formatDueDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function teacherNavPath(item) {
  const id = item.id
  switch (item.item_type) {
    case 'assignment':
      return `/teacher/assignments/${id}`
    case 'activity':
      return `/teacher/activities/${id}`
    case 'quiz':
      return `/teacher/quizzes/${id}`
    case 'material':
      return null
    default:
      return null
  }
}

export function studentNavPath(item) {
  const id = item.id
  switch (item.item_type) {
    case 'assignment':
      return `/student/assignments/${id}`
    case 'activity':
      return `/student/activities/${id}`
    case 'quiz':
      return `/student/quizzes/${id}/take`
    default:
      return null
  }
}
