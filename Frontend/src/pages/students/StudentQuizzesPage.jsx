import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  fetchStudentQuizzesList,
  formatDeadlineDisplay,
  formatDurationMins,
  quizDisplayType,
  quizStatusBadgeClass,
} from '../../lib/studentQuizzes.js'
import { isOnline } from '../../lib/offlineSync.js'
import { useOfflineStatus } from '../../hooks/useOfflineStatus.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

const PAGE_SIZE = 10
const BTN_VIEW = { background: '#14B8A6' }

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-800"
    >
      {label}
      <span className="inline-flex flex-col leading-none text-[9px] text-neutral-400">
        <i className={`ti ti-chevron-up ${active && direction === 'asc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
        <i className={`ti ti-chevron-down -mt-0.5 ${active && direction === 'desc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
      </span>
    </button>
  )
}

function StatusBadge({ label, tone }) {
  return (
    <span className={`inline-flex w-auto shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${quizStatusBadgeClass(tone)} ${deadlineBadgeBorder(tone)}`}>
      {label}
    </span>
  )
}

function DeadlineBadge({ label, tone }) {
  if (tone === 'green') {
    return (
      <span className="ml-2 inline-flex w-auto shrink-0 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        {label}
      </span>
    )
  }
  if (tone === 'red') {
    return (
      <span className="ml-2 inline-flex w-auto shrink-0 items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        {label}
      </span>
    )
  }
  return (
    <span className={`ml-2 inline-flex w-auto shrink-0 items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${quizStatusBadgeClass(tone)} ${deadlineBadgeBorder(tone)}`}>
      {label}
    </span>
  )
}

function deadlineBadgeBorder(tone) {
  switch (tone) {
    case 'green':
      return 'border-emerald-200'
    case 'red':
      return 'border-red-200'
    case 'blue':
      return 'border-sky-200'
    case 'yellow':
      return 'border-amber-200'
    default:
      return 'border-neutral-200'
  }
}

export default function StudentQuizzesPage() {
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const { isOffline } = useOfflineStatus()
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('title')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  const loadQuizzes = useCallback(async () => {
    setLoading(true)
    try {
      const offline = !isOnline()
      const rows = await fetchStudentQuizzesList()
      setQuizzes(rows)
      setFromCache(offline)
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

  useEffect(() => {
    setPage(1)
  }, [query, sortKey, sortDir])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = quizzes.filter((item) => {
      if (!q) return true
      return (
        String(item.title || '').toLowerCase().includes(q) ||
        String(item.subject || '').toLowerCase().includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      let av = ''
      let bv = ''
      switch (sortKey) {
        case 'subject':
          av = String(a.subject || '')
          bv = String(b.subject || '')
          break
        case 'type':
          av = quizDisplayType(a)
          bv = quizDisplayType(b)
          break
        case 'status':
          av = String(a.status || '')
          bv = String(b.status || '')
          break
        default:
          av = String(a.title || '')
          bv = String(b.title || '')
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [quizzes, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredSorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <>
      <StudentMainHeader pageTitle="Quizzes" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <StudentViewHeader title="Quiz Details" backTo="/student/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm">
          All Quizzes
          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-sky-100 px-2 text-xs font-bold text-sky-800">
            {filteredSorted.length}
          </span>
        </div>

        <div className="relative max-w-md">
          <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search"
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3">
                    <SortHeader label="Quiz Title" active={sortKey === 'title'} direction={sortDir} onClick={() => toggleSort('title')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Subject" active={sortKey === 'subject'} direction={sortDir} onClick={() => toggleSort('subject')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Type" active={sortKey === 'type'} direction={sortDir} onClick={() => toggleSort('type')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Status" active={sortKey === 'status'} direction={sortDir} onClick={() => toggleSort('status')} />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Duration</th>
                  <th className="min-w-[11rem] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Deadline</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                      Loading quizzes…
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                      {!isOnline() && quizzes.length === 0
                        ? 'No offline quizzes yet. Connect to the internet and open the dashboard once to sync.'
                        : 'No quizzes available right now.'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((quiz, idx) => {
                    const status = String(quiz.submission_status || 'not_started').toLowerCase()
                    return (
                      <tr
                        key={quiz.id}
                        className={`border-b border-neutral-100 last:border-0 ${idx % 2 === 1 ? 'bg-neutral-50/70' : 'bg-white'}`}
                      >
                        <td className="px-4 py-3 font-semibold text-neutral-900">{quiz.title || 'Untitled'}</td>
                        <td className="px-4 py-3 font-semibold uppercase text-neutral-800">{quiz.subject || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                            Quiz
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={quiz.status} tone={quiz.status_tone} />
                          {status === 'completed' && (quiz.max_attempts ?? 1) > 1 ? (
                            <p className="mt-0.5 text-xs text-neutral-500">
                              Attempt {quiz.attempts_used ?? 1} of {quiz.max_attempts ?? 1}
                              {quiz.can_retake ? ' · retake available' : ''}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{formatDurationMins(quiz.duration_mins)}</td>
                        <td className="min-w-[11rem] px-4 py-3 text-neutral-700">
                          <div className="inline-flex max-w-full flex-wrap items-center">
                            <span className="whitespace-nowrap">{formatDeadlineDisplay(quiz.deadline) || '—'}</span>
                            {quiz.deadline_badge ? (
                              <DeadlineBadge label={quiz.deadline_badge} tone={quiz.deadline_badge_tone} />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {status === 'completed' ? (
                            <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                              {quiz.score_display}
                            </span>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/student/quizzes/${quiz.id}/view`)}
                              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                              style={BTN_VIEW}
                            >
                              View
                            </button>
                            {status === 'not_started' && quiz.submission_open ? (
                              <button
                                type="button"
                                disabled={isOffline}
                                title={isOffline ? 'Not available offline' : undefined}
                                onClick={() => navigate(`/student/quizzes/${quiz.id}/view`)}
                                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ background: ACTION_BLUE }}
                              >
                                Start
                              </button>
                            ) : null}
                            {status === 'in_progress' && quiz.submission_open ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/student/quizzes/${quiz.id}/take`)}
                                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                                style={{ background: ACTION_BLUE }}
                              >
                                Continue
                              </button>
                            ) : null}
                            {!quiz.submission_open && status !== 'completed' ? (
                              <span className="text-xs font-semibold text-red-600">Closed</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-600">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="disabled:opacity-40 hover:text-neutral-900"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[2rem] rounded px-2 py-0.5 tabular-nums ${
                    n === safePage ? 'bg-neutral-200 font-bold text-neutral-900' : 'hover:bg-neutral-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="disabled:opacity-40 hover:text-neutral-900"
            >
              Next →
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
