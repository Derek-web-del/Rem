import apiFetch from './apiClient.js'

import { apiUrl } from './lmsStateStorage.js'



export async function fetchStudentSubjectModules(subjectId) {

  const res = await apiFetch(apiUrl(`/api/v1/student/subjects/${encodeURIComponent(subjectId)}/modules`))

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {

    throw new Error(data?.message || data?.error || 'Could not load subject modules.')

  }

  return Array.isArray(data.modules) ? data.modules : []

}


