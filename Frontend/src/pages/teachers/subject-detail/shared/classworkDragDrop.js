export function collectWorkItems(topic) {
  if (topic.items?.length) return topic.items
  return [
    ...(topic.assignments || []),
    ...(topic.activities || []),
    ...(topic.quizzes || []),
    ...(topic.materials || []),
  ]
}

export function buildTopicEntries(topic) {
  const lessons = (topic.lessons || []).map((lesson) => ({
    key: `lesson-${lesson.id}`,
    kind: 'lesson',
    sortOrder: Number(lesson.module_order ?? lesson.lesson_number ?? 0),
    data: lesson,
  }))
  const work = collectWorkItems(topic).map((item) => ({
    key: `${item.item_type}-${item.id}`,
    kind: 'work',
    sortOrder: Number(item.module_order ?? 0),
    data: item,
  }))
  return [...lessons, ...work].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
}

export function entryDragPayload(entry) {
  if (entry.kind === 'lesson') {
    return { itemType: 'lesson', itemId: entry.data.id }
  }
  return { itemType: entry.data.item_type, itemId: entry.data.id }
}

export function parseDragPayload(raw) {
  if (!raw) return null
  const plain = parsePlainDragPayload(raw)
  if (plain?.kind === 'item') return plain.payload
  try {
    const p = JSON.parse(raw)
    if (p?.itemType && p?.itemId != null) return p
  } catch {
    /* ignore */
  }
  return null
}

export function encodeItemDragPlain(payload) {
  return `item:${JSON.stringify(payload)}`
}

export function encodeTopicDragPlain(topic) {
  return `topic:${topic.id}`
}

export function parsePlainDragPayload(raw) {
  if (!raw || typeof raw !== 'string') return null
  if (raw.startsWith('topic:')) {
    const topicId = raw.slice(6).trim()
    return topicId ? { kind: 'topic', payload: { topicId } } : null
  }
  if (raw.startsWith('item:')) {
    try {
      const p = JSON.parse(raw.slice(5))
      if (p?.itemType && p?.itemId != null) return { kind: 'item', payload: p }
    } catch {
      /* ignore */
    }
  }
  return null
}

export function readDragDataFromEvent(e) {
  const plain = e.dataTransfer?.getData('text/plain') || ''
  const parsed = parsePlainDragPayload(plain)
  if (parsed) return parsed
  const itemRaw =
    e.dataTransfer?.getData('application/x-classwork-item') ||
    (plain && !plain.startsWith('topic:') ? plain : '')
  const item = parseDragPayload(itemRaw)
  if (item) return { kind: 'item', payload: item }
  const topicRaw = e.dataTransfer?.getData('application/x-classwork-topic') || ''
  const topic = parseTopicDragPayload(topicRaw)
  if (topic) return { kind: 'topic', payload: topic }
  return null
}

export function topicDragPayload(topic) {
  return JSON.stringify({ topicId: topic.id })
}

export function parseTopicDragPayload(raw) {
  if (!raw) return null
  const plain = parsePlainDragPayload(raw)
  if (plain?.kind === 'topic') return plain.payload
  try {
    const p = JSON.parse(raw)
    if (p?.topicId) return p
  } catch {
    /* ignore */
  }
  return null
}

export function reorderTopicList(topics, draggedTopicId, targetTopicId) {
  const real = topics.filter((t) => t.id !== 'uncategorized')
  const uncat = topics.find((t) => t.id === 'uncategorized')
  const fromIdx = real.findIndex((t) => t.id === draggedTopicId)
  const toIdx = real.findIndex((t) => t.id === targetTopicId)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return topics
  const next = [...real]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return uncat ? [uncat, ...next] : next
}

export function moveEntryInTopic(topic, payload, targetIndex) {
  const entries = buildTopicEntries(topic)
  const fromIdx = entries.findIndex(
    (e) =>
      (e.kind === 'lesson' && payload.itemType === 'lesson' && String(e.data.id) === String(payload.itemId)) ||
      (e.kind === 'work' &&
        payload.itemType === e.data.item_type &&
        String(e.data.id) === String(payload.itemId)),
  )
  if (fromIdx < 0) return entries
  const next = [...entries]
  const [moved] = next.splice(fromIdx, 1)
  const idx = Math.max(0, Math.min(targetIndex, next.length))
  next.splice(idx, 0, moved)
  return next
}

export function applyEntryOrderToTopic(topic, orderedEntries) {
  const lessonMap = new Map()
  const workMap = new Map()
  orderedEntries.forEach((entry, index) => {
    if (entry.kind === 'lesson') {
      lessonMap.set(String(entry.data.id), { ...entry.data, module_order: index })
    } else {
      workMap.set(`${entry.data.item_type}-${entry.data.id}`, { ...entry.data, module_order: index })
    }
  })
  const lessons = (topic.lessons || []).map((l) => lessonMap.get(String(l.id)) || l)
  const items = collectWorkItems(topic).map((it) => workMap.get(`${it.item_type}-${it.id}`) || it)
  return { ...topic, lessons, items }
}

export function removeEntryFromTopic(topic, payload) {
  const entries = buildTopicEntries(topic).filter(
    (e) =>
      !(
        (e.kind === 'lesson' && payload.itemType === 'lesson' && String(e.data.id) === String(payload.itemId)) ||
        (e.kind === 'work' &&
          payload.itemType === e.data.item_type &&
          String(e.data.id) === String(payload.itemId))
      ),
  )
  return applyEntryOrderToTopic(topic, entries)
}

export function insertEntryIntoTopic(topic, payload, entryData, targetIndex) {
  const kind = payload.itemType === 'lesson' ? 'lesson' : 'work'
  const key =
    kind === 'lesson' ? `lesson-${entryData.id}` : `${entryData.item_type}-${entryData.id}`
  const entries = buildTopicEntries(topic).filter((e) => e.key !== key)
  const newEntry = {
    key,
    kind,
    sortOrder: targetIndex,
    data: entryData,
  }
  const idx = Math.max(0, Math.min(targetIndex, entries.length))
  entries.splice(idx, 0, newEntry)
  return applyEntryOrderToTopic(topic, entries)
}
