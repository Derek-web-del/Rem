import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BackButton from '../../components/BackButton.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import { useNotify } from '../../components/notifications.jsx'
import {
  fetchStudentQuiz,
  formatDeadlineDisplay,
  formatDurationMins,
  verifyStudentQuizPassword,
} from '../../lib/studentQuizzes.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_TOAST_MS } from '../../lib/facultyNotify.js'
import { QuestionFields } from '../teachers/TeacherQuizQuestionFields.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

function QuizPasswordModal({ open, onCancel, onSubmit, submitting, error }) {
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (open) setPassword('')
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-neutral-900">This quiz is password protected</h3>
        <p className="mt-2 text-sm text-neutral-600">Enter the password provided by your teacher to start.</p>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter quiz password"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => onSubmit(password)}
            disabled={submitting || !String(password).trim()}
          >
            {submitting ? 'Verifying…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StudentQuizPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notify } = useNotify()
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function loadQuiz(showPasswordModal = true) {
    setLoading(true)
    try {
      const row = await fetchStudentQuiz(id)
      setQuiz(row)
      setPasswordModalOpen(false)
      setPasswordError('')
    } catch (e) {
      if (e?.passwordRequired || e?.code === 'PASSWORD_REQUIRED') {
        setQuiz(null)
        if (showPasswordModal) setPasswordModalOpen(true)
      } else {
        console.error('[StudentQuizPage]', e)
        setQuiz(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return
    void loadQuiz(true)
  }, [id])

  async function handleVerifyPassword(password) {
    setVerifying(true)
    setPasswordError('')
    try {
      const result = await verifyStudentQuizPassword(id, password)
      if (!result.success) {
        setPasswordError(result.message || FACULTY_MSG.quiz.passwordIncorrect)
        notifyRef.current(FACULTY_MSG.quiz.passwordIncorrect, {
          toastId: FACULTY_TOAST_ID.quizPasswordError,
          durationMs: FACULTY_TOAST_MS,
          tone: 'error',
        })
        return
      }
      notifyRef.current(FACULTY_MSG.quiz.passwordVerified, {
        toastId: FACULTY_TOAST_ID.quizPasswordVerified,
        durationMs: FACULTY_TOAST_MS,
        tone: 'success',
      })
      await loadQuiz(false)
    } catch (e) {
      setPasswordError(FACULTY_MSG.quiz.passwordIncorrect)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-svh bg-neutral-100 font-[Inter,system-ui,sans-serif]">
      <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <BackButton to="/student/quizzes">« Back</BackButton>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading quiz…</p>
        ) : !quiz && !passwordModalOpen ? (
          <p className="text-sm text-neutral-500">Quiz not found.</p>
        ) : quiz ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-neutral-900">{quiz.title}</h2>
              <p className="mt-1 text-sm text-neutral-500">{quiz.subject}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Deadline</dt>
                  <dd>{formatDeadlineDisplay(quiz.deadline) || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Duration</dt>
                  <dd>{formatDurationMins(quiz.duration_mins)}</dd>
                </div>
              </dl>
              {quiz.instructions && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-neutral-500">Instructions</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{quiz.instructions}</p>
                </div>
              )}
            </section>

            {(quiz.parts || []).map((part, pIndex) => (
              <section key={part.id || pIndex} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-sm font-bold text-neutral-800">
                  {part.part_title || `Part ${pIndex + 1}`}
                </h3>
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
        ) : null}
      </main>

      <QuizPasswordModal
        open={passwordModalOpen}
        onCancel={() => navigate('/student/quizzes')}
        onSubmit={(password) => void handleVerifyPassword(password)}
        submitting={verifying}
        error={passwordError}
      />
    </div>
  )
}
