import apiFetch from './apiClient.js'
import { uploadsPathToApiUrl } from './fileUrls.js'
import { getListSnapshot, saveListSnapshot } from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'
import { resolveSubmissionStatusBadge } from './gradeStatus.js'

export {
  formatSubjectOption,
  formatDateYmd,
  isPastDeadline,
  isSubmissionScoreEditable,
  splitDeadlineToDateAndTime,
  combineDateAndTimeToIso,
  formatDeadlineDisplay,
  parseDeadlineInput,
} from './teacherAssignments.js'

export function mapActivityRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    title: String(row.title ?? '').trim(),
    description: String(row.description ?? '').trim(),
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    subject_name: String(row.subject_name ?? '').trim(),
    subject_code: String(row.subject_code ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    semester: row.semester != null ? String(row.semester) : '',
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    file_size: row.file_size != null ? Number(row.file_size) : null,
    grade_component_id: row.grade_component_id != null ? Number(row.grade_component_id) : null,
    grade_component_name: String(row.grade_component_name ?? '').trim(),
    total_score: row.total_score != null ? Number(row.total_score) : 100,
    submission_deadline: row.submission_deadline ?? null,
    uploaded_by: String(row.uploaded_by ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export function mapActivitySubmissionRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    activity_id: row.activity_id != null ? String(row.activity_id) : '',
    student_id: row.student_id != null ? String(row.student_id) : '',
    student_name: String(row.student_name ?? '').trim(),
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    score: row.score != null ? Number(row.score) : null,
    status: String(row.status ?? 'not_submitted').trim().toLowerCase(),
    submitted_at: row.submitted_at ?? null,
    total_score: row.total_score != null ? Number(row.total_score) : 100,
    late_submission_until: row.late_submission_until ?? null,
    has_late_extension: Boolean(row.has_late_extension),
    score_editable: row.score_editable !== false,
    score_locked: Boolean(row.score_locked),
  }
}

export function resolveActivityFileUrl(filePath) {
  return uploadsPathToApiUrl(filePath)
}

export async function fetchActivityFormOptions() {
  const res = await fetch(apiUrl('/api/teacher/activities/form-options'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load form options (${res.status}).`))
  }
  return {
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    gradeLevels: Array.isArray(data.gradeLevels) ? data.gradeLevels : [],
  }
}

export async function fetchTeacherActivities(page = 1, options = {}) {
  const limit = options.limit ?? 10
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (options.q) params.set('q', options.q)
  if (options.sortKey) params.set('sort', options.sortKey)
  if (options.sortDir) params.set('dir', options.sortDir)

  try {
    if (!isOnline()) throw new Error('offline')
    const res = await fetch(apiUrl(`/api/teacher/activities?${params.toString()}`), { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(String(data?.message || data?.error || `Failed to load activities (${res.status}).`))
    }
    const list = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.activities)
        ? data.activities
        : []
    const result = {
      data: list.map(mapActivityRow).filter(Boolean),
      total: Number(data.total ?? list.length) || 0,
      page: Number(data.page ?? page) || 1,
      limit: Number(data.limit ?? limit) || limit,
      totalPages: Number(data.totalPages ?? 1) || 1,
    }
    if (page === 1 && !options.q) {
      await saveListSnapshot('activities', result.data, 'faculty_list')
    }
    return result
  } catch (e) {
    const cached = await getListSnapshot('activities', 'faculty_list')
    if (cached.length > 0) {
      return {
        data: cached,
        total: cached.length,
        page: 1,
        limit,
        totalPages: 1,
        fromCache: true,
      }
    }
    throw e
  }
}

export async function fetchTeacherActivity(id) {
  const res = await fetch(apiUrl(`/api/teacher/activities/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load activity (${res.status}).`))
  }
  return mapActivityRow(data.activity)
}

export async function fetchTeacherActivitySubmissions(id) {
  const res = await fetch(
    apiUrl(`/api/teacher/activities/${encodeURIComponent(String(id))}/submissions`),
    { credentials: 'include' },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load submissions (${res.status}).`))
  }
  return {
    activity: mapActivityRow(data.activity),
    submissions: (Array.isArray(data.submissions) ? data.submissions : [])
      .map(mapActivitySubmissionRow)
      .filter(Boolean),
    expiredUpdated: Boolean(data.expiredUpdated),
  }
}

export async function createTeacherActivity(formData) {
  const res = await fetch(apiUrl('/api/teacher/activities'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to add activity.'))
  }
  return mapActivityRow(data.activity)
}

export async function updateTeacherActivity(id, formData) {
  const res = await fetch(apiUrl(`/api/teacher/activities/${encodeURIComponent(String(id))}`), {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update activity.'))
  }
  return mapActivityRow(data.activity)
}

export async function deleteTeacherActivity(id) {
  const res = await fetch(apiUrl(`/api/teacher/activities/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to delete activity.'))
  }
}

export async function updateActivitySubmissionScore(activityId, submissionId, score) {
  const res = await apiFetch(
    apiUrl(
      `/api/teacher/activities/${encodeURIComponent(String(activityId))}/submissions/${encodeURIComponent(String(submissionId))}/score`,
    ),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
      softAuth: true,
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update score.'))
  }
  return mapActivitySubmissionRow(data.submission)
}

export async function downloadActivityFile(activity) {
  const url = resolveActivityFileUrl(activity?.file_path)
  const name = String(activity?.file_name || activity?.title || 'activity').trim() || 'activity'
  if (!url) return false
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) return false
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
  return true
}

export async function downloadActivitySubmissionFile(submission) {
  const url = resolveActivityFileUrl(submission?.file_path)
  const name = String(submission?.file_name || 'submission').trim() || 'submission'
  if (!url) return false
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) return false
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
  return true
}

export function activitySubmissionStatusBadge(submission) {
  const total = submission?.total_score ?? 100
  return resolveSubmissionStatusBadge(submission, total)
}
