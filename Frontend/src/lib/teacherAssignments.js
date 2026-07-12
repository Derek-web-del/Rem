import apiFetch from './apiClient.js'
import { uploadsPathToApiUrl } from './fileUrls.js'
import { getListSnapshot, saveListSnapshot } from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'
import { resolveSubmissionStatusBadge } from './gradeStatus.js'

async function teacherApiJson(path, options = {}) {
  const res = await apiFetch(apiUrl(path), options)
  return res.json().catch(() => ({}))
}

export function formatSubjectOption(subject) {
  const name = String(subject?.subject_name ?? '').trim()
  const grade = String(subject?.grade_level ?? '').trim()
  if (name && grade) return `${name} - ${grade}`
  return name || grade || 'Subject'
}

export function isPastDeadline(deadlineIso) {
  if (!deadlineIso) return false
  const d = new Date(deadlineIso)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

export function isSubmissionScoreEditable(submission, deadlineIso) {
  if (submission && typeof submission.score_editable === 'boolean') {
    return submission.score_editable
  }
  if (!deadlineIso || !isPastDeadline(deadlineIso)) return true
  const lateUntil = submission?.late_submission_until
  if (lateUntil) {
    const d = new Date(lateUntil)
    if (!Number.isNaN(d.getTime()) && d.getTime() >= Date.now()) return true
  }
  return false
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
    late_submission_until: row.late_submission_until ?? null,
    has_late_extension: Boolean(row.has_late_extension),
    score_editable: row.score_editable !== false,
    score_locked: Boolean(row.score_locked),
  }
}

export function resolveAssignmentFileUrl(filePath) {
  return uploadsPathToApiUrl(filePath)
}

export async function fetchAssignmentFormOptions() {
  const data = await teacherApiJson('/api/teacher/assignments/form-options')
  return {
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    gradeLevels: Array.isArray(data.gradeLevels) ? data.gradeLevels : [],
  }
}

export async function fetchTeacherSubjectsForAssignments() {
  const data = await teacherApiJson('/api/teacher/subjects')
  return Array.isArray(data) ? data : []
}

export async function fetchTeacherAssignments(page = 1, options = {}) {
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
    const data = await teacherApiJson(`/api/teacher/assignments?${params.toString()}`)
    const list = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.assignments)
        ? data.assignments
        : []
    const result = {
      data: list.map(mapAssignmentRow).filter(Boolean),
      total: Number(data.total ?? list.length) || 0,
      page: Number(data.page ?? page) || 1,
      limit: Number(data.limit ?? limit) || limit,
      totalPages: Number(data.totalPages ?? 1) || 1,
    }
    if (page === 1 && !options.q) {
      await saveListSnapshot('assignments', result.data, 'faculty_list')
    }
    return result
  } catch (e) {
    const cached = await getListSnapshot('assignments', 'faculty_list')
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

export async function fetchTeacherAssignment(id) {
  const data = await teacherApiJson(`/api/teacher/assignments/${encodeURIComponent(String(id))}`)
  return mapAssignmentRow(data.assignment)
}

export async function fetchTeacherAssignmentSubmissions(id) {
  const data = await teacherApiJson(
    `/api/teacher/assignments/${encodeURIComponent(String(id))}/submissions`,
  )
  return {
    assignment: mapAssignmentRow(data.assignment),
    submissions: (Array.isArray(data.submissions) ? data.submissions : [])
      .map(mapSubmissionRow)
      .filter(Boolean),
    expiredUpdated: Boolean(data.expiredUpdated),
  }
}

export async function createTeacherAssignment(formData) {
  const data = await teacherApiJson('/api/teacher/assignments', { method: 'POST', body: formData })
  return mapAssignmentRow(data.assignment)
}

export async function updateTeacherAssignment(id, formData) {
  const data = await teacherApiJson(`/api/teacher/assignments/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: formData,
  })
  return mapAssignmentRow(data.assignment)
}

export async function deleteTeacherAssignment(id) {
  await teacherApiJson(`/api/teacher/assignments/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
}

export async function updateSubmissionScore(assignmentId, submissionId, score) {
  const res = await apiFetch(
    apiUrl(
      `/api/teacher/assignments/${encodeURIComponent(String(assignmentId))}/submissions/${encodeURIComponent(String(submissionId))}/score`,
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
  return mapSubmissionRow(data.submission)
}

export async function downloadAssignmentFile(assignment) {
  const url = resolveAssignmentFileUrl(assignment?.file_path)
  const name = String(assignment?.file_name || assignment?.title || 'assignment').trim() || 'assignment'
  if (!url) return false
  let res
  try {
    res = await apiFetch(url)
  } catch {
    return false
  }
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
  let res
  try {
    res = await apiFetch(url)
  } catch {
    return false
  }
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
  return resolveSubmissionStatusBadge(submission, total)
}
