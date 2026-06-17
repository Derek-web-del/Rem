import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import StudentQuizPasswordModal from '../../components/StudentQuizPasswordModal.jsx'
import { useNotify } from '../../components/notifications.jsx'
import {
  fetchStudentQuizDetail,
  formatDeadlineDisplay,
  formatDurationMins,
  startStudentQuiz,
  verifyStudentQuizPassword,
} from '../../lib/studentQuizzes.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

function formatDateIso(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function FieldPair({ label, children }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-[5.5rem] shrink-0 text-sm text-gray-500 xl:w-28">{label}</span>
      <span className="min-w-0 text-sm font-semibold text-gray-900">{children ?? '—'}</span>
    </div>
  )
}

function InfoGridRow({ children, last = false }) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-4 gap-y-2 py-2.5 sm:grid-cols-2 lg:grid-cols-4 ${last ? '' : 'border-b border-neutral-100'}`}
    >
      {children}
    </div>
  )
}

function TextPanel({ title, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <p className="border-b border-neutral-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-800 sm:px-5">
        {title}
      </p>
      <div className="px-4 py-3 text-sm text-gray-900 sm:px-5">
        <p className="whitespace-pre-wrap">{children || '—'}</p>
      </div>
    </div>
  )
}

function OpenClosedBadge({ open }) {
  if (open) {
    return (
      <span className="ml-2 inline-flex w-auto shrink-0 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Open
      </span>
    )
  }
  return (
    <span className="ml-2 inline-flex w-auto shrink-0 items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      Closed
    </span>
  )
}

export default function StudentQuizViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const { error: notifyError } = useNotify()

  const [quiz, setQuiz] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchStudentQuizDetail(id)
      if (!data.quiz) {
        setQuiz(null)
        setSubmission(null)
        setLoadError('Quiz not found.')
        return
      }
      setQuiz(data.quiz)
      setSubmission(data.submission)
      setFromCache(Boolean(data.fromCache))
    } catch (e) {
      console.error('[StudentQuizViewPage]', e)
      setQuiz(null)
      setSubmission(null)
      if (e?.code === 'NOT_FOUND') {
        setLoadError('Quiz not found.')
      } else if (e?.code === 'PASSWORD_REQUIRED') {
        setLoadError('This quiz requires a pass code. Use Start to enter it.')
      } else {
        setLoadError(String(e?.message || 'Could not load quiz.'))
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const status = String(submission?.status || 'not_started').toLowerCase()
  const canRetake = Boolean(quiz?.can_retake)
  const maxAttempts = quiz?.max_attempts ?? 1
  const attemptsUsed = quiz?.attempts_used ?? submission?.attempt_number ?? 0
  const attemptsRemaining = quiz?.attempts_remaining ?? Math.max(0, maxAttempts - attemptsUsed)
  const canStartOrContinue =
    quiz?.submission_open !== false && (status !== 'completed' || canRetake)
  const questionCount = quiz?.question_count ?? (quiz?.parts || []).reduce((n, p) => n + (p.questions || []).length, 0)
  const deadlineOpen = quiz?.submission_open !== false
  const showAttemptLine = attemptsUsed > 0 || status === 'completed' || status === 'in_progress'

  async function proceedToTake() {
    setStarting(true)
    try {
      await startStudentQuiz(id)
      navigate(`/student/quizzes/${id}/take`)
    } catch (e) {
      if (e?.code === 'NO_ATTEMPTS_LEFT') {
        notifyError('No attempts remaining for this quiz.')
        await load()
      } else if (e?.code === 'CLOSED') {
        notifyError('Quiz deadline has passed.')
        await load()
      } else {
        console.error('[StudentQuizViewPage] start', e)
        notifyError(String(e?.message || 'Failed to start quiz.'))
      }
    } finally {
      setStarting(false)
    }
  }

  async function handleStartClick() {
    if (!quiz) return
    if (quiz.has_password) {
      setPasswordError('')
      setPasswordModalOpen(true)
      return
    }
    await proceedToTake()
  }

  async function handlePasswordSubmit(password) {
    setVerifying(true)
    setPasswordError('')
    try {
      const result = await verifyStudentQuizPassword(id, password)
      if (!result.success) {
        setPasswordError(result.message || 'Incorrect pass code. Please try again.')
        return
      }
      setPasswordModalOpen(false)
      await proceedToTake()
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <StudentMainHeader pageTitle="Quizzes" />
      <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
        <StudentViewHeader title="View Quiz" backTo="/student/quizzes" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        {loading ? (
          <p className="text-sm text-neutral-500">Loading quiz…</p>
        ) : !quiz ? (
          <p className="text-sm text-neutral-500">{loadError || 'Quiz not found.'}</p>
        ) : (
          <section className="w-full max-w-6xl space-y-4">
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <p className="border-b border-neutral-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-800 sm:px-5">
                Quiz Info:
              </p>

              <div className="px-4 sm:px-5">
                <InfoGridRow>
                  <FieldPair label="Title">{quiz.title || 'Untitled'}</FieldPair>
                  <FieldPair label="Subject">{quiz.subject}</FieldPair>
                  <FieldPair label="Grade Level">{quiz.grade_level || '—'}</FieldPair>
                  <FieldPair label="Upload date">{formatDateIso(quiz.created_at)}</FieldPair>
                </InfoGridRow>

                <InfoGridRow>
                  <FieldPair label="Type">{quiz.activity_type || 'Quiz'}</FieldPair>
                  <FieldPair label="Duration">{formatDurationMins(quiz.duration_mins)}</FieldPair>
                  <FieldPair label="Total Score">{Number(quiz.total_points || 0).toFixed(2)}</FieldPair>
                  <FieldPair label="Questions">{String(questionCount)}</FieldPair>
                </InfoGridRow>

                <InfoGridRow last>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="w-[5.5rem] shrink-0 text-sm text-gray-500 xl:w-28">Submission Date</span>
                    <span className="inline-flex min-w-0 flex-wrap items-center">
                      <span className="text-sm font-semibold text-gray-900">{formatDateIso(quiz.deadline)}</span>
                      {quiz.deadline ? <OpenClosedBadge open={deadlineOpen} /> : null}
                    </span>
                  </div>
                  <FieldPair label="Deadline">
                    {formatDeadlineDisplay(quiz.deadline)
                      ? `${formatDeadlineDisplay(quiz.deadline)} (PHT)`
                      : '—'}
                  </FieldPair>
                </InfoGridRow>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TextPanel title="Description:">{quiz.description}</TextPanel>
              <TextPanel title="Instructions:">{quiz.instructions}</TextPanel>
            </div>

            {!deadlineOpen && status !== 'completed' ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                This quiz is closed. The submission deadline has passed.
              </p>
            ) : null}

            {showAttemptLine ? (
              <p className="text-sm text-neutral-600">
                Attempt {attemptsUsed} of {maxAttempts}
                {status === 'completed' && !canRetake ? ' — no attempts remaining' : null}
                {canRetake && attemptsRemaining > 0
                  ? ` — ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining`
                  : null}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {canStartOrContinue ? (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void handleStartClick()}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                  style={{ background: ACTION_BLUE }}
                >
                  <i className="ti ti-pencil" aria-hidden="true" />
                  {status === 'completed' && canRetake
                    ? 'Retake quiz'
                    : status === 'in_progress'
                      ? 'Continue Quiz'
                      : 'Start Quiz'}
                </button>
              ) : null}

              {status === 'completed' ? (
                <button
                  type="button"
                  onClick={() => navigate(`/student/quizzes/${id}/results`)}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                >
                  View Results
                </button>
              ) : null}
            </div>
          </section>
        )}
      </main>

      <StudentQuizPasswordModal
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        onSubmit={handlePasswordSubmit}
        submitting={verifying || starting}
        error={passwordError}
      />
    </>
  )
}
