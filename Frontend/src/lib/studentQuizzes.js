// TODO: migrate to apiFetch from ./apiClient.js
import { fetchWithOfflineCache } from './offlineFetch.js'
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

import { verifyStudentQuizPassword as verifyStudentQuizPasswordApi } from './studentPortal.js'

async function parseJson(res, fallback) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(String(data?.message || data?.error || fallback))
    err.code = data?.error
    throw err
  }
  return data
}

export function quizStatusBadgeClass(tone) {
  switch (tone) {
    case 'green':
      return 'bg-emerald-100 text-emerald-800'
    case 'blue':
      return 'bg-sky-100 text-sky-800'
    case 'yellow':
      return 'bg-amber-100 text-amber-800'
    case 'red':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-neutral-100 text-neutral-700'
  }
}

export function mapStudentQuizListRow(row) {
  if (!row) return null
  return {
    ...mapQuizRow(row),
    submission_id: row.submission_id ?? '',
    submission_status: row.submission_status ?? 'not_started',
    status: row.status ?? 'Not Started',
    status_tone: row.status_tone ?? 'yellow',
    submission_open: row.submission_open !== false,
    deadline_badge: row.deadline_badge ?? 'Open',
    deadline_badge_tone: row.deadline_badge_tone ?? 'green',
    score_display: row.score_display ?? '—',
    score: row.score ?? null,
    time_spent_seconds: row.time_spent_seconds ?? 0,
    submitted_at: row.submitted_at ?? null,
    started_at: row.started_at ?? null,
    max_attempts: row.max_attempts != null ? Number(row.max_attempts) : 1,
    attempts_used: row.attempts_used != null ? Number(row.attempts_used) : 0,
    attempts_remaining: row.attempts_remaining != null ? Number(row.attempts_remaining) : undefined,
    can_retake: row.submission_open === false ? false : Boolean(row.can_retake),
    can_start: row.submission_open === false ? false : row.can_start != null ? Boolean(row.can_start) : undefined,
  }
}

export async function fetchStudentQuizzesList() {
  const res = await fetch(apiUrl('/api/v1/student/quizzes'), { credentials: 'include' })
  const data = await parseJson(res, 'Failed to load quizzes.')
  return (Array.isArray(data.quizzes) ? data.quizzes : []).map(mapStudentQuizListRow).filter(Boolean)
}

function mapQuizDetailPayload(data) {
  const quiz = mapQuizRow(data.quiz)
  if (quiz && data.quiz) {
    quiz.submission_open = data.quiz.submission_open !== false
  }
  if (data.attempt_policy && quiz) {
    Object.assign(quiz, data.attempt_policy)
    if (data.quiz?.submission_open === false) {
      quiz.can_start = false
      quiz.can_retake = false
    }
  }
  return {
    quiz,
    submission: data.submission ?? null,
  }
}

export async function fetchStudentQuizDetail(id) {
  const qid = String(id ?? '').trim()
  if (!qid) throw new Error('Invalid quiz id.')

  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'quiz_details',
    id: qid,
    fetchOnline: async () => {
      const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(qid)}`), {
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(String(body?.message || body?.error || 'Failed to load quiz.'))
        err.code = body?.error
        throw err
      }
      return mapQuizDetailPayload(body)
    },
    toCache: (payload) => ({ id: qid, ...payload }),
    fromCache: (row) => {
      if (!row?.quiz) return null
      return { quiz: row.quiz, submission: row.submission ?? null }
    },
  })
  return { ...data, fromCache }
}

export async function fetchStudentQuizTake(id) {
  const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/take`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(String(data?.message || data?.error || 'Failed to load quiz.'))
    err.code = data?.error
    throw err
  }
  if (data.can_retake) {
    const err = new Error('Start a retake from the quiz view page.')
    err.code = 'CAN_RETAKE'
    throw err
  }
  const quiz = mapQuizRow(data.quiz)
  if (quiz && data.quiz) {
    quiz.submission_open = data.quiz.submission_open !== false
  }
  if (data.attempt_policy && quiz) {
    Object.assign(quiz, data.attempt_policy)
    if (data.submission_open === false || data.quiz?.submission_open === false) {
      quiz.can_start = false
      quiz.can_retake = false
    }
  }
  return {
    quiz,
    submission: data.submission ?? null,
    answers: Array.isArray(data.answers) ? data.answers : [],
    remaining_seconds: data.remaining_seconds ?? null,
    submission_open: data.submission_open !== false,
  }
}

export async function startStudentQuiz(id) {
  const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/start`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(String(data?.message || data?.error || 'Failed to start quiz.'))
    err.code = data?.error
    throw err
  }
  return data.submission
}

export async function saveStudentQuizProgress(id, payload) {
  const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/save-progress`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res, 'Failed to save progress.')
}

