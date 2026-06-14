import {
  QUESTION_TYPES,
  SEMESTER_OPTIONS,
  calcTotalPoints,
  emptyPart,
  emptyQuestion,
  generateQuestionsForPart,
} from '../../lib/quizQuestionTypes.js'

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500'

const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'

function QuestionFields({ question, partType, onChange, readOnly = false }) {
  const type = question.question_type || partType

  function patch(partial) {
    onChange({ ...question, ...partial })
  }

  if (type === 'multiple_choice') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Question</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Enter your question..."
            readOnly={readOnly}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(question.choices || []).map((choice, idx) => (
            <div key={choice.choice_label || idx} className="flex items-center gap-2">
              <span className="w-6 text-sm font-bold text-neutral-500">{choice.choice_label}</span>
              <input
                className={inputClass}
                value={choice.choice_text}
                onChange={(e) => {
                  const choices = [...(question.choices || [])]
                  choices[idx] = { ...choices[idx], choice_text: e.target.value }
                  patch({ choices })
                }}
                placeholder={`Choice ${choice.choice_label}`}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px] flex-1">
            <label className={labelClass}>Correct answer</label>
            <select
              className={inputClass}
              value={(question.choices || []).find((c) => c.is_correct)?.choice_label || 'A'}
              onChange={(e) => {
                const choices = (question.choices || []).map((c) => ({
                  ...c,
                  is_correct: c.choice_label === e.target.value,
                }))
                patch({ choices })
              }}
              disabled={readOnly}
            >
              {(question.choices || []).map((c) => (
                <option key={c.choice_label} value={c.choice_label}>
                  {c.choice_label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className={labelClass}>Points</label>
            <input
              type="number"
              min="0"
              step="0.5"
              className={inputClass}
              value={question.points}
              onChange={(e) => patch({ points: e.target.value })}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
    )
  }

  if (type === 'true_false') {
    const selected = String(question.answers?.[0]?.answer_text || 'True')
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Question</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Enter your question..."
            readOnly={readOnly}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={labelClass}>Answer</label>
            <div className="flex gap-4 pt-1">
              {['True', 'False'].map((opt) => (
                <label key={opt} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`tf-${question.clientKey}`}
                    checked={selected === opt}
                    onChange={() => patch({ answers: [{ answer_text: opt, match_pair: null }] })}
                    disabled={readOnly}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
          <div className="w-24">
            <label className={labelClass}>Points</label>
            <input
              type="number"
              min="0"
              step="0.5"
              className={inputClass}
              value={question.points}
              onChange={(e) => patch({ points: e.target.value })}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
    )
  }

  if (type === 'enumeration') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Question / instruction</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Enter instruction or question..."
            readOnly={readOnly}
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Answers</label>
          {(question.answers || []).map((ans, idx) => (
            <input
              key={idx}
              className={inputClass}
              value={ans.answer_text}
              onChange={(e) => {
                const answers = [...(question.answers || [])]
                answers[idx] = { ...answers[idx], answer_text: e.target.value }
                patch({ answers })
              }}
              placeholder={`Answer ${idx + 1}`}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <button
              type="button"
              className="text-xs font-semibold text-sky-700 hover:underline"
              onClick={() =>
                patch({ answers: [...(question.answers || []), { answer_text: '', match_pair: null }] })
              }
            >
              + Add answer
            </button>
          )}
        </div>
        <div className="w-24">
          <label className={labelClass}>Points</label>
          <input
            type="number"
            min="0"
            step="0.5"
            className={inputClass}
            value={question.points}
            onChange={(e) => patch({ points: e.target.value })}
            readOnly={readOnly}
          />
        </div>
      </div>
    )
  }

  if (type === 'essay') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Question</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Enter your question..."
            readOnly={readOnly}
          />
        </div>
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-6 text-sm text-neutral-500">
          Student answers here (manual grading)
        </div>
        <div className="w-24">
          <label className={labelClass}>Points</label>
          <input
            type="number"
            min="0"
            step="0.5"
            className={inputClass}
            value={question.points}
            onChange={(e) => patch({ points: e.target.value })}
            readOnly={readOnly}
          />
        </div>
      </div>
    )
  }

  if (type === 'identification') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Question</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Enter your question..."
            readOnly={readOnly}
          />
        </div>
        <div>
          <label className={labelClass}>Correct answer</label>
          <input
            className={inputClass}
            value={question.answers?.[0]?.answer_text || ''}
            onChange={(e) => patch({ answers: [{ answer_text: e.target.value, match_pair: null }] })}
            placeholder="Type the correct answer..."
            readOnly={readOnly}
          />
        </div>
        <div className="w-24">
          <label className={labelClass}>Points</label>
          <input
            type="number"
            min="0"
            step="0.5"
            className={inputClass}
            value={question.points}
            onChange={(e) => patch({ points: e.target.value })}
            readOnly={readOnly}
          />
        </div>
      </div>
    )
  }

  if (type === 'matching') {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelClass}>Instruction</label>
          <textarea
            className={inputClass}
            rows={2}
            value={question.question_text}
            onChange={(e) => patch({ question_text: e.target.value })}
            placeholder="Match the following"
            readOnly={readOnly}
          />
        </div>
        <div className="grid gap-2">
          {(question.answers || []).map((pair, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                className={inputClass}
                value={pair.answer_text}
                onChange={(e) => {
                  const answers = [...(question.answers || [])]
                  answers[idx] = { ...answers[idx], answer_text: e.target.value }
                  patch({ answers })
                }}
                placeholder={`Item ${idx + 1}`}
                readOnly={readOnly}
              />
              <span className="text-neutral-400">⇄</span>
              <input
                className={inputClass}
                value={pair.match_pair || ''}
                onChange={(e) => {
                  const answers = [...(question.answers || [])]
                  answers[idx] = { ...answers[idx], match_pair: e.target.value }
                  patch({ answers })
                }}
                placeholder={`Match ${idx + 1}`}
                readOnly={readOnly}
              />
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              className="text-xs font-semibold text-sky-700 hover:underline"
              onClick={() =>
                patch({
                  answers: [...(question.answers || []), { answer_text: '', match_pair: '' }],
                })
              }
            >
              + Add pair
            </button>
          )}
        </div>
        <div className="w-24">
          <label className={labelClass}>Points</label>
          <input
            type="number"
            min="0"
            step="0.5"
            className={inputClass}
            value={question.points}
            onChange={(e) => patch({ points: e.target.value })}
            readOnly={readOnly}
          />
        </div>
      </div>
    )
  }

  return null
}

