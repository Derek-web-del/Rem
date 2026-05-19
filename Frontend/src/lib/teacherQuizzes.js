import { apiUrl } from './lmsStateStorage.js'

export {
  formatDateYmd,
  splitDeadlineToDateAndTime,
  combineDateAndTimeToIso,
  formatDeadlineDisplay,
} from './teacherAssignments.js'

export { QUESTION_TYPE_LABELS, typeBadgeClass } from './quizQuestionTypes.js'

export function mapQuizRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    title: String(row.title ?? '').trim(),
    description: String(row.description ?? '').trim(),
    instructions: String(row.instructions ?? '').trim(),
    activity_type: String(row.activity_type ?? 'Quiz').trim(),
    subject: String(row.subject ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    quarter: row.quarter != null ? String(row.quarter) : '',
    duration_mins: row.duration_mins != null ? Number(row.duration_mins) : null,
    deadline: row.deadline ?? null,
    total_points: row.total_points != null ? Number(row.total_points) : 0,
    is_hidden: Boolean(row.is_hidden),
    has_password: Boolean(row.has_password),
    created_by: String(row.created_by ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    primary_question_type: String(row.primary_question_type ?? '').trim(),
    parts: Array.isArray(row.parts) ? row.parts.map(mapQuizPartRow).filter(Boolean) : undefined,
  }
}

export function mapQuizPartRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    part_title: String(row.part_title ?? '').trim(),
    question_type: String(row.question_type ?? '').trim(),
    no_of_questions: row.no_of_questions != null ? Number(row.no_of_questions) : 0,
    order_index: row.order_index != null ? Number(row.order_index) : 0,
    questions: (Array.isArray(row.questions) ? row.questions : []).map(mapQuizQuestionRow).filter(Boolean),
  }
}

export function mapQuizQuestionRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    part_id: row.part_id != null ? String(row.part_id) : '',
    quiz_id: row.quiz_id != null ? String(row.quiz_id) : '',
    question_text: String(row.question_text ?? '').trim(),
    question_type: String(row.question_type ?? '').trim(),
    points: row.points != null ? Number(row.points) : 1,
    order_index: row.order_index != null ? Number(row.order_index) : 0,
    choices: (Array.isArray(row.choices) ? row.choices : []).map((c) => ({
      id: c.id != null ? String(c.id) : '',
      choice_label: String(c.choice_label ?? '').trim(),
      choice_text: String(c.choice_text ?? '').trim(),
      is_correct: Boolean(c.is_correct),
    })),
    answers: (Array.isArray(row.answers) ? row.answers : []).map((a) => ({
      id: a.id != null ? String(a.id) : '',
      answer_text: String(a.answer_text ?? '').trim(),
      match_pair: a.match_pair != null ? String(a.match_pair).trim() : null,
    })),
  }
}

export function quizToApiPayload(form, parts) {
  return {
    title: form.title,
    description: form.description,
    instructions: form.instructions,
    activity_type: form.activity_type || 'Quiz',
    subject: form.subject,
    grade_level: form.grade_level,
    quarter: form.quarter,
    duration_mins: form.duration_mins != null && form.duration_mins !== '' ? Number(form.duration_mins) : null,
    deadline: form.deadline,
    total_points: form.total_points,
    quiz_password: form.quiz_password ?? '',
    password_touched: Boolean(form.password_touched),
    parts: (parts || []).map((part, pIndex) => ({
      part_title: part.part_title,
      question_type: part.question_type,
      no_of_questions: part.no_of_questions,
      order_index: pIndex,
      questions: (part.questions || []).map((q, qIndex) => ({
        question_text: q.question_text,
        question_type: q.question_type || part.question_type,
        points: q.points,
        order_index: qIndex,
        choices: q.choices,
        answers: q.answers,
      })),
    })),
  }
}

export function quizFromApiRow(quiz) {
  const mapped = mapQuizRow(quiz)
  if (!mapped) return null
  return mapped
}

export async function fetchTeacherQuizzes() {
  const res = await fetch(apiUrl('/api/v1/quizzes'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load quizzes (${res.status}).`))
  }
  const list = Array.isArray(data.quizzes) ? data.quizzes : Array.isArray(data.data) ? data.data : []
  return list.map(mapQuizRow).filter(Boolean)
}

export async function fetchTeacherQuiz(id) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load quiz (${res.status}).`))
  }
  return mapQuizRow(data.quiz)
}

export async function createTeacherQuiz(payload) {
  const res = await fetch(apiUrl('/api/v1/quizzes'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to create quiz.'))
  }
  return mapQuizRow(data.quiz)
}

export async function updateTeacherQuiz(id, payload) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update quiz.'))
  }
  return mapQuizRow(data.quiz)
}

export async function deleteTeacherQuiz(id) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to delete quiz.'))
  }
}

export async function toggleTeacherQuizVisibility(id) {
  const res = await fetch(apiUrl(`/api/v1/quizzes/${encodeURIComponent(String(id))}/toggle-visibility`), {
    method: 'PATCH',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update quiz visibility.'))
  }
  return Boolean(data.is_hidden)
}

export function formatDurationMins(mins) {
  const n = Number(mins)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${n} mins`
}

export function quizDisplayType(quiz) {
  const t = String(quiz?.primary_question_type || quiz?.parts?.[0]?.question_type || '').trim()
  return t
}
