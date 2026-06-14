import apiFetch from './apiClient.js'
import { fetchWithOfflineCache } from './offlineFetch.js'
import { apiUrl } from './lmsStateStorage.js'

export async function fetchStudentSubjectStream(subjectId) {
  const id = String(subjectId ?? '').trim()
  if (!id) throw new Error('Invalid subject id.')

  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'subject_streams',
    id,
    fetchOnline: async () => {
      const res = await apiFetch(apiUrl(`/api/v1/student/subjects/${encodeURIComponent(id)}/stream`))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.message || body?.error || 'Could not load subject stream.')
      }
      return Array.isArray(body.topics) ? body.topics : []
    },
    toCache: (topics) => ({ id, topics }),
    fromCache: (row) => (Array.isArray(row.topics) ? row.topics : null),
  })
  return { data, fromCache }
}
