import { apiUrl } from './lmsStateStorage.js'

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

function adminCurriculumPath(subjectId, suffix = '') {
  return apiUrl(`/api/admin/subjects/${encodeURIComponent(subjectId)}${suffix}`)
}

export async function fetchAdminSubjectTopics(subjectId) {
  const res = await fetch(adminCurriculumPath(subjectId, '/topics'), { credentials: 'include' })
  const data = await parseJson(res)
  return Array.isArray(data.topics) ? data.topics : []
}

export async function createAdminSubjectTopic(subjectId, payload) {
  const res = await fetch(adminCurriculumPath(subjectId, '/topics'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function updateAdminSubjectTopic(subjectId, topicId, payload) {
  const res = await fetch(adminCurriculumPath(subjectId, `/topics/${encodeURIComponent(topicId)}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export async function deleteAdminSubjectTopic(subjectId, topicId) {
  const res = await fetch(adminCurriculumPath(subjectId, `/topics/${encodeURIComponent(topicId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}

export async function fetchAdminSubjectLesson(subjectId, lessonId) {
  const res = await fetch(adminCurriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    credentials: 'include',
  })
  return parseJson(res)
}

export async function createAdminSubjectLessonMultipart(subjectId, formData) {
  const res = await fetch(adminCurriculumPath(subjectId, '/lessons'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  return parseJson(res)
}

export async function updateAdminSubjectLessonMultipart(subjectId, lessonId, formData) {
  const res = await fetch(adminCurriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  })
  return parseJson(res)
}

export async function deleteAdminSubjectLesson(subjectId, lessonId) {
  const res = await fetch(adminCurriculumPath(subjectId, `/lessons/${encodeURIComponent(lessonId)}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  return parseJson(res)
}
