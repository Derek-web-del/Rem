import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  fetchTeacherQuiz,
  formatDateYmd,
  formatDeadlineDisplay,
  formatDurationMins,
  QUESTION_TYPE_LABELS,
} from '../../lib/teacherQuizzes.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'
import { QuestionFields } from './TeacherQuizQuestionFields.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

export default function TeacherQuizView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const row = await fetchTeacherQuiz(id)
        if (!cancelled) setQuiz(row)
      } catch (e) {
        console.error('[TeacherQuizView]', e)
        toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.updateFailed), {
          toastId: FACULTY_TOAST_ID.quizEditError,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <>
      <TeacherMainHeader pageTitle="Quiz Maker" onLogout={logoutToPortal} />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mb-4">
          <BackButton to="/teacher/quizzes" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {quiz?.id && (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              style={{ background: ACTION_BLUE }}
              onClick={() => navigate(`/teacher/quizzes/${quiz.id}/edit`)}
            >
              Edit quiz
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading quiz…</p>
        ) : !quiz ? (
          <p className="text-sm text-neutral-500">Quiz not found.</p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-neutral-900">{quiz.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{quiz.subject}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Activity type</dt>
                  <dd className="text-neutral-800">{quiz.activity_type || 'Quiz'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Grade</dt>
                  <dd className="text-neutral-800">{quiz.grade_level || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Quarter</dt>
                  <dd className="text-neutral-800">{quiz.quarter ? `Quarter ${quiz.quarter}` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Deadline</dt>
                  <dd className="text-neutral-800">{formatDeadlineDisplay(quiz.deadline) || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Duration</dt>
                  <dd className="text-neutral-800">{formatDurationMins(quiz.duration_mins)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Total points</dt>
                  <dd className="text-neutral-800">{quiz.total_points ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Created</dt>
                  <dd className="text-neutral-800">{formatDateYmd(quiz.created_at)}</dd>
                </div>
              </dl>
              {quiz.description && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Description</p>
                  <p className="mt-1 text-sm text-neutral-700">{quiz.description}</p>
                </div>
              )}
              {quiz.instructions && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Instructions</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{quiz.instructions}</p>
                </div>
              )}
            </section>

            {(quiz.parts || []).map((part, pIndex) => (
              <section key={part.id || pIndex} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h3 className="mb-1 text-sm font-bold text-neutral-800">
                  {part.part_title || `Part ${pIndex + 1}`}
                </h3>
                <p className="mb-4 text-xs text-neutral-500">
                  {QUESTION_TYPE_LABELS[part.question_type] || part.question_type} ·{' '}
                  {(part.questions || []).length} question(s)
                </p>
                <div className="space-y-4">
                  {(part.questions || []).map((q, qIndex) => (
                    <div key={q.id || qIndex} className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
                      <p className="mb-3 text-xs font-bold uppercase text-neutral-500">Question {qIndex + 1}</p>
                      <QuestionFields question={q} partType={part.question_type} onChange={() => {}} readOnly />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
