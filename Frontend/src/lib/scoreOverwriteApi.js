import apiFetch from './apiClient.js'
import { apiUrl } from './lmsStateStorage.js'

async function json(path, options = {}) {
  const res = await apiFetch(apiUrl(path), options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || 'Request failed')
    err.code = data?.error
    err.status = res.status
    throw err
  }
  return data
}

export async function createTeacherScoreOverwriteRequest(payload) {
  return json('/api/v1/teacher/score-overwrite-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    softAuth: true,
  })
}

export async function fetchTeacherScoreOverwriteRequests({ status } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return json(`/api/v1/teacher/score-overwrite-requests${q}`, { softAuth: true })
}

export async function fetchAdminScoreOverwriteRequests({ status = 'pending' } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return json(`/api/v1/admin/score-overwrite-requests${q}`, { softAuth: true })
}

export async function reviewAdminScoreOverwriteRequest(id, { action, admin_notes }) {
  return json(`/api/v1/admin/score-overwrite-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, admin_notes }),
    softAuth: true,
  })
}
