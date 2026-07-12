// TODO: migrate to apiFetch from ./apiClient.js
import { getListSnapshot, saveListSnapshot } from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'

export {
  formatDateYmd,
  splitDeadlineToDateAndTime,
  combineDateAndTimeToIso,
  formatDeadlineDisplay,
  isPastDeadline,
  isSubmissionScoreEditable,
} from './teacherAssignments.js'

import { QUESTION_TYPE_LABELS, typeBadgeClass } from './quizQuestionTypes.js'

export { QUESTION_TYPE_LABELS, typeBadgeClass }

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
    subject_id: row.subject_id != null ? String(row.subject_id) : '',
    grade_component_id: row.grade_component_id != null ? String(row.grade_component_id) : '',
    semester: row.semester != null ? String(row.semester) : '',
    duration_mins: row.duration_mins != null ? Number(row.duration_mins) : null,
    deadline: row.deadline ?? null,
    total_points: row.total_points != null ? Number(row.total_points) : 0,
    max_attempts: row.max_attempts != null ? Number(row.max_attempts) : 1,
    attempts_used: row.attempts_used != null ? Number(row.attempts_used) : undefined,
    attempts_remaining: row.attempts_remaining != null ? Number(row.attempts_remaining) : undefined,
    can_retake: row.can_retake != null ? Boolean(row.can_retake) : undefined,
    can_start: row.can_start != null ? Boolean(row.can_start) : undefined,
    submission_open: row.submission_open !== false,
    is_hidden: Boolean(row.is_hidden),
    has_password: Boolean(row.has_password),
    created_by: String(row.created_by ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    primary_question_type: String(row.primary_question_type ?? '').trim(),
    part_types: Array.isArray(row.part_types)
      ? row.part_types.map((t) => String(t ?? '').trim()).filter(Boolean)
      : [],
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
  const mapped = {
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
  if ('student_answer' in row) mapped.student_answer = row.student_answer ?? null
  if ('selected_choice_id' in row) {
    mapped.selected_choice_id =
      row.selected_choice_id != null ? String(row.selected_choice_id) : null
  }
  if ('is_correct' in row) mapped.is_correct = row.is_correct == null ? null : Boolean(row.is_correct)
  if ('points_earned' in row) {
    mapped.points_earned = row.points_earned != null ? Number(row.points_earned) : null
  }
  if ('points_max' in row) mapped.points_max = row.points_max != null ? Number(row.points_max) : null
  return mapped
}

export function quizToApiPayload(form, parts) {
  return {
    title: form.title,
    description: form.description,
    instructions: form.instructions,
    activity_type: form.activity_type || 'Quiz',
    subject: form.subject,
    grade_level: form.grade_level,
    subject_id:
      form.subject_id != null && String(form.subject_id).trim() !== ''
        ? Number(form.subject_id)
        : undefined,
    grade_component_id:
      form.grade_component_id != null && String(form.grade_component_id).trim() !== ''
        ? Number(form.grade_component_id)
        : undefined,
    semester: form.semester,
    duration_mins: form.duration_mins != null && form.duration_mins !== '' ? Number(form.duration_mins) : null,
    deadline: form.deadline,
    total_points: form.total_points,
    quiz_password: form.quiz_password ?? '',
    password_touched: Boolean(form.password_touched),
    max_attempts: form.max_attempts != null && form.max_attempts !== '' ? Number(form.max_attempts) : 1,
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
  try {
    if (!isOnline()) throw new Error('offline')
    const res = await fetch(apiUrl('/api/v1/quizzes'), { credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(String(data?.message || data?.error || `Failed to load quizzes (${res.status}).`))
    }
    const list = Array.isArray(data.quizzes) ? data.quizzes : Array.isArray(data.data) ? data.data : []
    const rows = list.map(mapQuizRow).filter(Boolean)
    await saveListSnapshot('cached_quizzes', rows, 'faculty_list')
    return rows
  } catch (e) {
    const cached = await getListSnapshot('cached_quizzes', 'faculty_list')
    if (cached.length > 0) return cached
    throw e
  }
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

/** Unique part question types in order (for multi-part quizzes). */
export function quizPartTypeLabels(quiz) {
  const seen = new Set()
  const out = []
  const fromList = Array.isArray(quiz?.part_types) ? quiz.part_types : []
  const sources =
    fromList.length > 0
      ? fromList.map((t) => ({ question_type: t }))
      : quiz?.parts || []
  for (const part of sources) {
    const t = String(part.question_type || part || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push({ value: t, label: QUESTION_TYPE_LABELS[t] || t })
  }
  return out
}

export async function fetchTeacherQuizRosterScores(id, { sectionId } = {}) {
  const params = new URLSearchParams()
  if (sectionId != null && String(sectionId).trim() !== '') {
    params.set('section_id', String(sectionId))
  }
  const qs = params.toString()
  const url = apiUrl(
    `/api/v1/quizzes/${encodeURIComponent(String(id))}/roster-scores${qs ? `?${qs}` : ''}`,
  )
  const res = await fetch(url, { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to load quiz roster.'))
  }
  return data.roster || null
}

export async function updateQuizSubmissionScore(quizId, submissionId, score) {
  const res = await fetch(
    apiUrl(
      `/api/v1/quizzes/${encodeURIComponent(String(quizId))}/submissions/${encodeURIComponent(String(submissionId))}/score`,
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
  return data.submission || null
}
