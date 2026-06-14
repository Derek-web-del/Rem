import apiFetch, { ApiError } from './apiClient.js'
import { apiUrl } from './lmsStateStorage.js'

export async function fetchFacultyTermsStatus() {
  try {
    const res = await apiFetch(apiUrl('/api/v1/faculty/terms-status'), { softAuth: true })
    const data = await res.json().catch(() => ({}))
    return {
      accepted: data.accepted === true,
      acceptedAt: data.accepted_at ?? null,
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return { accepted: false, acceptedAt: null, facultyNotLinked: true }
    }
    throw e
  }
}

export async function acceptFacultyTerms() {
  const res = await apiFetch(apiUrl('/api/v1/faculty/accept-terms'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.json().catch(() => ({}))
}
