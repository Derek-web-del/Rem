// TODO: migrate to apiFetch from ./apiClient.js
import { uploadsPathToApiUrl } from './fileUrls.js'
import { cachePdfOnView } from './pdfCacheStatus.js'
import { fetchWithOfflineCache } from './offlineFetch.js'
import { apiUrl } from './lmsStateStorage.js'
import { formatDateYmd } from './teacherAssignments.js'
import { submissionStatusBadgeClass } from './gradeStatus.js'

export const STUDENT_WORK_PRIMARY = '#1e3a5f'

export const STUDENT_SUBMISSION_TYPE_MSG = 'Only PDF files are allowed.'

export function validateStudentSubmissionFileType(file) {
  if (!file) return ''
  const ext = String(file.name || '')
    .slice(String(file.name || '').lastIndexOf('.'))
    .toLowerCase()
  const mime = String(file.type || '').toLowerCase()
  if (ext === '.pdf' || mime === 'application/pdf') return ''
  return STUDENT_SUBMISSION_TYPE_MSG
}

export function workBadgeClasses(tone) {
  switch (tone) {
    case 'passed':
    case 'at_risk':
    case 'failed':
    case 'pending':
    case 'neutral':
      return submissionStatusBadgeClass(tone)
    case 'blue':
      return 'bg-blue-100 text-blue-800'
    case 'yellow':
      return 'bg-amber-100 text-amber-800'
    case 'green':
      return 'bg-emerald-100 text-emerald-800'
    case 'red':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-neutral-100 text-neutral-600'
  }
}

export function resolveStudentWorkFileUrl(filePath) {
  return uploadsPathToApiUrl(filePath)
}

async function parseWorkResponse(res, fallbackMessage) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || fallbackMessage))
  }
  return data
}

async function triggerBlobDownload(url, filename) {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error('Download failed.')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

function workApiBase(kind) {
  return kind === 'activity' ? '/api/v1/student/activities' : '/api/v1/student/assignments'
}

export async function fetchStudentWorkDetail(kind, id) {
  const base = workApiBase(kind)
  const key = `${kind}:${id}`
  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'work_details',
    id: key,
    fetchOnline: async () => {
      const res = await fetch(apiUrl(`${base}/${encodeURIComponent(String(id))}`), { credentials: 'include' })
      const body = await parseWorkResponse(res, `Failed to load ${kind}.`)
      const item = kind === 'activity' ? body.activity : body.assignment
      return { item, submission: body.submission ?? null }
    },
    toCache: (payload) => ({ id: key, ...payload }),
    fromCache: (row) => {
      if (!row?.item) return null
      return { item: row.item, submission: row.submission ?? null }
    },
  })
  const promptPath = data.item?.file_path || data.item?.prompt_file_path
  if (promptPath) void cachePdfOnView(promptPath)
  return { ...data, fromCache }
}

export async function submitStudentWorkFile(kind, id, file) {
  const typeErr = validateStudentSubmissionFileType(file)
  if (typeErr) throw new Error(typeErr)
  if (file?.size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds 10 MB limit. Please choose a smaller file.')
  }
  const base = workApiBase(kind)
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(apiUrl(`${base}/${encodeURIComponent(String(id))}/submit`), {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = await parseWorkResponse(res, 'Failed to submit file.')
  return data.submission ?? null
}

export async function downloadStudentWorkPrompt(kind, id, filename) {
  const base = workApiBase(kind)
  await triggerBlobDownload(
    apiUrl(`${base}/${encodeURIComponent(String(id))}/prompt-file`),
    filename || (kind === 'activity' ? 'activity.pdf' : 'assignment.pdf'),
  )
}

export async function downloadStudentWorkSubmission(kind, id, filename) {
  const base = workApiBase(kind)
  await triggerBlobDownload(
    apiUrl(`${base}/${encodeURIComponent(String(id))}/submission-file`),
    filename || 'submission',
  )
}

export function formatWorkDate(value) {
  return formatDateYmd(value)
}

export function formatWorkDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const ASSIGNMENT_WORK_CONFIG = {
  kind: 'assignment',
  navTitle: 'Assignments',
  pageHeader: 'Assignment Details',
  viewHeader: 'View Assignment',
  tabLabel: 'All Assignment',
  previewLabel: 'Assignment Preview',
  promptDownloadLabel: 'Download Assignment',
  listPath: '/student/assignments',
  viewPath: (id) => `/student/assignments/${id}`,
}

export const ACTIVITY_WORK_CONFIG = {
  kind: 'activity',
  navTitle: 'Activities',
  pageHeader: 'Activity Details',
  viewHeader: 'View Activity',
  tabLabel: 'All Activities',
  previewLabel: 'Activity Preview',
  promptDownloadLabel: 'Download Activity',
  listPath: '/student/activities',
  viewPath: (id) => `/student/activities/${id}`,
}
