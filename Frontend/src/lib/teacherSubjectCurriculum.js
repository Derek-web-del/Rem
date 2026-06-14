import { apiUrl } from './lmsStateStorage.js'

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

function curriculumPath(subjectId, suffix = '') {
  return apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}${suffix}`)
}

export async function fetchSubjectModules(subjectId) {
  const res = await fetch(curriculumPath(subjectId, '/modules'), { credentials: 'include' })
  const data = await parseJson(res)
  return Array.isArray(data.modules) ? data.modules : []
}

export async function createSubjectModule(subjectId, payload) {
  const res = await fetch(curriculumPath(subjectId, '/modules'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function updateSubjectModule(subjectId, moduleId, payload) {
  const res = await fetch(curriculumPath(subjectId, `/modules/${encodeURIComponent(moduleId)}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function deleteSubjectModule(subjectId, moduleId) {
  const res = await fetch(curriculumPath(subjectId, `/modules/${encodeURIComponent(moduleId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}

export async function createModuleSubtopic(subjectId, moduleId, payload) {
  const res = await fetch(
    curriculumPath(subjectId, `/modules/${encodeURIComponent(moduleId)}/subtopics`),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  return parseJson(res)
}

export async function fetchSubjectTopics(subjectId) {
  const res = await fetch(curriculumPath(subjectId, '/topics'), { credentials: 'include' })
  const data = await parseJson(res)
  return Array.isArray(data.topics) ? data.topics : []
}

export async function createSubjectTopic(subjectId, payload) {
  const res = await fetch(curriculumPath(subjectId, '/topics'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function updateSubjectTopic(subjectId, topicId, payload) {
  const res = await fetch(curriculumPath(subjectId, `/topics/${encodeURIComponent(topicId)}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function deleteSubjectTopic(subjectId, topicId) {
  const res = await fetch(curriculumPath(subjectId, `/topics/${encodeURIComponent(topicId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}

export async function fetchSubjectStudents(subjectId) {
  const res = await fetch(curriculumPath(subjectId, '/students'), { credentials: 'include' })
  const data = await parseJson(res)
  return {
    students: Array.isArray(data.students) ? data.students : [],
    count: Number(data.count ?? 0),
  }
}

export async function fetchSubjectGradeCriteria(subjectId) {
  const res = await fetch(curriculumPath(subjectId, '/grade-criteria'), { credentials: 'include' })
  const data = await parseJson(res)
  return data.criteria || data
}

export async function fetchGradeComponentsForSubject(subjectId, workType, { includeComponentId = null } = {}) {
  const wt = String(workType || '').trim().toLowerCase()
  if (wt !== 'assignment' && wt !== 'activity' && wt !== 'quiz') {
    throw new Error('workType must be assignment, activity, or quiz.')
  }
  const params = new URLSearchParams()
  params.set('work_type', wt)
  const includeId = String(includeComponentId ?? '').trim()
  if (includeId) params.set('include_component_id', includeId)
  const res = await fetch(
    curriculumPath(subjectId, `/grade-components?${params.toString()}`),
    { credentials: 'include' },
  )
  const data = await parseJson(res)
  return Array.isArray(data.components) ? data.components : []
}

export async function saveSubjectGradeCriteria(subjectId, payload) {
  const res = await fetch(curriculumPath(subjectId, '/grade-criteria'), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await parseJson(res)
  return data.criteria || data
}


export async function patchItemStatus(itemType, itemId, status) {
  const pathMap = {
    assignment: 'assignments',
    activity: 'activities',
    quiz: 'quizzes',
    material: 'materials',
  }
  const segment = pathMap[itemType]
  if (!segment) throw new Error('Invalid item type.')
  const res = await fetch(apiUrl(`/api/teacher/${segment}/${encodeURIComponent(itemId)}/status`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return parseJson(res)
}

export async function moveCurriculumItem(payload) {
  const res = await fetch(apiUrl('/api/teacher/items/move'), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function reorderSubjectTopics(subjectId, topicIds) {
  const res = await fetch(curriculumPath(subjectId, '/topics/reorder'), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic_ids: topicIds }),
  })
  return parseJson(res)
}

export async function moveClassworkEntry(subjectId, { itemType, itemId, topicId, moduleOrder }) {
  const topicRaw = topicId === 'uncategorized' ? null : topicId
  const payload = {
    item_type: itemType,
    item_id: itemId,
    subject_id: subjectId,
    topic_id: topicRaw == null || topicRaw === '' ? null : topicRaw,
    module_order: moduleOrder,
  }
  return moveCurriculumItem(payload)
}

export async function deleteTeacherMaterial(materialId) {
  const res = await fetch(apiUrl(`/api/teacher/materials/${encodeURIComponent(materialId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}

export async function fetchTeacherSubject(subjectId) {
  const res = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}`), {
    credentials: 'include',
  })
  return parseJson(res)
}

export async function createSubjectLesson(subjectId, topicId, payload) {
  const res = await fetch(
    curriculumPath(subjectId, `/topics/${encodeURIComponent(topicId)}/lessons`),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  return parseJson(res)
}

export async function updateSubjectLesson(subjectId, lessonId, payload) {
  const res = await fetch(curriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function deleteSubjectLesson(subjectId, lessonId) {
  const res = await fetch(curriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}

export async function fetchSubjectLesson(subjectId, lessonId) {
  const res = await fetch(
    curriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`),
    { credentials: 'include' },
  )
  return parseJson(res)
}

export async function createSubjectLessonMultipart(subjectId, formData) {
  const res = await fetch(curriculumPath(subjectId, '/lessons'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return parseJson(res)
}

export async function updateSubjectLessonMultipart(subjectId, lessonId, formData) {
  const res = await fetch(curriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  })
  return parseJson(res)
}
