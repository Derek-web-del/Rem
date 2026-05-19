import { apiUrl } from './lmsStateStorage.js'

export function formatSubjectOption(subject) {
  const name = String(subject?.subject_name ?? '').trim()
  const grade = String(subject?.grade_level ?? '').trim()
  if (name && grade) return `${name} - ${grade}`
  return name || grade || 'Subject'
}

export function formatDateYmd(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function splitDeadlineToDateAndTime(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export function combineDateAndTimeToIso(dateStr, timeStr) {
  const date = String(dateStr ?? '').trim()
  const time = String(timeStr ?? '').trim()
  if (!date || !time) return null
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null
  const y = Number(dateMatch[1])
  const m = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const h = Number(timeMatch[1])
  const min = Number(timeMatch[2])
  const dt = new Date(y, m - 1, day, h, min, 0, 0)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

export function formatDeadlineDisplay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${mm}-${dd}-${yyyy} ${hours}:${minutes} ${ampm}`
}

export function parseDeadlineInput(value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s)
  if (m) {
    let hour = Number.parseInt(m[4], 10)
    const minute = Number.parseInt(m[5], 10)
    const ampm = m[6].toUpperCase()
    if (ampm === 'PM' && hour < 12) hour += 12
    if (ampm === 'AM' && hour === 12) hour = 0
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, minute, 0, 0)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const fallback = new Date(s)
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString()
  return null
}

export function mapAssignmentRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    title: String(row.title ?? '').trim(),
    description: String(row.description ?? '').trim(),
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    subject_name: String(row.subject_name ?? '').trim(),
    subject_code: String(row.subject_code ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    quarter: row.quarter != null ? String(row.quarter) : '',
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    file_size: row.file_size != null ? Number(row.file_size) : null,
    total_score: row.total_score != null ? Number(row.total_score) : 100,
    submission_deadline: row.submission_deadline ?? null,
    uploaded_by: String(row.uploaded_by ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export function mapSubmissionRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    assignment_id: row.assignment_id != null ? String(row.assignment_id) : '',
    student_id: row.student_id != null ? String(row.student_id) : '',
    student_name: String(row.student_name ?? '').trim(),
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    score: row.score != null ? Number(row.score) : null,
    status: String(row.status ?? 'not_submitted').trim().toLowerCase(),
    submitted_at: row.submitted_at ?? null,
    total_score: row.total_score != null ? Number(row.total_score) : 100,
  }
}

export function resolveAssignmentFileUrl(filePath) {
  const path = String(filePath ?? '').trim()
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return apiUrl(path.startsWith('/') ? path : `/${path}`)
}

export async function fetchAssignmentFormOptions() {
  const res = await fetch(apiUrl('/api/teacher/assignments/form-options'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load form options (${res.status}).`))
  }
  return {
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    gradeLevels: Array.isArray(data.gradeLevels) ? data.gradeLevels : [],
  }
}

export async function fetchTeacherSubjectsForAssignments() {
  const res = await fetch(apiUrl('/api/teacher/subjects'), { credentials: 'include' })
  const data = await res.json().catch(() => [])
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      `Failed to load subjects (${res.status}).`
    throw new Error(String(msg))
  }
  return Array.isArray(data) ? data : []
}

export async function fetchTeacherAssignments(page = 1, options = {}) {
  const limit = options.limit ?? 5
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })
  if (options.q) params.set('q', options.q)
  if (options.sortKey) params.set('sort', options.sortKey)
  if (options.sortDir) params.set('dir', options.sortDir)

  const res = await fetch(apiUrl(`/api/teacher/assignments?${params.toString()}`), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load assignments (${res.status}).`))
  }
  const list = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.assignments)
      ? data.assignments
      : []
  return {
    data: list.map(mapAssignmentRow).filter(Boolean),
    total: Number(data.total ?? list.length) || 0,
    page: Number(data.page ?? page) || 1,
    limit: Number(data.limit ?? limit) || limit,
    totalPages: Number(data.totalPages ?? 1) || 1,
  }
}

export async function fetchTeacherAssignment(id) {
  const res = await fetch(apiUrl(`/api/teacher/assignments/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load assignment (${res.status}).`))
  }
  return mapAssignmentRow(data.assignment)
}

export async function fetchTeacherAssignmentSubmissions(id) {
  const res = await fetch(
    apiUrl(`/api/teacher/assignments/${encodeURIComponent(String(id))}/submissions`),
    { credentials: 'include' },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load submissions (${res.status}).`))
  }
  return {
    assignment: mapAssignmentRow(data.assignment),
    submissions: (Array.isArray(data.submissions) ? data.submissions : [])
      .map(mapSubmissionRow)
      .filter(Boolean),
    expiredUpdated: Boolean(data.expiredUpdated),
  }
}

export async function createTeacherAssignment(formData) {
  const res = await fetch(apiUrl('/api/teacher/assignments'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || data?.error || 'Failed to add assignment.'))
  }
  return mapAssignmentRow(data.assignment)
}

export async function updateTeacherAssignment(id, formData) {
  const res = await fetch(apiUrl(`/api/teacher/assignments/${encodeURIComponent(String(id))}`), {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update assignment.'))
  }
  return mapAssignmentRow(data.assignment)
}

export async function deleteTeacherAssignment(id) {
  const res = await fetch(apiUrl(`/api/teacher/assignments/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to delete assignment.'))
  }
}

export async function updateSubmissionScore(assignmentId, submissionId, score) {
  const res = await fetch(
    apiUrl(
      `/api/teacher/assignments/${encodeURIComponent(String(assignmentId))}/submissions/${encodeURIComponent(String(submissionId))}/score`,
    ),
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update score.'))
  }
  return mapSubmissionRow(data.submission)
}

export async function downloadAssignmentFile(assignment) {
  const url = resolveAssignmentFileUrl(assignment?.file_path)
  const name = String(assignment?.file_name || assignment?.title || 'assignment').trim() || 'assignment'
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

export async function downloadSubmissionFile(submission) {
  const url = resolveAssignmentFileUrl(submission?.file_path)
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

export function submissionStatusBadge(submission) {
  const total = submission?.total_score ?? 100
  const status = String(submission?.status ?? 'not_submitted').toLowerCase()
  const score = submission?.score

  if (status === 'expired') {
    return { label: `0/${total}`, tone: 'red' }
  }
  if (status === 'not_submitted') {
    return { label: 'Not Submitted', tone: 'red' }
  }
  if (score != null && Number.isFinite(score)) {
    return { label: `Score: ${score}/${total}`, tone: 'yellow' }
  }
  if (status === 'submitted' || submission?.submitted_at) {
    return { label: 'Submitted - Pending', tone: 'yellow' }
  }
  return { label: 'Not Submitted', tone: 'red' }
}
