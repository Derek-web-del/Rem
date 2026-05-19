import { apiUrl } from './lmsStateStorage.js'
import { mapQuizRow } from './teacherQuizzes.js'

export {
  formatDateYmd,
  formatDeadlineDisplay,
  formatDurationMins,
  QUESTION_TYPE_LABELS,
  quizDisplayType,
  typeBadgeClass,
} from './teacherQuizzes.js'

export async function fetchStudentQuizzes() {
  const res = await fetch(apiUrl('/api/v1/quizzes'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load quizzes (${res.status}).`))
  }
  const list = Array.isArray(data.quizzes) ? data.quizzes : Array.isArray(data.data) ? data.data : []
  return list.map(mapQuizRow).filter(Boolean)
}

export async function fetchStudentQuiz(id) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(String(data?.message || data?.error || `Failed to load quiz (${res.status}).`))
    err.code = data?.error
    err.passwordRequired = res.status === 403 && data?.error === 'PASSWORD_REQUIRED'
    throw err
  }
  return mapQuizRow(data.quiz)
}

export async function verifyStudentQuizPassword(id, password) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}/verify-password`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.success) {
    return {
      success: false,
      message: String(data?.message || 'Incorrect password. Please try again.'),
    }
  }
  return { success: true }
}
