import apiFetch, { ApiError } from './apiClient.js'
import {
  cacheAnnouncements,
  cacheStudentProfile,
  getCachedAnnouncements,
  getCachedStudentProfile,
  getFromStore,
  getListSnapshot,
  saveListSnapshot,
  saveManyToStore,
  saveToStore,
} from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'
import { mapQuizRow } from './teacherQuizzes.js'
import { mapAnnouncementRow } from './teacherAnnouncements.js'
import { mapStudyMaterialRow } from './facultyStudyMaterials.js'
import { fetchMyGrades } from './gradesApi.js'
import { prefetchStudyMaterialPdfs } from './pdfCacheStatus.js'

class StudentApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.name = 'StudentApiError'
    this.status = status
    this.code = code
  }
}

async function studentApiJson(path, options = {}, { fallbackMessage, notFoundMessage } = {}) {
  try {
    const res = await apiFetch(apiUrl(path), options)
    return await res.json().catch(() => ({}))
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 404 && notFoundMessage) {
        throw new StudentApiError(notFoundMessage, { status: 404, code: 'NOT_FOUND' })
      }
      throw new StudentApiError(e.message, { status: e.status, code: e.code })
    }
    throw new StudentApiError(fallbackMessage || 'Request failed.')
  }
}

export async function fetchStudentSubject(subjectId) {
  const id = String(subjectId ?? '').trim()
  if (!id) {
    throw new StudentApiError('Invalid subject id.', { status: 400, code: 'BAD_REQUEST' })
  }
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson(`/api/v1/student/subjects/${encodeURIComponent(id)}`, {}, {
      fallbackMessage: 'Failed to load subject. Please try again.',
      notFoundMessage: 'Subject not found.',
    })
    const subject = data?.subject ?? data
    if (!subject || typeof subject !== 'object') {
      throw new StudentApiError('Subject not found.', { status: 404, code: 'NOT_FOUND' })
    }
    await saveToStore('subjects', { id, ...subject })
    return subject
  } catch (e) {
    const cached = await getFromStore('subjects', id)
    if (cached && cached.id) {
      const { cachedAt: _c, ...subject } = cached
      return subject
    }
    throw e
  }
}

export async function fetchStudentSubjectMaterials(subjectId) {
  const id = String(subjectId ?? '').trim()
  if (!id) {
    throw new StudentApiError('Invalid subject id.', { status: 400, code: 'BAD_REQUEST' })
  }
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson(
      `/api/v1/student/subjects/${encodeURIComponent(id)}/materials`,
      {},
      { fallbackMessage: 'Failed to load materials.', notFoundMessage: 'Subject not found.' },
    )
    const materials = Array.isArray(data.materials) ? data.materials : []
    await saveToStore('study_materials', { id: `subject:${id}`, items: materials })
    return materials
  } catch (e) {
    const cached = await getFromStore('study_materials', `subject:${id}`)
    if (cached?.items) return cached.items
    throw e
  }
}

export async function fetchStudentTermsStatus() {
  try {
    const res = await apiFetch(apiUrl('/api/v1/student/terms-status'), { softAuth: true })
    const data = await res.json().catch(() => ({}))
    return {
      accepted: data.accepted === true,
      acceptedAt: data.accepted_at ?? null,
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new StudentApiError('Failed to load terms status.')
  }
}

/** Post-login destination: terms gate first when not yet accepted in DB. */
export async function resolveStudentPostLoginPath() {
  try {
    const status = await fetchStudentTermsStatus()
    return status.accepted === true ? '/student/dashboard' : '/student/terms'
  } catch {
    return '/student/terms'
  }
}

export async function acceptStudentTerms() {
  return studentApiJson(
    '/api/v1/student/accept-terms',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { fallbackMessage: 'Failed to accept terms.' },
  )
}

/** Clear DB terms flag before sign-out so the next login shows the terms gate. */
export async function resetStudentTermsOnLogout() {
  try {
    await apiFetch(apiUrl('/api/v1/student/logout-terms-reset'), {
      method: 'POST',
      softAuth: true,
    })
  } catch {
    /* session may already be invalid */
  }
}

export function normalizeStudentProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile
  const loginId =
    String(profile.loginId || profile.login_id || profile.studentLoginId || '').trim() || 'N/A'
  return { ...profile, loginId, login_id: loginId, studentLoginId: loginId }
}

export async function fetchStudentProfile() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/profile', {}, {
      fallbackMessage: 'Failed to load profile.',
    })
    const profile = normalizeStudentProfile(data.profile)
    await cacheStudentProfile(profile)
    return profile
  } catch (e) {
    const cached = await getCachedStudentProfile()
    if (cached) return cached
    throw e
  }
}

