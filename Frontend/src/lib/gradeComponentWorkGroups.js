import { groupItemsByComponent } from './gradebookCalc.js'

const ENTITY_TYPE_LABELS = {
  assignment: 'Assignment',
  activity: 'Activity',
  quiz: 'Quiz',
}

export function entityTypeLabel(entityType) {
  return ENTITY_TYPE_LABELS[String(entityType || '').toLowerCase()] || 'Work'
}

function workItemKey(item) {
  return `${item.entity_type}:${item.submission_id ?? item.entity_id ?? item.title}`
}

export function buildComponentWorkGroups(components, quizzes, assignments, activities) {
  const quizList = Array.isArray(quizzes) ? quizzes : []
  const assignmentList = Array.isArray(assignments) ? assignments : []
  const activityList = Array.isArray(activities) ? activities : []
  const compList = Array.isArray(components) ? components : []

  const allItems = [
    ...quizList.map((item) => ({ ...item, type: 'quiz' })),
    ...assignmentList.map((item) => ({ ...item, type: 'assignment' })),
    ...activityList.map((item) => ({ ...item, type: 'activity' })),
  ]

  const grouped = groupItemsByComponent(compList, allItems)
  const matchedKeys = new Set()
  const groups = []

  for (const comp of compList) {
    const compItems = grouped[String(comp.id)] || []
    if (!compItems.length) continue
    const items = compItems.map((item) => {
      const out = {
        ...item,
        entity_type: item.entity_type || item.type,
        entity_id: item.entity_id ?? item.id,
      }
      matchedKeys.add(workItemKey(out))
      return out
    })
    groups.push({ comp, items })
  }

  const unmatched = allItems.filter((item) => {
    const key = workItemKey({
      ...item,
      entity_type: item.entity_type || item.type,
      entity_id: item.entity_id ?? item.id,
    })
    return !matchedKeys.has(key)
  })

  if (unmatched.length) {
    groups.push({
      comp: { id: 'unassigned', name: 'Other graded work', percentage: null, color: '#9CA3AF' },
      items: unmatched.map((item) => ({
        ...item,
        entity_type: item.entity_type || item.type,
        entity_id: item.entity_id ?? item.id,
      })),
    })
  }

  return groups
}
