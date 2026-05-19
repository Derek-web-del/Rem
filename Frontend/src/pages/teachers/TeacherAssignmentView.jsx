import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  downloadSubmissionFile,
  fetchTeacherAssignmentSubmissions,
  formatDateYmd,
  resolveAssignmentFileUrl,
  submissionStatusBadge,
  updateSubmissionScore,
} from '../../lib/teacherAssignments.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'
import { ACTION_BLUE, SIDEBAR_GOLD_DARK } from './instituteChrome.js'

const PAGE_SIZE = 10

const labelStyle = {
  padding: '10px 14px',
  color: '#6b7280',
  fontSize: '13px',
  borderTop: '0.5px solid #e5e7eb',
  width: '20%',
  whiteSpace: 'nowrap',
}

const valueStyle = {
  padding: '10px 14px',
  color: '#111827',
  fontSize: '13px',
  borderTop: '0.5px solid #e5e7eb',
  width: '30%',
}

const BTN_EDIT = { background: '#F59E0B' }
const BTN_VIEW = { background: SIDEBAR_GOLD_DARK }
const BTN_DOWNLOAD = { background: '#16a34a' }

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

function StatusBadge({ submission }) {
  const badge = submissionStatusBadge(submission)
  const bg = badge.tone === 'red' ? '#FEE2E2' : '#FEF3C7'
  const color = badge.tone === 'red' ? '#B91C1C' : '#B45309'
  return (
    <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: bg, color }}>
      {badge.label}
    </span>
  )
}

