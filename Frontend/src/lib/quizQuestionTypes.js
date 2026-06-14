export const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'enumeration', label: 'Enumeration' },
  { value: 'essay', label: 'Essay' },
  { value: 'identification', label: 'Identification' },
  { value: 'matching', label: 'Matching' },
]

export const QUESTION_TYPE_LABELS = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.label]),
)

export const BRANCH_OPTIONS = ['Main Campus', 'Annex', 'Senior High', 'Junior High']

export const SEMESTER_OPTIONS = ['1', '2', '3']

export const SEMESTER_LABELS = {
  1: '1st Semester',
  2: '2nd Semester',
  3: '3rd Semester',
}

export function formatSemesterLabel(value) {
  const v = String(value ?? '').trim()
  if (!v) return ''
  return SEMESTER_LABELS[v] ?? SEMESTER_LABELS[Number(v)] ?? `${v} Semester`
}

export const QUIZ_ACTIVITY_TYPE_OPTIONS = [
  { value: 'Short Quiz', label: 'Short Quiz' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'Long Quiz', label: 'Long Quiz' },
]

export const DEFAULT_QUIZ_ACTIVITY_TYPE = 'Quiz'

/** Map legacy activity_type values when loading edit form */
export function normalizeQuizActivityType(value) {
  const v = String(value || '').trim()
  if (v === 'Exam') return 'Quiz'
  if (v === 'Long Test') return 'Long Quiz'
  if (QUIZ_ACTIVITY_TYPE_OPTIONS.some((o) => o.value === v)) return v
  return DEFAULT_QUIZ_ACTIVITY_TYPE
}

export function typeBadgeClass(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'multiple_choice') return 'bg-sky-100 text-sky-800'
  if (t === 'true_false') return 'bg-emerald-100 text-emerald-800'
  if (t === 'enumeration') return 'bg-orange-100 text-orange-800'
  if (t === 'essay') return 'bg-violet-100 text-violet-800'
  if (t === 'identification') return 'bg-pink-100 text-pink-800'
  if (t === 'matching') return 'bg-neutral-200 text-neutral-800'
  return 'bg-neutral-100 text-neutral-700'
}

export function emptyQuestion(type, orderIndex = 0) {
  const base = {
    clientKey: `q-${Date.now()}-${orderIndex}-${Math.random().toString(36).slice(2, 7)}`,
    question_text: '',
    points: 1,
    order_index: orderIndex,
    question_type: type,
  }
  if (type === 'multiple_choice') {
    return {
      ...base,
      choices: ['A', 'B', 'C', 'D'].map((label) => ({
        choice_label: label,
        choice_text: '',
        is_correct: label === 'A',
      })),
      answers: [],
    }
  }
  if (type === 'true_false') {
    return { ...base, choices: [], answers: [{ answer_text: 'True', match_pair: null }] }
  }
  if (type === 'enumeration') {
    return {
      ...base,
      choices: [],
      answers: [{ answer_text: '', match_pair: null }],
    }
  }
  if (type === 'essay') {
    return { ...base, choices: [], answers: [] }
  }
  if (type === 'identification') {
    return { ...base, choices: [], answers: [{ answer_text: '', match_pair: null }] }
  }
  if (type === 'matching') {
    return {
      ...base,
      choices: [],
      answers: [
        { answer_text: '', match_pair: '' },
        { answer_text: '', match_pair: '' },
      ],
    }
  }
  return { ...base, choices: [], answers: [] }
}

export function emptyPart(orderIndex = 0) {
  return {
    clientKey: `part-${Date.now()}-${orderIndex}`,
    part_title: '',
    question_type: 'multiple_choice',
    no_of_questions: 5,
    order_index: orderIndex,
    questions: [],
    generating: false,
    structureGenerated: false,
  }
}

export function generateQuestionsForPart(part) {
  const type = part.question_type
  const count = Math.max(1, Math.min(50, Number(part.no_of_questions) || 1))
  const questions = []
  for (let i = 0; i < count; i += 1) {
    questions.push(emptyQuestion(type, i))
  }
  return questions
}

export function calcTotalPoints(parts) {
  let total = 0
  for (const part of parts || []) {
    for (const q of part.questions || []) {
      const p = Number(q.points)
      if (Number.isFinite(p) && p > 0) total += p
    }
  }
  return Math.round(total * 100) / 100
}
