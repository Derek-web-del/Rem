import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  formatDateYmd,
  formatDeadlineDisplay,
  formatDurationMins,
  isPastDeadline,
  QUESTION_TYPE_LABELS,
  quizPartTypeLabels,
  typeBadgeClass,
  updateQuizSubmissionScore,
} from '../../lib/teacherQuizzes.js'
import { fetchTeacherQuizRosterView, fetchTeacherQuizView } from '../../lib/teacherPortalOffline.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import { formatSemesterLabel } from '../../lib/quizQuestionTypes.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  SCORE_LOCKED_MSG,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import { formatScoreWithPercent } from '../../lib/gradeStatus.js'
import { GradesScoreBar } from '../../components/GradesPanel.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const BTN_EDIT = { background: '#F59E0B' }

function formatScoreDisplay(score, total) {
  if (score == null) return '—'
  const t = Number(total)
  const s = Number(score)
  if (!Number.isFinite(s)) return '—'
  if (Number.isFinite(t) && t > 0) return `${s.toFixed(2)} / ${t.toFixed(2)}`
  return s.toFixed(2)
}

function statusLabel(status) {
  const s = String(status || 'not_started').toLowerCase()
  if (s === 'completed') return 'Completed'
  if (s === 'in_progress') return 'In progress'
  return 'Not started'
}

function formatViolationTimestamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function tabSwitchViolations(st) {
  const list = Array.isArray(st.violations) ? st.violations : []
  return list.filter((v) => String(v?.type || '').trim() === 'tab_switch')
}

function tabSwitchTooltip(st) {
  const tabSwitches = tabSwitchViolations(st)
  if (tabSwitches.length < 1) return ''
  const lines = tabSwitches.map(
    (v) =>
      `• Tab switch — Q${v.question_number ?? '?'} — ${formatViolationTimestamp(v.timestamp)}`,
  )
  return [`${tabSwitches.length} tab switch${tabSwitches.length === 1 ? '' : 'es'}`, ...lines].join('\n')
}

