import { apiUrl } from './lmsStateStorage.js'

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${res.status})`)
  }
  return data
}

function gradebookPath(subjectId, suffix = '') {
  return apiUrl(
    `/api/v1/teacher/subjects/${encodeURIComponent(subjectId)}/gradebook${suffix}`,
  )
}

export async function fetchSubjectGradebook(subjectId, { sectionId } = {}) {
  const params = new URLSearchParams()
  if (sectionId != null && String(sectionId).trim() !== '') {
    params.set('section_id', String(sectionId))
  }
  const qs = params.toString()
  const res = await fetch(gradebookPath(subjectId, qs ? `?${qs}` : ''), { credentials: 'include' })
  const data = await parseJson(res)
  return data.gradebook ?? data
}

export async function saveSubjectGradebookScores(subjectId, { scores, sectionId } = {}) {
  const res = await fetch(gradebookPath(subjectId, '/scores'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scores: Array.isArray(scores) ? scores : [],
      section_id: sectionId != null && String(sectionId).trim() !== '' ? Number(sectionId) : null,
    }),
  })
  return parseJson(res)
}
