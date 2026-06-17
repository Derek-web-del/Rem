import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { isOnline } from '../../lib/offlineSync.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import {
  deleteTeacherQuiz,
  fetchTeacherQuizzes,
  formatDateYmd,
  formatDeadlineDisplay,
  formatDurationMins,
  quizPartTypeLabels,
  toggleTeacherQuizVisibility,
  typeBadgeClass,
} from '../../lib/teacherQuizzes.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const BTN_EDIT = { background: '#F59E0B' }
const BTN_DELETE = { background: '#EF4444' }
const BTN_VIEW = { background: '#14B8A6' }
const BTN_HIDE = { background: '#6366F1' }

function ActionBtn({ label, style, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
      style={style}
    >
      {label}
    </button>
  )
}

export default function TeacherQuizzesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState('')

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadQuizzes = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchTeacherQuizzes()
      setQuizzes(rows)
      setFromCache(!isOnline())
    } catch (e) {
      setQuizzes([])
      console.error('[TeacherQuizzesPage]', e)
      toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.createFailed), {
        toastId: FACULTY_TOAST_ID.quizFetchError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadQuizzes()
  }, [loadQuizzes, location.key])

  useEffect(() => {
    const state = location.state
    if (state?.quizToast === 'created') {
      toastRef.current.success(FACULTY_MSG.quiz.created, {
        toastId: FACULTY_TOAST_ID.quizAddSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      navigate(location.pathname, { replace: true, state: {} })
    } else if (state?.quizToast === 'updated') {
      toastRef.current.success(FACULTY_MSG.quiz.updated, {
        toastId: FACULTY_TOAST_ID.quizEditSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  async function confirmDelete() {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      await deleteTeacherQuiz(deleteTarget.id)
      toastRef.current.success(FACULTY_MSG.quiz.deleted, {
        toastId: FACULTY_TOAST_ID.quizDeleteSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      setDeleteTarget(null)
      await loadQuizzes()
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.deleteFailed), {
        toastId: FACULTY_TOAST_ID.quizDeleteError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleVisibility(quiz) {
    if (!quiz?.id) return
    setTogglingId(quiz.id)
    try {
      const isHidden = await toggleTeacherQuizVisibility(quiz.id)
      toastRef.current.success(isHidden ? FACULTY_MSG.quiz.hidden : FACULTY_MSG.quiz.visible, {
        toastId: isHidden ? FACULTY_TOAST_ID.quizHideSuccess : FACULTY_TOAST_ID.quizUnhideSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      await loadQuizzes()
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.visibilityFailed), {
        toastId: FACULTY_TOAST_ID.quizVisibilityError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setTogglingId('')
    }
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Quiz maker" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Quiz list</h2>
          </div>
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => navigate('/teacher/quizzes/new')}
          >
            + Add quiz
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  {['Subject', 'Type', 'Grade', 'Deadline', 'Duration', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                      Loading quizzes…
                    </td>
                  </tr>
                ) : quizzes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                      No quizzes yet. Click &quot;+ Add quiz&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  quizzes.map((quiz) => {
                    const partTypes = quizPartTypeLabels(quiz)
                    return (
                      <tr
                        key={quiz.id}
                        className={`border-b border-neutral-100 last:border-0 ${quiz.is_hidden ? 'bg-neutral-50 opacity-70' : ''}`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold text-neutral-900">{quiz.title || 'Untitled'}</div>
                            {quiz.is_hidden && (
                              <span className="inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                                Hidden
                              </span>
                            )}
                            {quiz.has_password && (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Locked
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500">{quiz.subject || '—'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {partTypes.length > 0 ? (
                              partTypes.map((pt) => (
                                <span
                                  key={pt.value}
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(pt.value)}`}
                                >
                                  {pt.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-neutral-500">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                            {quiz.grade_level || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">{formatDeadlineDisplay(quiz.deadline) || '—'}</td>
                        <td className="px-4 py-4 text-neutral-700">{formatDurationMins(quiz.duration_mins)}</td>
                        <td className="px-4 py-4 text-neutral-700">{formatDateYmd(quiz.created_at)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1.5">
                            <ActionBtn
                              label="View"
                              style={BTN_VIEW}
                              onClick={() => navigate(`/teacher/quizzes/${quiz.id}`)}
                            />
                            <ActionBtn
                              label="Edit"
                              style={BTN_EDIT}
                              onClick={() => navigate(`/teacher/quizzes/${quiz.id}/edit`)}
                            />
                            <ActionBtn
                              label={quiz.is_hidden ? 'Unhide' : 'Hide'}
                              style={BTN_HIDE}
                              onClick={() => void handleToggleVisibility(quiz)}
                            />
                            <ActionBtn label="Delete" style={BTN_DELETE} onClick={() => setDeleteTarget(quiz)} />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete quiz?</h3>
            <p className="mt-2 text-sm text-neutral-600">
              &quot;{deleteTarget.title}&quot; will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
