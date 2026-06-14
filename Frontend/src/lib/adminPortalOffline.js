import apiFetch from './apiClient.js'
import { fetchWithOfflineCache } from './offlineFetch.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'

async function adminFetchJson(path) {
  const res = await apiFetch(apiUrl(path), { softAuth: true })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status})`))
  }
  return data
}

export async function fetchAdminStudentsList() {
  return fetchWithOfflineCache({
    storeName: 'admin_students',
    id: 'list',
    fetchOnline: async () => {
      const data = await adminFetchJson('/api/v1/students')
      return Array.isArray(data.students) ? data.students : []
    },
    toCache: (items) => ({ id: 'list', items }),
    fromCache: (row) => (Array.isArray(row.items) ? row.items : null),
  })
}

export async function fetchAdminStudentProfile(studentId) {
  const id = String(studentId ?? '').trim()
  if (!id) throw new Error('Student id is required.')
  return fetchWithOfflineCache({
    storeName: 'admin_students',
    id,
    fetchOnline: async () => {
      const data = await adminFetchJson(`/api/v1/students/${encodeURIComponent(id)}`)
      return data.student ?? data
    },
    toCache: (student) => ({ id, student }),
    fromCache: (row) => (row.student && typeof row.student === 'object' ? row.student : null),
  })
}

export async function fetchAdminFacultiesList() {
  return fetchWithOfflineCache({
    storeName: 'admin_faculties',
    id: 'list',
    fetchOnline: async () => {
      const data = await adminFetchJson('/api/v1/faculty')
      return Array.isArray(data.faculty) ? data.faculty : []
    },
    toCache: (items) => ({ id: 'list', items }),
    fromCache: (row) => (Array.isArray(row.items) ? row.items : null),
  })
}

export async function fetchAdminSubjectsList() {
  return fetchWithOfflineCache({
    storeName: 'admin_subjects',
    id: 'list',
    fetchOnline: async () => {
      const data = await adminFetchJson('/api/v1/subjects')
      return Array.isArray(data.subjects) ? data.subjects : []
    },
    toCache: (items) => ({ id: 'list', items }),
    fromCache: (row) => (Array.isArray(row.items) ? row.items : null),
  })
}

export async function fetchAdminSectionsList() {
  return fetchWithOfflineCache({
    storeName: 'admin_sections',
    id: 'list',
    fetchOnline: async () => {
      const data = await adminFetchJson('/api/v1/sections')
      return Array.isArray(data.sections) ? data.sections : []
    },
    toCache: (items) => ({ id: 'list', items }),
    fromCache: (row) => (Array.isArray(row.items) ? row.items : null),
  })
}

/** Pre-fetch admin list endpoints while online (dashboard warmup; IndexedDB only, not SW). */
export async function warmAdminOfflineCache() {
  if (!isOnline()) return
  await Promise.allSettled([
    fetchAdminStudentsList(),
    fetchAdminFacultiesList(),
    fetchAdminSubjectsList(),
    fetchAdminSectionsList(),
  ])
}
