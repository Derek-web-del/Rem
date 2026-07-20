import apiFetch from './apiClient.js'
import { authClient } from './auth-client.js'
import { fetchWithOfflineCache } from './offlineFetch.js'
import { getFromStore, saveToStore } from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'

async function gradesJson(path) {
  const res = await fetch(apiUrl(path), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

/** @returns {Promise<{ success: boolean, subject: object }>} */
export async function fetchMySubjectGrades(subjectId) {
  const id = String(subjectId ?? '').trim()
  if (!id) throw new Error('Subject id is required.')
  const cacheKey = `my:subject:${id}`
  try {
    if (!isOnline()) throw new Error('offline')
    const data = await gradesJson(`/api/v1/grades/my/subject/${encodeURIComponent(id)}`)
    await saveToStore('grades', { id: cacheKey, data })
    return data
  } catch (e) {
    const cached = await getFromStore('grades', cacheKey)
    if (cached?.data) return cached.data
    throw e
  }
}

/** @returns {Promise<{ success: boolean, subjects: Array, has_any_scores: boolean }>} */
export async function fetchMyGrades() {
  try {
    if (!isOnline()) throw new Error('offline')
    const data = await gradesJson('/api/v1/grades/my')
    await saveToStore('grades', { id: 'my', data })
    return data
  } catch (e) {
    const cached = await getFromStore('grades', 'my')
    if (cached?.data) return cached.data
    throw e
  }
}

async function facultyCacheScope() {
  try {
    const { data } = await authClient.getSession()
    const userId = String(data?.user?.id ?? '').trim()
    if (userId) return `faculty:${userId}`
  } catch {
    /* use anonymous scope */
  }
  return 'faculty:anon'
}

/** @returns {Promise<{ success: boolean, subjects: Array, has_any_scores: boolean, fromCache?: boolean }>} */
export async function fetchStudentGrades(studentId, { isAdmin = false } = {}) {
  const id = String(studentId ?? '').trim()
  if (!id) throw new Error('Student id is required.')
  const scope = isAdmin ? '' : await facultyCacheScope()
  const cacheKey = isAdmin ? `student:${id}` : `${scope}:student:${id}`
  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'grades',
    id: cacheKey,
    fetchOnline: async () => gradesJson(`/api/v1/grades/student/${encodeURIComponent(id)}`),
    toCache: (payload) => ({ id: cacheKey, data: payload }),
    fromCache: (row) => (row.data && typeof row.data === 'object' ? row.data : null),
  })
  return { ...data, fromCache }
}

export async function fetchSectionGradesOverview(sectionId, { forceRefresh = false } = {}) {
  const section = String(sectionId ?? '').trim()
  if (!section) throw new Error('Section id is required.')
  const scope = await facultyCacheScope()
  const cacheKey = `${scope}:section:${section}`
  const path = `/api/v1/grades/section-overview?${new URLSearchParams({ section_id: section }).toString()}`

  if (forceRefresh && isOnline()) {
    const data = await gradesJson(path)
    await saveToStore('faculty_grades_overview', { id: cacheKey, ...data })
    return { ...data, fromCache: false }
  }

  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'faculty_grades_overview',
    id: cacheKey,
    fetchOnline: async () => gradesJson(path),
    toCache: (payload) => ({ id: cacheKey, ...payload }),
    fromCache: (row) => {
      if (!row || typeof row !== 'object') return null
      const { id: _id, cachedAt: _c, ...rest } = row
      return Object.keys(rest).length > 0 ? rest : null
    },
  })
  return { ...data, fromCache }
}

export async function adminGradeOverride({
  entity_type,
  submission_id = null,
  entity_id = null,
  student_id,
  new_score,
  reason,
}) {
  const res = await apiFetch(apiUrl('/api/v1/admin/grade-override'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type, submission_id, entity_id, student_id, new_score, reason }),
    softAuth: true,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

export async function adminGrantSubmissionExtension({
  entity_type,
  entity_id,
  student_id,
  until,
  reason,
}) {
  const res = await apiFetch(apiUrl('/api/v1/admin/submission-extension'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type, entity_id, student_id, until, reason }),
    softAuth: true,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

export async function adminUploadSubmissionOnBehalf({
  entity_type,
  entity_id,
  student_id,
  reason,
  file,
}) {
  const form = new FormData()
  form.append('entity_type', entity_type)
  form.append('entity_id', String(entity_id))
  form.append('student_id', String(student_id))
  form.append('reason', reason)
  form.append('file', file)
  const res = await fetch(apiUrl('/api/v1/admin/submission-extension/upload'), {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

export async function teacherGrantSubmissionExtension({
  entity_type,
  entity_id,
  student_id,
  until,
  reason,
}) {
  const res = await apiFetch(apiUrl('/api/v1/teacher/submission-extension'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_type, entity_id, student_id, until, reason }),
    softAuth: true,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

export async function teacherUploadSubmissionOnBehalf({
  entity_type,
  entity_id,
  student_id,
  reason,
  file,
}) {
  const form = new FormData()
  form.append('entity_type', entity_type)
  form.append('entity_id', String(entity_id))
  form.append('student_id', String(student_id))
  form.append('reason', reason)
  form.append('file', file)
  const res = await fetch(apiUrl('/api/v1/teacher/submission-extension/upload'), {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}