function PartBlock({ part, partIndex, onChange, onRemove, canRemove }) {
  function patchPart(partial) {
    onChange({ ...part, ...partial })
  }

  function updateQuestion(qIndex, nextQ) {
    const questions = [...(part.questions || [])]
    questions[qIndex] = nextQ
    patchPart({ questions })
  }

  async function handleGenerate() {
    patchPart({ generating: true, structureGenerated: false })
    await new Promise((r) => setTimeout(r, 1400))
    const questions = generateQuestionsForPart(part)
    onChange({ ...part, questions, generating: false, structureGenerated: true })
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h4 className="text-sm font-bold text-neutral-800">Part {partIndex + 1}</h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-red-500 hover:bg-red-50"
            aria-label="Remove part"
          >
            <i className="ti ti-trash text-base" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div>
          <label className={labelClass}>Part title (optional)</label>
          <input
            className={inputClass}
            value={part.part_title}
            onChange={(e) => patchPart({ part_title: e.target.value })}
            placeholder="e.g., Multiple choice"
          />
        </div>
        <div>
          <label className={labelClass}>No. of questions</label>
          <input
            type="number"
            min="1"
            max="50"
            className={inputClass}
            value={part.no_of_questions}
            onChange={(e) => patchPart({ no_of_questions: e.target.value, structureGenerated: false })}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            className={inputClass}
            value={part.question_type}
            onChange={(e) =>
              patchPart({ question_type: e.target.value, questions: [], structureGenerated: false })
            }
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {part.generating && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-neutral-600">Generating structure...</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
          </div>
        </div>
      )}

      {!part.generating && part.structureGenerated && (part.questions || []).length > 0 && (
        <div className="space-y-4 opacity-100 transition-opacity duration-500">
          {(part.questions || []).map((q, qIndex) => (
            <div key={q.clientKey || q.id || qIndex} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-500">
                Question {qIndex + 1}
              </p>
              <QuestionFields
                question={q}
                partType={part.question_type}
                onChange={(next) => updateQuestion(qIndex, next)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={part.generating}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-900 disabled:opacity-60"
        >
          Generate structure
        </button>
      </div>
    </div>
  )
}

export { QuestionFields, PartBlock, inputClass, labelClass, emptyPart, emptyQuestion, calcTotalPoints }

export default QuestionFields