/** Best-effort save when the tab closes or connection drops (fetch keepalive). */
export function saveStudentQuizProgressKeepalive(id, payload) {
  const url = apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/save-progress`)
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
}

export async function submitStudentQuiz(id, payload) {
  const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/submit`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseJson(res, 'Failed to submit quiz.')
}

export async function submitQuizViolations(id, violations) {
  const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(id))}/violations`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ violations: Array.isArray(violations) ? violations : [] }),
  })
  return parseJson(res, 'Failed to save quiz violations.')
}

export async function fetchStudentQuizResults(id) {
  const qid = String(id ?? '').trim()
  if (!qid) throw new Error('Invalid quiz id.')

  const { data, fromCache } = await fetchWithOfflineCache({
    storeName: 'quiz_results',
    id: qid,
    fetchOnline: async () => {
      const res = await fetch(apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(qid)}/results`), {
        credentials: 'include',
      })
      const body = await parseJson(res, 'Failed to load results.')
      return {
        quiz: mapQuizRow(body.quiz),
        submission: body.submission,
        percentage: body.percentage ?? 0,
        questions: Array.isArray(body.questions) ? body.questions : [],
      }
    },
    toCache: (payload) => ({ id: qid, ...payload }),
    fromCache: (row) => {
      if (!row?.quiz) return null
      return {
        quiz: row.quiz,
        submission: row.submission ?? null,
        percentage: row.percentage ?? 0,
        questions: Array.isArray(row.questions) ? row.questions : [],
      }
    },
  })
  return { ...data, fromCache }
}

export async function verifyStudentQuizPassword(id, password) {
  return verifyStudentQuizPasswordApi(id, password)
}

export function formatReviewStudentAnswer(question) {
  const raw = question?.student_answer
  if (raw == null || raw === '') return null
  const type = String(question?.question_type || '').trim()
  if (type === 'enumeration') {
    try {
      const items = JSON.parse(raw)
      if (Array.isArray(items)) {
        const text = items.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
        return text || null
      }
    } catch {
      /* fall through */
    }
  }
  if (type === 'matching') {
    try {
      const pairs = JSON.parse(raw)
      if (Array.isArray(pairs)) {
        const text = pairs
          .map((pair) => {
            const left = String(pair?.answer_text ?? pair?.left ?? '').trim()
            const right = String(pair?.match_pair ?? pair?.right ?? '').trim()
            if (!left && !right) return ''
            return `${left} → ${right}`
          })
          .filter(Boolean)
          .join('; ')
        return text || null
      }
    } catch {
      /* fall through */
    }
  }
  return String(raw)
}

export function formatTimeSpent(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function formatTimerDisplay(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function countAnsweredQuestions(parts, answerMap) {
  let total = 0
  let answered = 0
  for (const part of parts || []) {
    for (const q of part.questions || []) {
      total += 1
      const a = answerMap.get(String(q.id))
      if (!a) continue
      const t = q.question_type
      if (t === 'multiple_choice' && a.selected_choice_id) answered += 1
      else if (t === 'true_false' && a.student_answer) answered += 1
      else if (t === 'identification' && String(a.student_answer || '').trim()) answered += 1
      else if (t === 'essay' && String(a.student_answer || '').trim()) answered += 1
      else if (t === 'enumeration' && a.student_answer) answered += 1
      else if (t === 'matching' && a.student_answer) answered += 1
    }
  }
  return { total, answered }
}

export function buildAnswersPayload(answerMap) {
  return [...answerMap.entries()].map(([questionId, val]) => ({
    question_id: questionId,
    selected_choice_id: val.selected_choice_id ?? null,
    student_answer: val.student_answer ?? null,
  }))
}

export function answersMapFromSaved(saved, parts) {
  const map = initAnswerMapFromQuiz(parts)
  for (const a of saved || []) {
    const key = String(a.question_id)
    map.set(key, {
      selected_choice_id: a.selected_choice_id ?? null,
      student_answer: a.student_answer ?? map.get(key)?.student_answer ?? null,
    })
  }
  return map
}

export function initAnswerMapFromQuiz(parts) {
  const map = new Map()
  for (const part of parts || []) {
    for (const q of part.questions || []) {
      if (q.question_type === 'enumeration') {
        const n = (q.answers || []).length || 1
        map.set(String(q.id), { student_answer: JSON.stringify(Array(n).fill('')) })
      } else if (q.question_type === 'matching') {
        const pairs = (q.answers || []).map((p) => ({
          answer_text: p.answer_text || '',
          match_pair: '',
        }))
        map.set(String(q.id), { student_answer: JSON.stringify(pairs) })
      } else {
        map.set(String(q.id), { selected_choice_id: null, student_answer: null })
      }
    }
  }
  return map
}