export async function fetchStudentSubjects() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/subjects', {}, {
      fallbackMessage: 'Failed to load subjects.',
    })
    const subjects = Array.isArray(data.subjects) ? data.subjects : []
    await saveListSnapshot('subjects', subjects)
    await saveManyToStore(
      'subjects',
      subjects.map((s) => ({ id: String(s.id ?? s.subject_id ?? ''), ...s })).filter((s) => s.id),
    )
    return subjects
  } catch (e) {
    const cached = await getListSnapshot('subjects')
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchStudentAssignments() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/assignments', {}, {
      fallbackMessage: 'Failed to load assignments.',
    })
    const assignments = Array.isArray(data.assignments) ? data.assignments : []
    await saveListSnapshot('assignments', assignments)
    return assignments
  } catch (e) {
    const cached = await getListSnapshot('assignments')
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchStudentActivities() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/activities', {}, {
      fallbackMessage: 'Failed to load activities.',
    })
    const activities = Array.isArray(data.activities) ? data.activities : []
    await saveListSnapshot('activities', activities)
    return activities
  } catch (e) {
    const cached = await getListSnapshot('activities')
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchStudentQuizzesList() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/quizzes', {}, {
      fallbackMessage: 'Failed to load quizzes.',
    })
    const quizzes = (Array.isArray(data.quizzes) ? data.quizzes : []).map(mapQuizRow).filter(Boolean)
    await saveListSnapshot('quiz_list', quizzes)
    return quizzes
  } catch (e) {
    const cached = await getListSnapshot('quiz_list')
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchStudentAnnouncements() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/announcements', {}, {
      fallbackMessage: 'Failed to load announcements.',
    })
    const list = (Array.isArray(data.announcements) ? data.announcements : [])
      .map(mapAnnouncementRow)
      .filter(Boolean)
    await cacheAnnouncements(list)
    return list
  } catch (e) {
    const cached = await getCachedAnnouncements()
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchStudentAnnouncement(id) {
  const aid = String(id ?? '')
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson(
      `/api/v1/student/announcements/${encodeURIComponent(aid)}`,
      {},
      { fallbackMessage: 'Failed to load announcement.' },
    )
    const row = mapAnnouncementRow(data.announcement)
    await saveToStore('announcement_details', { id: aid, item: row })
    return row
  } catch (e) {
    const cached = await getFromStore('announcement_details', aid)
    if (cached?.item) return cached.item
    throw e
  }
}

export async function fetchStudentStudyMaterials() {
  try {
    if (!isOnline()) throw new StudentApiError('offline', { code: 'OFFLINE' })
    const data = await studentApiJson('/api/v1/student/study-materials', {}, {
      fallbackMessage: 'Failed to load study materials.',
    })
    const materials = (Array.isArray(data.materials) ? data.materials : []).map(mapStudyMaterialRow).filter(Boolean)
    await saveListSnapshot('study_materials', materials)
    return materials
  } catch (e) {
    const cached = await getListSnapshot('study_materials')
    if (cached.length > 0) return cached
    throw e
  }
}

/** Pre-fetch all student list endpoints while online (dashboard warmup for offline). */
export async function warmStudentOfflineCache() {
  if (!isOnline()) return
  await Promise.allSettled([
    fetchStudentSubjects(),
    fetchStudentAssignments(),
    fetchStudentActivities(),
    fetchStudentAnnouncements(),
    fetchStudentQuizzesList(),
    fetchStudentStudyMaterials(),
    fetchMyGrades(),
  ])
  try {
    const materials = await getListSnapshot('study_materials')
    await prefetchStudyMaterialPdfs(materials.map((m) => m?.file_url).filter(Boolean))
  } catch {
    void 0
  }
}

export async function verifyStudentQuizPassword(id, password) {
  try {
    const data = await studentApiJson(
      `/api/v1/student/quizzes/${encodeURIComponent(String(id))}/verify-password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      },
      { fallbackMessage: 'Incorrect password. Please try again.' },
    )
    if (!data?.success) {
      return { success: false, message: String(data?.message || 'Incorrect password. Please try again.') }
    }
    return { success: true }
  } catch (e) {
    const message =
      e instanceof StudentApiError
        ? e.message
        : 'Incorrect password. Please try again.'
    return { success: false, message }
  }
}

export function studentInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  return (parts[0]?.[0] || 'S').toUpperCase()
}

export function formatStudentDate(value) {
  if (!value || value === '—' || value === 'N/A') return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export { StudentApiError }