function partPointsSubtotal(part) {
  return (part.questions || []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
}

export default function TeacherQuizView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)

  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [roster, setRoster] = useState(null)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [sectionFilter, setSectionFilter] = useState('')
  const [scoreTarget, setScoreTarget] = useState(null)
  const [scoreValue, setScoreValue] = useState('')
  const [savingScore, setSavingScore] = useState(false)
  const [fromCache, setFromCache] = useState(false)

  const totalPoints = quiz?.total_points ?? roster?.summary?.max_points ?? 100
  const scoreLocked = isPastDeadline(quiz?.deadline)
  const gradedSummary = useMemo(() => {
    const students = roster?.students || []
    const total = students.length
    const graded = students.filter(
      (st) =>
        String(st.status || '').toLowerCase() === 'completed' &&
        st.score != null &&
        Number.isFinite(Number(st.score)),
    ).length
    return { graded, total, submitted: roster?.summary?.submitted_count ?? 0 }
  }, [roster])

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadRoster = useCallback(
    async (sectionId) => {
      if (!id) return
      setRosterLoading(true)
      try {
        const { data, fromCache: cached } = await fetchTeacherQuizRosterView(id, {
          sectionId: sectionId || undefined,
        })
        setRoster(data.roster)
        if (cached) setFromCache(true)
      } catch (e) {
        console.error('[TeacherQuizView] roster', e)
        setRoster(null)
      } finally {
        setRosterLoading(false)
      }
    },
    [id],
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, fromCache: cached } = await fetchTeacherQuizView(id)
        if (!cancelled) {
          setQuiz(data.quiz)
          if (cached) setFromCache(true)
        }
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

  useEffect(() => {
    if (!quiz?.id) return
    void loadRoster(sectionFilter)
  }, [quiz?.id, sectionFilter, loadRoster])

  function openEditScore(st) {
    setScoreTarget(st)
    setScoreValue(st.score != null ? String(st.score) : '')
  }

  async function saveScore() {
    if (!scoreTarget?.submission_id || !id) return
    const score = Number(scoreValue)
    if (!Number.isFinite(score) || score < 0 || score > totalPoints) {
      toastRef.current.error(`Score must be between 0 and ${totalPoints}.`, {
        toastId: FACULTY_TOAST_ID.scoreEditError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return
    }
    setSavingScore(true)
    try {
      await updateQuizSubmissionScore(id, scoreTarget.submission_id, score)
      await loadRoster(sectionFilter)
      setScoreTarget(null)
      toastRef.current.success(FACULTY_MSG.quiz.scoreUpdated, {
        toastId: FACULTY_TOAST_ID.scoreUpdateSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.scoreUpdateFailed), {
        toastId: FACULTY_TOAST_ID.scoreEditError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setSavingScore(false)
    }
  }

  const partTypes = quiz ? quizPartTypeLabels(quiz) : []

  return (
    <>
      <TeacherMainHeader pageTitle="Quiz Maker" />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mb-4">
          <BackButton to="/teacher/quizzes" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
        </div>
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

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
              {partTypes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {partTypes.map((pt) => (
                    <span
                      key={pt.value}
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(pt.value)}`}
                    >
                      {pt.label}
                    </span>
                  ))}
                </div>
              ) : null}
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
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Semester</dt>
                  <dd className="text-neutral-800">{formatSemesterLabel(quiz.semester) || '—'}</dd>
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
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Max attempts</dt>
                  <dd className="text-neutral-800">{quiz.max_attempts ?? 1}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-neutral-500">Pass code</dt>
                  <dd className="text-neutral-800">{quiz.has_password ? 'Required' : 'None'}</dd>
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

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">Quiz structure</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Question and answer keys are hidden here. Edit the quiz to change content.
              </p>
              <div className="mt-4 space-y-3">
                {(quiz.parts || []).map((part, pIndex) => {
                  const typeLabel = QUESTION_TYPE_LABELS[part.question_type] || part.question_type || '—'
                  const qCount = (part.questions || []).length
                  const pts = partPointsSubtotal(part)
                  return (
                    <div
                      key={part.id || pIndex}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-neutral-900">
                          {part.part_title || `Part ${pIndex + 1}`}
                        </p>
                        <span
                          className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(part.question_type)}`}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600">
                        {qCount} question{qCount === 1 ? '' : 's'} · {pts.toFixed(1)} pts
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">Student scores</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Published to grade level:{' '}
                    <span className="font-semibold text-neutral-800">{roster?.grade_level || quiz.grade_level || '—'}</span>
                    {' · '}
                    Graded: {gradedSummary.graded}/{gradedSummary.total}
                    {' · '}
                    Submitted: {gradedSummary.submitted}/{gradedSummary.total}
                  </p>
                </div>
                <div className="min-w-[180px]">
                  <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Section</label>
                  <select
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                  >
                    <option value="">All sections</option>
                    {(roster?.sections || []).map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.section_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {scoreLocked ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <i className="ti ti-lock mr-1.5 inline-block align-middle" aria-hidden="true" />
                  {SCORE_LOCKED_MSG}
                </div>
              ) : null}

              {rosterLoading ? (
                <p className="mt-4 text-sm text-neutral-500">Loading scores…</p>
              ) : roster ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Students</p>
                      <p className="mt-1 text-2xl font-bold text-neutral-900">{roster.summary.total_students}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Submitted</p>
                      <p className="mt-1 text-2xl font-bold text-neutral-900">{roster.summary.submitted_count}</p>
                    </div>
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Class average</p>
                      <p className="mt-1 text-2xl font-bold text-neutral-900">
                        {roster.summary.class_avg_score != null
                          ? formatScoreDisplay(roster.summary.class_avg_score, roster.summary.max_points)
                          : '—'}
                      </p>
                      {roster.summary.class_avg_percent != null ? (
                        <p className="text-xs text-neutral-500">{roster.summary.class_avg_percent}% avg</p>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-neutral-500">Max points</p>
                      <p className="mt-1 text-2xl font-bold text-neutral-900">{roster.summary.max_points}</p>
                    </div>
                  </div>

                  {roster.students.length === 0 ? (
                    <p className="mt-4 text-sm text-neutral-500">
                      No active students found for this grade level
                      {sectionFilter ? ' in the selected section' : ''}.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-neutral-200 bg-neutral-50">
                          <tr>
                            {['Student', 'Section', 'Status', 'Score', 'Grade', 'Submitted', 'Flags', 'Action'].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {roster.students.map((st) => (
                            <tr key={st.student_id} className="border-b border-neutral-100 last:border-0">
                              <td className="px-4 py-3 font-medium text-neutral-900">{st.student_name}</td>
                              <td className="px-4 py-3 text-neutral-700">{st.section_name}</td>
                              <td className="px-4 py-3 text-neutral-700">{statusLabel(st.status)}</td>
                              <td className="px-4 py-3 text-neutral-700">
                                {st.score != null && Number.isFinite(Number(st.score))
                                  ? formatScoreDisplay(st.score, st.total_points)
                                  : st.status === 'completed'
                                    ? '—'
                                    : '—'}
                              </td>
                              <td className="px-4 py-3 min-w-[10rem]">
                                {st.percent != null ? (
                                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                                    <GradesScoreBar percent={st.percent} />
                                  </div>
                                ) : (
                                  <span className="text-neutral-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-neutral-700">
                                {st.submitted_at ? formatDateYmd(st.submitted_at) : '—'}
                              </td>
                              <td className="px-4 py-3 text-neutral-700">
                                {tabSwitchViolations(st).length >= 1 ? (
                                  <span
                                    className="inline-flex items-center gap-1.5 text-amber-600"
                                    title={tabSwitchTooltip(st)}
                                    aria-label={`${tabSwitchViolations(st).length} tab switch violation(s)`}
                                  >
                                    <i className="ti ti-flag-filled text-base" aria-hidden="true" />
                                    <span className="text-xs font-bold tabular-nums">
                                      {tabSwitchViolations(st).length}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {!st.submission_id ? (
                                  <span className="text-xs text-neutral-500">No submission</span>
                                ) : scoreLocked ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-sm text-neutral-600"
                                    title={SCORE_LOCKED_MSG}
                                  >
                                    <i className="ti ti-lock" aria-hidden="true" />
                                    {st.score != null
                                      ? `${formatScoreWithPercent(st.score, st.total_points)} (locked)`
                                      : '— (locked)'}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                                    style={BTN_EDIT}
                                    onClick={() => openEditScore(st)}
                                  >
                                    Edit Score
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-neutral-500">Could not load student scores.</p>
              )}
            </section>
          </div>
        )}
      </main>

      {scoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Edit Score</h3>
            <p className="mt-2 text-sm text-neutral-600">{scoreTarget.student_name}</p>
            <p className="mt-4 text-center text-sm font-medium text-neutral-700">
              Score Range: 0 to {totalPoints}
            </p>
            <div className="mt-4 flex justify-center">
              <input
                type="number"
                min={0}
                max={totalPoints}
                step="0.01"
                value={scoreValue}
                onChange={(e) => setScoreValue(e.target.value)}
                className="w-48 rounded-full border border-neutral-400 px-4 py-2 text-center text-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="mt-8 flex justify-center gap-3">
              <button
                type="button"
                className="rounded-lg px-6 py-2 text-sm font-semibold text-white hover:brightness-110"
                style={{ background: '#F87171' }}
                onClick={() => setScoreTarget(null)}
                disabled={savingScore}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg px-6 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                style={{ background: '#22C55E' }}
                onClick={() => void saveScore()}
                disabled={savingScore}
              >
                {savingScore ? 'Saving…' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
