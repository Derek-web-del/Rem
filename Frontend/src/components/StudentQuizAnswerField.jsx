import { ACTION_BLUE } from '../pages/teachers/instituteChrome.js'

const optionBase =
  'flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition'

export default function StudentQuizAnswerField({ question, value, onChange }) {
  const type = question.question_type

  if (type === 'multiple_choice') {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(question.choices || []).map((choice) => {
          const selected = String(value?.selected_choice_id) === String(choice.id)
          return (
            <label
              key={choice.id || choice.choice_label}
              className={`${optionBase} ${selected ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
            >
              <input
                type="radio"
                name={`mc-${question.id}`}
                checked={selected}
                onChange={() => onChange({ selected_choice_id: choice.id, student_answer: null })}
                className="h-4 w-4 shrink-0 text-sky-600"
              />
              <span className="shrink-0 font-semibold text-neutral-600">{choice.choice_label}.</span>
              <span className="min-w-0 break-words text-neutral-800">{choice.choice_text}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'true_false') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {['True', 'False'].map((opt) => {
          const selected = String(value?.student_answer || '') === opt
          return (
            <label
              key={opt}
              className={`${optionBase} ${selected ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
            >
              <input
                type="radio"
                name={`tf-${question.id}`}
                checked={selected}
                onChange={() => onChange({ student_answer: opt, selected_choice_id: null })}
                className="h-4 w-4 shrink-0 text-sky-600"
              />
              <span className="text-neutral-800">{opt}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'identification') {
    return (
      <input
        type="text"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        value={value?.student_answer || ''}
        onChange={(e) => onChange({ student_answer: e.target.value, selected_choice_id: null })}
        placeholder="Type your answer..."
      />
    )
  }

  if (type === 'essay') {
    return (
      <textarea
        rows={5}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        value={value?.student_answer || ''}
        onChange={(e) => onChange({ student_answer: e.target.value, selected_choice_id: null })}
        placeholder="Write your answer here..."
      />
    )
  }

  if (type === 'enumeration') {
    let items = []
    try {
      items = JSON.parse(value?.student_answer || '[]')
    } catch {
      items = []
    }
    if (!Array.isArray(items)) items = []
    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-6 text-sm font-bold text-neutral-500">{idx + 1}.</span>
            <input
              type="text"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[idx] = e.target.value
                onChange({ student_answer: JSON.stringify(next), selected_choice_id: null })
              }}
              placeholder={`Answer ${idx + 1}`}
            />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'matching') {
    let pairs = []
    try {
      pairs = JSON.parse(value?.student_answer || '[]')
    } catch {
      pairs = []
    }
    const matchOptions = question.match_options?.length
      ? question.match_options
      : [...new Set((question.answers || []).map((a) => a.match_pair).filter(Boolean))]
    return (
      <div className="space-y-2">
        {pairs.map((pair, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
              {pair.answer_text || `Item ${idx + 1}`}
            </span>
            <span className="text-neutral-400">→</span>
            <select
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              value={pair.match_pair || ''}
              onChange={(e) => {
                const next = pairs.map((p, i) =>
                  i === idx ? { ...p, match_pair: e.target.value } : p,
                )
                onChange({ student_answer: JSON.stringify(next), selected_choice_id: null })
              }}
            >
              <option value="">Select match...</option>
              {matchOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    )
  }

  return <p className="text-sm text-neutral-500">Unsupported question type.</p>
}

export { ACTION_BLUE }
