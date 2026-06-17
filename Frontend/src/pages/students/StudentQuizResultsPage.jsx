import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import {
  fetchStudentQuizResults,
  formatReviewStudentAnswer,
  formatTimeSpent,
} from '../../lib/studentQuizzes.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

function formatSubmittedDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSubmittedTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes} ${ampm}`
}

function ReviewQuestionCard({ question, number }) {
  const correct = question.is_correct === true
  const earned = question.points_earned != null ? Number(question.points_earned) : 0
  const max = question.points_max != null ? Number(question.points_max) : Number(question.points || 0)
  const type = question.question_type
  const yourAnswer = formatReviewStudentAnswer(question)

  return (
    <article
      className={`rounded-lg border p-4 ${
        correct
          ? 'border-emerald-200 border-l-4 border-l-emerald-600 bg-emerald-50'
          : 'border-red-200 border-l-4 border-l-red-600 bg-red-50'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-neutral-900">Question {number}</span>
          {correct ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
              <i className="ti ti-check" aria-hidden="true" /> Correct
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700">
              <i className="ti ti-x" aria-hidden="true" /> Incorrect
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold text-sky-700">
          {earned.toFixed(1)} / {max.toFixed(1)} pts
        </span>
      </div>

      <p className="mb-3 text-sm font-medium text-neutral-900">{question.question_text}</p>

      {type === 'multiple_choice' ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-neutral-500">Options:</p>
          <ul className="space-y-1 text-sm">
            {(question.choices || []).map((choice) => {
              const isStudent =
                String(question.selected_choice_id) === String(choice.id)
              const isCorrectChoice = choice.is_correct
              let suffix = ''
              let color = 'text-neutral-700'
              if (isCorrectChoice) {
                suffix = ' (Correct Answer)'
                color = 'font-semibold text-emerald-700'
              }
              if (isStudent && !isCorrectChoice) {
                suffix = ' (Your Answer)'
                color = 'font-semibold text-red-700'
              } else if (isStudent && isCorrectChoice) {
                suffix = ' (Your Answer)'
                color = 'font-semibold text-emerald-700'
              }
              return (
                <li key={choice.id} className={color}>
                  {choice.choice_label}. {choice.choice_text}
                  {suffix}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm">
          <span className="font-semibold text-neutral-700">Your Answer: </span>
          <span className={correct ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
            {yourAnswer || '—'}
          </span>
        </p>
      )}
    </article>
  )
}

export default function StudentQuizResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setFromCache(false)
    try {
      const result = await fetchStudentQuizResults(id)
      setData(result)
      setFromCache(Boolean(result.fromCache))
    } catch (e) {
      console.error('[StudentQuizResultsPage]', e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const quiz = data?.quiz
  const submission = data?.submission
  const percentage = data?.percentage ?? 0
  const score = submission?.score != null ? Number(submission.score) : 0
  const total = submission?.total_points != null ? Number(submission.total_points) : Number(quiz?.total_points || 0)

  return (
    <>
      <StudentMainHeader pageTitle="Quizzes" />
      <main className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4 md:p-8">
        <StudentViewHeader title="Quiz Results" backTo="/student/quizzes" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        {loading ? (
          <p className="text-sm text-neutral-500">Loading results…</p>
        ) : !quiz || !submission ? (
          <p className="text-sm text-neutral-500">Results not found.</p>
        ) : (
          <>
            <section className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <h3 className="text-xl font-bold text-neutral-900">{quiz.title}</h3>

              <div
                className="mx-auto mt-6 flex h-40 w-40 flex-col items-center justify-center rounded-full text-white"
                style={{ background: ACTION_BLUE }}
              >
                <span className="text-3xl font-bold">{percentage.toFixed(1)}%</span>
                <span className="mt-1 text-sm opacity-90">Score</span>
              </div>

              <p className="mt-6 text-2xl font-bold text-neutral-900">
                {score.toFixed(2)} / {total.toFixed(2)}
              </p>
              <p className="text-sm text-neutral-500">Total Points</p>

              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { value: String(submission.attempt_number ?? 1), label: 'Attempt' },
                  { value: formatTimeSpent(submission.time_spent_seconds), label: 'Time Spent' },
                  { value: formatSubmittedDate(submission.submitted_at), label: 'Submitted' },
                  { value: formatSubmittedTime(submission.submitted_at), label: 'Time' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-neutral-100 px-4 py-4">
                    <p className="text-2xl font-bold text-neutral-900">{stat.value}</p>
                    <p className="mt-1 text-xs text-neutral-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-lg font-bold text-neutral-900">Answer Review</h3>
              <div className="space-y-6">
                {(quiz.parts || []).map((part, pIndex) => {
                  let qOffset = 0
                  for (let i = 0; i < pIndex; i += 1) {
                    qOffset += (quiz.parts[i].questions || []).length
                  }
                  return (
                    <div key={part.id || pIndex}>
                      <p className="mb-3 text-sm font-bold text-sky-700">
                        {part.part_title || `Part ${pIndex + 1}`}
                      </p>
                      <div className="space-y-4">
                        {(part.questions || []).map((q, qIndex) => (
                          <ReviewQuestionCard
                            key={q.id || qIndex}
                            question={q}
                            number={qOffset + qIndex + 1}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap justify-center gap-3 rounded-xl bg-neutral-100 px-6 py-4">
              <button
                type="button"
                onClick={() => navigate('/student/quizzes')}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                <i className="ti ti-list" aria-hidden="true" />
                Back to Quiz List
              </button>
              <button
                type="button"
                onClick={() => navigate(`/student/quizzes/${id}/view`)}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
                style={{ background: ACTION_BLUE }}
              >
                <i className="ti ti-eye" aria-hidden="true" />
                View Quiz Details
              </button>
            </div>
          </>
        )}
      </main>
    </>
  )
}