function ActionBtn({ label, style, onClick, disabled, dimHover = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${dimHover ? 'hover:brightness-90' : 'hover:brightness-110'}`}
      style={style}
    >
      {label}
    </button>
  )
}

export default function TeacherAssignmentView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('student_name')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [scoreTarget, setScoreTarget] = useState(null)
  const [scoreValue, setScoreValue] = useState('')
  const [savingScore, setSavingScore] = useState(false)
  const [viewTarget, setViewTarget] = useState(null)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchTeacherAssignmentSubmissions(id)
      setAssignment(data.assignment)
      setSubmissions(data.submissions)
      if (data.expiredUpdated) {
        toastRef.current.info(FACULTY_MSG.assignments.deadlineExpired, {
          toastId: FACULTY_TOAST_ID.deadlineExpired,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      }
    } catch (e) {
      console.error('[TeacherAssignmentView]', e)
      setAssignment(null)
      setSubmissions([])
      setLoadError('Failed to load submissions. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [query, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = submissions
    if (q) {
      list = submissions.filter((s) => String(s.student_name || '').toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      let av
      let bv
      switch (sortKey) {
        case 'no':
          av = Number(a.id) || 0
          bv = Number(b.id) || 0
          break
        case 'status':
          av = submissionStatusBadge(a).label.toLowerCase()
          bv = submissionStatusBadge(b).label.toLowerCase()
          break
        case 'upload_date':
          av = new Date(a.submitted_at || 0).getTime()
          bv = new Date(b.submitted_at || 0).getTime()
          break
        default:
          av = String(a.student_name || '').toLowerCase()
          bv = String(b.student_name || '').toLowerCase()
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [submissions, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredSorted.slice(start, start + PAGE_SIZE)
  }, [filteredSorted, safePage])

  const assignmentIndex = assignment?.id ? assignment.id : '1'
  const totalScore = assignment?.total_score ?? 100

  function openEditScore(sub) {
    setScoreTarget(sub)
    setScoreValue(sub.score != null ? String(sub.score) : '')
  }

  async function saveScore() {
    if (!scoreTarget || !id) return
    const score = Number(scoreValue)
    if (!Number.isFinite(score) || score < 0 || score > totalScore) {
      toastRef.current.error(`Score must be between 0 and ${totalScore}.`, {
        toastId: FACULTY_TOAST_ID.scoreEditError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return
    }
    setSavingScore(true)
    try {
      const updated = await updateSubmissionScore(id, scoreTarget.id, score)
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setScoreTarget(null)
      toastRef.current.success(FACULTY_MSG.assignments.scoreUpdated, {
        toastId: FACULTY_TOAST_ID.scoreUpdateSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } catch (e) {
      toastRef.current.error(FACULTY_MSG.assignments.scoreUpdateFailed, {
        toastId: FACULTY_TOAST_ID.scoreEditError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setSavingScore(false)
    }
  }

  const viewUrl = viewTarget ? resolveAssignmentFileUrl(viewTarget.file_path) : ''

  return (
    <>
      <TeacherMainHeader pageTitle="Assignments" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-8 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-2xl font-bold text-neutral-900">Assignment</h2>
          <BackButton to="/teacher/assignments" className="" />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-neutral-500">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-sky-600" />
            Loading assignment…
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
            <p className="text-sm font-medium text-red-800">{loadError}</p>
            <button
              type="button"
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              style={{ background: ACTION_BLUE }}
              onClick={() => void loadData()}
            >
              Retry
            </button>
          </div>
        ) : !assignment ? (
          <p className="text-sm text-neutral-600">Assignment not found.</p>
        ) : (
          <>
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-md">
              <h3 className="mb-4 text-base font-bold uppercase text-neutral-900">
                {assignment.title || `ASSIGNMENT ${assignmentIndex}`} Info:
              </h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td style={labelStyle}>Title</td>
                    <td style={valueStyle}>{assignment.title || '—'}</td>
                    <td style={labelStyle}>Subject</td>
                    <td style={valueStyle}>{assignment.subject_name || '—'}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Grade Level</td>
                    <td style={valueStyle}>{assignment.grade_level || '—'}</td>
                    <td style={labelStyle}>Upload date</td>
                    <td style={valueStyle}>{formatDateYmd(assignment.created_at)}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Submission Date</td>
                    <td style={valueStyle}>{formatDateYmd(assignment.submission_deadline)}</td>
                    <td style={labelStyle}>Total Score</td>
                    <td style={valueStyle}>{totalScore}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Description</td>
                    <td style={valueStyle} colSpan={3}>
                      {assignment.description || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
              <div className="border-b-2 pb-2" style={{ borderColor: ACTION_BLUE }}>
                <div className="inline-flex items-center gap-2">
                  <h3 className="text-base font-bold text-neutral-800">Assignment Submissions</h3>
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-600 tabular-nums">
                    {submissions.length}
                  </span>
                </div>
              </div>

              <div className="relative mt-4 max-w-xs">
                <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="No" active={sortKey === 'no'} direction={sortDir} onClick={() => toggleSort('no')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Student Name" active={sortKey === 'student_name'} direction={sortDir} onClick={() => toggleSort('student_name')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Assignment Status" active={sortKey === 'status'} direction={sortDir} onClick={() => toggleSort('status')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Upload Date" active={sortKey === 'upload_date'} direction={sortDir} onClick={() => toggleSort('upload_date')} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-500">
                          {submissions.length === 0 ? 'No submissions yet.' : 'No submissions found.'}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((sub, idx) => (
                        <tr key={sub.id} className="text-neutral-800">
                          <td className="px-4 py-4 tabular-nums">{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                          <td className="px-4 py-4 font-medium">{sub.student_name || '—'}</td>
                          <td className="px-4 py-4">
                            <StatusBadge submission={sub} />
                          </td>
                          <td className="px-4 py-4 tabular-nums">{formatDateYmd(sub.submitted_at)}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <ActionBtn label="Edit Score" style={BTN_EDIT} onClick={() => openEditScore(sub)} />
                              <ActionBtn
                                label="View"
                                style={BTN_VIEW}
                                disabled={!sub.file_path}
                                onClick={() => setViewTarget(sub)}
                              />
                              <ActionBtn
                                label="Download"
                                style={BTN_DOWNLOAD}
                                dimHover
                                disabled={!sub.file_path}
                                onClick={() => void downloadSubmissionFile(sub)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm font-medium text-neutral-600">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="disabled:opacity-40 hover:text-neutral-900"
                >
                  ← Prev
                </button>
                <span className="underline tabular-nums text-neutral-800">{safePage}</span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="disabled:opacity-40 hover:text-neutral-900"
                >
                  Next →
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {scoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Edit Score</h3>
            <p className="mt-6 text-center text-sm font-medium text-neutral-700">
              Score Range: 0 to {totalScore}
            </p>
            <div className="mt-4 flex justify-center">
              <input
                type="number"
                min={0}
                max={totalScore}
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

      {viewTarget && viewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="font-bold text-neutral-900">{viewTarget.student_name} — Submission</h3>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
                onClick={() => setViewTarget(null)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <iframe title="Submission preview" src={viewUrl} className="h-[min(70vh,560px)] w-full border-0" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
