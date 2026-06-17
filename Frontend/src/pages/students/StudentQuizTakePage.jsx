import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import StudentQuizAnswerField from '../../components/StudentQuizAnswerField.jsx'
import StudentQuizPasswordModal from '../../components/StudentQuizPasswordModal.jsx'
import { useNotify } from '../../components/notifications.jsx'
import {
  answersMapFromSaved,
  buildAnswersPayload,
  countAnsweredQuestions,
  fetchStudentQuizTake,
  formatTimerDisplay,
  saveStudentQuizProgress,
  saveStudentQuizProgressKeepalive,
  startStudentQuiz,
  submitStudentQuiz,
  submitQuizViolations,
  verifyStudentQuizPassword,
} from '../../lib/studentQuizzes.js'
import { createQuizSessionGuard } from '../../lib/quizSessionGuard.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'
import { isOnline } from '../../lib/offlineSync.js'
import {
  addToSyncQueue,
  cacheQuizData,
  getCachedQuiz,
  getQuizProgress,
  saveQuizProgress as saveQuizProgressIdb,
  getQuizAnswers,
} from '../../lib/indexedDB.js'

const AUTOSAVE_INTERVAL_MS = 30000

function formatSavedAtTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

function serializeSavePayload(payload) {
  return JSON.stringify(payload)
}

function QuizTimerSidebar({ remainingSeconds, timerPct, answered, total }) {
  return (
    <aside
      className="quiz-take-timer-sidebar sticky top-4 w-[160px] shrink-0 self-start rounded-lg border border-neutral-300 bg-white p-3 shadow-sm"
      aria-live="polite"
    >
      <p className="text-center text-[10px] font-bold uppercase tracking-wider text-neutral-500">Time</p>
      <p
        className="mt-1 text-center text-xl font-bold tabular-nums lg:text-2xl"
        style={{ color: ACTION_BLUE }}
      >
        {formatTimerDisplay(remainingSeconds ?? 0)}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full transition-all duration-1000"
          style={{ width: `${timerPct}%`, background: ACTION_BLUE }}
        />
      </div>
      <p className="mt-2 text-center text-[10px] text-neutral-500">
        {answered} of {total} answered
      </p>
    </aside>
  )
}

function QuizSessionLockOverlay({ onResume }) {
  return (
    <div
      className="quiz-session-lock-overlay absolute inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-session-lock-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-xl">
        <p id="quiz-session-lock-title" className="text-base font-semibold text-neutral-900">
          Return to fullscreen to continue your quiz.
        </p>
        <button
          type="button"
          onClick={onResume}
          className="mt-4 rounded-lg px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
          style={{ background: ACTION_BLUE }}
        >
          Resume quiz
        </button>
      </div>
    </div>
  )
}

