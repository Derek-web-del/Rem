import apiFetch from './apiClient.js'
import { apiUrl } from './lmsStateStorage.js'

/** Informational-only global school year (e.g. "2025-2026"). Read by Admin/Faculty/Student. */
export async function fetchSchoolYear() {
  try {
    const res = await apiFetch(apiUrl('/api/v1/school-year'), { softAuth: true })
    const data = await res.json().catch(() => ({}))
    return typeof data?.schoolYear === 'string' ? data.schoolYear : null
  } catch {
    return null
  }
}

/** Admin-only write. Throws ApiError on failure (e.g. invalid format, forbidden). */
export async function updateSchoolYear(schoolYear) {
  const res = await apiFetch(apiUrl('/api/v1/school-year'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolYear }),
  })
  return res.json().catch(() => ({}))
}
