import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { authClient } from '../../lib/auth-client.js'
import {
  fetchStudentQuizzes,
  formatDateYmd,
  formatDeadlineDisplay,
  formatDurationMins,
  QUESTION_TYPE_LABELS,
  quizDisplayType,
  typeBadgeClass,
} from '../../lib/studentQuizzes.js'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

export default function StudentQuizzesPage() {
  const navigate = useNavigate()
  const { sessionUser } = useOutletContext() || {}
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)

  const loadQuizzes = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchStudentQuizzes()
      setQuizzes(rows)
    } catch (e) {
      setQuizzes([])
      console.error('[StudentQuizzesPage]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadQuizzes()
  }, [loadQuizzes])

  async function logout() {
    await authClient.signOut()
    navigate('/login/student', { replace: true })
  }

  return (
    <div className="min-h-svh bg-neutral-100 font-[Inter,system-ui,sans-serif]">
      <header className="border-b border-neutral-200 bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">STUDENT</p>
            <h1 className="text-2xl font-bold text-neutral-900">Quizzes</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Available quizzes</h2>
          {sessionUser?.name && (
            <p className="mt-1 text-sm text-neutral-500">Signed in as {sessionUser.name}</p>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  {['Quiz', 'Type', 'Subject', 'Deadline', 'Duration', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      Loading quizzes…
                    </td>
                  </tr>
                ) : quizzes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      No quizzes available right now.
                    </td>
                  </tr>
                ) : (
                  quizzes.map((quiz) => {
                    const qType = quizDisplayType(quiz)
                    const typeLabel = QUESTION_TYPE_LABELS[qType] || qType || '—'
                    return (
                      <tr key={quiz.id} className="border-b border-neutral-100 last:border-0">
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-neutral-900">{quiz.title || 'Untitled'}</span>
                            {quiz.has_password && (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Password
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500">Created {formatDateYmd(quiz.created_at)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeClass(qType)}`}
                          >
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">{quiz.subject || '—'}</td>
                        <td className="px-4 py-4 text-neutral-700">{formatDeadlineDisplay(quiz.deadline) || '—'}</td>
                        <td className="px-4 py-4 text-neutral-700">{formatDurationMins(quiz.duration_mins)}</td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            className="rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            onClick={() => navigate(`/student/quizzes/${quiz.id}`)}
                          >
                            Open
                          </button>
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
    </div>
  )
}