function SubmitQuizModal({ open, answered, total, submitting, onCancel, onSubmit }) {
  if (!open) return null
  return (
    <div className="quiz-submit-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h3 className="text-lg font-bold text-neutral-900">Submit Quiz?</h3>
          <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-neutral-800">Are you sure you want to submit your quiz?</p>
          <p className="mt-2 text-sm font-semibold text-amber-600">
            You have answered {answered} out of {total} questions.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg bg-neutral-600 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            style={{ background: ACTION_BLUE }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StudentQuizTakePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const { success, warning, error: notifyError } = useNotify()

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answerMap, setAnswerMap] = useState(new Map())
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const [totalSeconds, setTotalSeconds] = useState(null)
  const [timeSpent, setTimeSpent] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitModalOpen, setSubmitModalOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [multiTabBlocked, setMultiTabBlocked] = useState(false)
  const [lockChecked, setLockChecked] = useState(false)
  const [sessionLocked, setSessionLocked] = useState(false)

  const answerMapRef = useRef(answerMap)
  const timeSpentRef = useRef(timeSpent)
  const quizRef = useRef(quiz)
  const autoSubmittingRef = useRef(false)
  const savingRef = useRef(false)
  const lastSavedPayloadRef = useRef(null)
  const quizWrapperRef = useRef(null)
  const guardRef = useRef(null)
  const releaseLockRef = useRef(null)
  const guardSessionRef = useRef(false)
  const guardInitGenRef = useRef(0)

  answerMapRef.current = answerMap
  timeSpentRef.current = timeSpent
  quizRef.current = quiz
  savingRef.current = saving

  const loadQuiz = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      if (!isOnline()) {
        const inProgress = await getQuizProgress(String(id))
        if (!inProgress) {
          notifyError('You are offline. Cannot start a new quiz — connect to continue.')
          navigate(`/student/quizzes/${id}/view`, { replace: true })
          return
        }
        const cached = await getCachedQuiz(String(id))
        if (!cached) {
          notifyError('You are offline and no in-progress quiz is available.')
          navigate(`/student/quizzes/${id}`, { replace: true })
          return
        }
        const rawAnswers = await getQuizAnswers(String(id))
        const savedAnswers = rawAnswers.map((a) => ({
          question_id: a.questionId ?? a.question_id,
          selected_choice_id: a.selected_choice_id ?? null,
          student_answer: a.student_answer ?? a.value ?? null,
        }))
        setQuiz(cached)
        const parts = cached?.parts || []
        setAnswerMap(answersMapFromSaved(savedAnswers, parts))
        const total = cached?.duration_mins ? cached.duration_mins * 60 : null
        setRemainingSeconds(total)
        setTotalSeconds(total)
        warning('Offline — resuming in-progress quiz. Answers will sync when you reconnect.')
        return
      }
      const data = await fetchStudentQuizTake(id)
      if (data.submission_open === false) {
        notifyError('Quiz deadline has passed.')
        navigate(`/student/quizzes/${id}/view`, { replace: true })
        return
      }
      if (!data.submission?.started_at && String(data.submission?.status || 'not_started') !== 'completed') {
        await startStudentQuiz(id)
        const refreshed = await fetchStudentQuizTake(id)
        if (refreshed.submission_open === false) {
          notifyError('Quiz deadline has passed.')
          navigate(`/student/quizzes/${id}/view`, { replace: true })
          return
        }
        data.quiz = refreshed.quiz
        data.answers = refreshed.answers
        data.remaining_seconds = refreshed.remaining_seconds
        data.submission = refreshed.submission
      }
      if (data.quiz) {
        await cacheQuizData(data.quiz)
      }
      setQuiz(data.quiz)
      const parts = data.quiz?.parts || []
      setAnswerMap(answersMapFromSaved(data.answers, parts))
      const total = data.remaining_seconds ?? (data.quiz?.duration_mins ? data.quiz.duration_mins * 60 : null)
      setRemainingSeconds(total)
      setTotalSeconds(total)
      setTimeSpent(data.submission?.time_spent_seconds ?? 0)
      if (Array.isArray(data.answers) && data.answers.length > 0) {
        setLastSavedAt(new Date())
      }
    } catch (e) {
      if (e?.code === 'PASSWORD_REQUIRED') {
        setPasswordModalOpen(true)
        setQuiz(null)
      } else if (e?.code === 'COMPLETED' || e?.code === 'NO_ATTEMPTS_LEFT') {
        notifyError(
          e?.code === 'NO_ATTEMPTS_LEFT'
            ? 'No attempts remaining for this quiz.'
            : 'This quiz has already been submitted.',
        )
        navigate(`/student/quizzes/${id}`, { replace: true })
      } else if (e?.code === 'CAN_RETAKE') {
        navigate(`/student/quizzes/${id}/view`, { replace: true })
      } else if (e?.code === 'CLOSED') {
        notifyError('Quiz deadline has passed.')
        navigate(`/student/quizzes/${id}/view`, { replace: true })
      } else {
        const inProgress = await getQuizProgress(String(id))
        const cached = inProgress ? await getCachedQuiz(String(id)) : null
        if (cached) {
          setQuiz(cached)
          const parts = cached?.parts || []
          setAnswerMap(answersMapFromSaved([], parts))
          const total = cached?.duration_mins ? cached.duration_mins * 60 : null
          setRemainingSeconds(total)
          setTotalSeconds(total)
          warning(
            isOnline()
              ? 'Could not reach the server — showing cached in-progress quiz.'
              : 'Offline — resuming in-progress quiz. Answers will sync when you reconnect.',
          )
        } else {
          console.error('[StudentQuizTakePage]', e)
          notifyError(
            isOnline()
              ? String(e?.message || 'Failed to load quiz.')
              : 'You are offline and no cached quiz is available.',
          )
          setQuiz(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [id, navigate, notifyError])

  useEffect(() => {
    void loadQuiz()
  }, [loadQuiz])

  const progress = useMemo(() => {
    if (!quiz) return { answered: 0, total: 0 }
    return countAnsweredQuestions(quiz.parts, answerMap)
  }, [quiz, answerMap])

  const timerPct = totalSeconds && remainingSeconds != null ? (remainingSeconds / totalSeconds) * 100 : 100

  function updateAnswer(questionId, value) {
    setAnswerMap((prev) => {
      const next = new Map(prev)
      next.set(String(questionId), value)
      return next
    })
  }

  const buildCurrentSavePayload = useCallback(() => {
    return {
      answers: buildAnswersPayload(answerMapRef.current),
      time_spent_seconds: timeSpentRef.current,
    }
  }, [])

  const saveProgress = useCallback(
    async ({ keepalive = false } = {}) => {
      if (!id || savingRef.current) return

      const currentQuiz = quizRef.current
      if (!currentQuiz) return

      const { answered } = countAnsweredQuestions(currentQuiz.parts, answerMapRef.current)
      if (answered === 0) return

      const payload = buildCurrentSavePayload()
      const serialized = serializeSavePayload(payload)
      if (serialized === lastSavedPayloadRef.current) return

      savingRef.current = true
      setSaving(true)
      try {
        if (!isOnline()) {
          await saveQuizProgressIdb({ quizId: id, ...payload })
          lastSavedPayloadRef.current = serialized
          setLastSavedAt(new Date())
          return
        }
        if (keepalive) {
          await saveStudentQuizProgressKeepalive(id, payload)
        } else {
          await saveStudentQuizProgress(id, payload)
        }
        lastSavedPayloadRef.current = serialized
        setLastSavedAt(new Date())
      } catch (e) {
        console.error('[StudentQuizTakePage] save', e)
        if (e?.code === 'CLOSED') {
          notifyError('Quiz deadline has passed.')
          navigate(`/student/quizzes/${id}/view`, { replace: true })
          return
        }
        if (!keepalive) {
          notifyError(String(e?.message || 'Failed to save progress.'))
        }
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [id, buildCurrentSavePayload, notifyError],
  )

  const saveProgressRef = useRef(saveProgress)
  saveProgressRef.current = saveProgress

  function teardownGuardSession() {
    releaseLockRef.current?.()
    releaseLockRef.current = null
    guardRef.current?.destroy?.()
    guardRef.current = null
    guardSessionRef.current = false
  }

  const handleSubmitRef = useRef(() => {})

  async function handleSubmit(auto = false) {
    if (!id || submitting) return
    const { answered, total } = countAnsweredQuestions(quiz?.parts, answerMapRef.current)
    if (!auto && answered < total) {
      warning('Please answer all questions before submitting.')
      return
    }
    setSubmitting(true)
    const violations = guardRef.current?.getViolations?.() ?? []
    teardownGuardSession()
    try {
      const answers = buildAnswersPayload(answerMapRef.current)
      const time_spent_seconds = timeSpentRef.current
      if (!isOnline()) {
        await addToSyncQueue({
          type: 'quiz_submit',
          quizId: id,
          answers,
          time_spent_seconds,
          violations,
        })
        warning('Offline — quiz queued. It will submit when you reconnect.')
        navigate(`/student/quizzes/${id}/results`, { replace: true })
        return
      }
      try {
        await submitQuizViolations(id, violations)
      } catch (violErr) {
        console.warn('[StudentQuizTakePage] violations save failed:', violErr?.message || violErr)
      }
      await submitStudentQuiz(id, {
        answers,
        time_spent_seconds,
      })
      if (auto) {
        notifyError("Time's up! Quiz submitted.")
      } else {
        success('Quiz submitted')
      }
      navigate(`/student/quizzes/${id}/results`, { replace: true })
    } catch (e) {
      console.error('[StudentQuizTakePage] submit', e)
      if (e?.code === 'CLOSED') {
        notifyError('Quiz deadline has passed.')
        navigate(`/student/quizzes/${id}/view`, { replace: true })
      } else {
        notifyError(String(e?.message || 'Failed to submit quiz.'))
      }
      autoSubmittingRef.current = false
    } finally {
      setSubmitting(false)
      setSubmitModalOpen(false)
    }
  }

  handleSubmitRef.current = handleSubmit

  useEffect(() => {
    if (remainingSeconds == null || remainingSeconds <= 0) return undefined
    const tick = setInterval(() => {
      setRemainingSeconds((s) => {
        if (s == null || s <= 1) return 0
        return s - 1
      })
      setTimeSpent((t) => t + 1)
    }, 1000)
    return () => clearInterval(tick)
  }, [remainingSeconds == null ? 'none' : remainingSeconds > 0 ? 'active' : 'done'])

  useEffect(() => {
    if (remainingSeconds !== 0 || autoSubmittingRef.current || !quiz || remainingSeconds == null) return
    autoSubmittingRef.current = true
    void handleSubmitRef.current(true)
  }, [remainingSeconds, quiz])

  useEffect(() => {
    if (!quiz || loading) return undefined
    const interval = setInterval(() => {
      void saveProgressRef.current()
    }, AUTOSAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [quiz, loading])

  useEffect(() => {
    guardInitGenRef.current += 1
    releaseLockRef.current?.()
    releaseLockRef.current = null
    guardRef.current?.destroy?.()
    guardRef.current = null
    guardSessionRef.current = false
    setLockChecked(false)
    setMultiTabBlocked(false)
  }, [id])

  const sessionReady = Boolean(quiz && !loading && !passwordModalOpen)

  useEffect(() => {
    if (!sessionReady || guardSessionRef.current) return undefined

    guardSessionRef.current = true
    const gen = ++guardInitGenRef.current
    let cancelled = false

    void (async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const containerEl = quizWrapperRef.current
      if (!containerEl || cancelled || gen !== guardInitGenRef.current) {
        if (gen === guardInitGenRef.current) guardSessionRef.current = false
        return
      }

      const result = await createQuizSessionGuard({
        quizId: id,
        containerEl,
        onLockAcquired: (release) => {
          releaseLockRef.current = release
        },
        onLockChange: ({ locked }) => {
          setSessionLocked(locked)
        },
        onVisibilityHidden: () => {
          void saveProgressRef.current({ keepalive: true })
        },
      })

      if (cancelled || gen !== guardInitGenRef.current) {
        if (!result.blocked) {
          result.releaseLock?.()
          result.destroy?.()
        }
        releaseLockRef.current = null
        guardSessionRef.current = false
        return
      }

      if (result.blocked) {
        setMultiTabBlocked(true)
        setLockChecked(true)
        return
      }

      guardRef.current = result
      setMultiTabBlocked(false)
      setLockChecked(true)
    })()

    return () => {
      cancelled = true
      guardInitGenRef.current += 1
      releaseLockRef.current?.()
      releaseLockRef.current = null
      guardRef.current?.destroy?.()
      guardRef.current = null
      guardSessionRef.current = false
    }
  }, [sessionReady, id])

  useEffect(() => {
    return () => {
      teardownGuardSession()
    }
  }, [])

  useEffect(() => {
    if (!quiz || loading) return undefined

    const onPageHide = () => {
      void saveProgressRef.current({ keepalive: true })
    }
    const onOffline = () => {
      void saveProgressRef.current({ keepalive: true })
    }
    const onBeforeUnload = () => {
      void saveProgressRef.current({ keepalive: true })
    }

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [quiz, loading])

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
      try {
        await startStudentQuiz(id)
        await loadQuiz()
      } catch (e) {
        if (e?.code === 'NO_ATTEMPTS_LEFT') {
          notifyError('No attempts remaining for this quiz.')
          navigate(`/student/quizzes/${id}`, { replace: true })
        } else {
          throw e
        }
      }
    } finally {
      setVerifying(false)
    }
  }

  const questionCount =
    quiz?.question_count ?? (quiz?.parts || []).reduce((n, p) => n + (p.questions || []).length, 0)

  const quizSessionActive = Boolean(quiz && lockChecked && !multiTabBlocked)

  function handleResumeQuiz() {
    void guardRef.current?.resumeFullscreen?.()
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <StudentMainHeader pageTitle="Quizzes" />

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={
            quizSessionActive
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden py-4'
              : 'min-h-0 flex-1 overflow-y-auto py-4'
          }
        >
          <div
            className={`mx-auto flex w-full max-w-5xl flex-col px-4 md:px-8 lg:px-12 ${quizSessionActive ? 'min-h-0 flex-1' : ''}`}
          >
            <StudentViewHeader title="Quiz Form" backTo="/student/quizzes" />

            {loading ? (
              <p className="text-sm text-neutral-500">Loading quiz…</p>
            ) : !quiz ? (
              <p className="text-sm text-neutral-500">
                {passwordModalOpen ? 'Enter pass code to continue.' : 'Quiz not available.'}
              </p>
            ) : (
              <div
                id="quiz-wrapper"
                ref={quizWrapperRef}
                className={
                  quizSessionActive
                    ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50'
                    : 'flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50'
                }
              >
                {!lockChecked ? (
                  <p className="p-6 text-sm text-neutral-500">Preparing quiz session…</p>
                ) : null}

                {lockChecked && multiTabBlocked ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center m-4">
                    <p className="text-base font-semibold text-amber-900">Quiz already open in another tab</p>
                    <p className="mt-2 text-sm text-amber-800">
                      This quiz is already open in another browser tab. Close that tab to continue here, or return to
                      the quiz overview.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/student/quizzes/${id}/view`)}
                      className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                      style={{ background: ACTION_BLUE }}
                    >
                      Back to quiz overview
                    </button>
                  </div>
                ) : null}

                {lockChecked && !multiTabBlocked ? (
                  <>
                    <div className="quiz-take-scroll relative min-h-0 flex-1 overflow-y-auto">
                      {sessionLocked ? (
                        <QuizSessionLockOverlay onResume={handleResumeQuiz} />
                      ) : null}
                      <div
                        className={`quiz-take-inner mx-auto w-full max-w-5xl px-4 py-4 md:px-6 md:py-6 ${sessionLocked ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 md:gap-6">
                          <div className="min-w-0 space-y-4">
                            <section className="rounded-lg border border-neutral-200 bg-white p-3 md:p-4">
                          <h3 className="text-base font-bold text-neutral-900 md:text-lg">{quiz.title}</h3>
                          <p className="mt-0.5 text-xs text-neutral-500 md:text-sm">
                            {quiz.subject} • {questionCount} Questions • {Number(quiz.total_points || 0).toFixed(0)}{' '}
                            Points
                            {quiz.attempts_used != null && quiz.max_attempts != null
                              ? ` • Attempt ${quiz.attempts_used} of ${quiz.max_attempts}`
                              : null}
                          </p>
                          {quiz.instructions ? (
                            <div className="mt-3 rounded-lg px-3 py-2 text-white" style={{ background: ACTION_BLUE }}>
                              <p className="text-xs font-bold">Instructions:</p>
                              <p className="mt-0.5 text-xs md:text-sm">{quiz.instructions}</p>
                            </div>
                          ) : null}
                        </section>

                        <div className="space-y-4">
                          {(quiz.parts || []).map((part, pIndex) => (
                            <div key={part.id || pIndex}>
                              <div
                                className="rounded-t-lg px-3 py-1.5 text-xs font-bold text-white"
                                style={{ background: ACTION_BLUE }}
                              >
                                {part.part_title || `Part ${pIndex + 1}`}
                              </div>
                              <div className="space-y-3 rounded-b-lg border border-t-0 border-neutral-200 bg-white p-3">
                                {(part.questions || []).map((q, qIndex) => {
                                  const globalNum =
                                    (quiz.parts || [])
                                      .slice(0, pIndex)
                                      .reduce((n, p) => n + (p.questions || []).length, 0) + qIndex + 1
                                  return (
                                    <article
                                      key={q.id || qIndex}
                                      data-question-num={globalNum}
                                      className="rounded-lg border border-neutral-200 border-l-2 border-l-sky-500 bg-white p-3 md:p-4"
                                    >
                                      <div className="mb-2 flex items-start justify-between gap-2">
                                        <h4 className="text-sm font-bold text-neutral-900">Question {globalNum}</h4>
                                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                                          {Number(q.points || 0).toFixed(1)} pts
                                        </span>
                                      </div>
                                      <p className="mb-3 text-sm font-medium text-neutral-800">{q.question_text}</p>
                                      <StudentQuizAnswerField
                                        question={q}
                                        value={answerMap.get(String(q.id))}
                                        onChange={(val) => updateAnswer(q.id, val)}
                                      />
                                    </article>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                          </div>

                          <QuizTimerSidebar
                            remainingSeconds={remainingSeconds}
                            timerPct={timerPct}
                            answered={progress.answered}
                            total={progress.total}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="quiz-take-footer shrink-0 border-t border-neutral-200 bg-white px-4 py-4 md:px-6">
                      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-3">
                        <div className="mr-auto min-h-[1.25rem] text-sm text-neutral-600">
                          {saving ? (
                            <span className="text-neutral-500">Saving…</span>
                          ) : lastSavedAt ? (
                            <span className="font-medium text-emerald-700">
                              Data saved at {formatSavedAtTime(lastSavedAt)}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={submitting || sessionLocked}
                          onClick={() => setSubmitModalOpen(true)}
                          className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                          style={{ background: ACTION_BLUE }}
                        >
                          <i className="ti ti-check" aria-hidden="true" />
                          Submit Quiz
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                <SubmitQuizModal
                  open={submitModalOpen}
                  answered={progress.answered}
                  total={progress.total}
                  submitting={submitting}
                  onCancel={() => setSubmitModalOpen(false)}
                  onSubmit={() => void handleSubmit(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <StudentQuizPasswordModal
        open={passwordModalOpen}
        onCancel={() => navigate(`/student/quizzes/${id}/view`)}
        onSubmit={handlePasswordSubmit}
        submitting={verifying}
        error={passwordError}
      />
    </div>
  )
}
