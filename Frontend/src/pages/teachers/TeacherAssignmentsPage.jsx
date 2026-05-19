import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  deleteTeacherAssignment,
  fetchTeacherAssignments,
  formatDateYmd,
} from '../../lib/teacherAssignments.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const ITEMS_PER_PAGE = 5

const BTN_EDIT = { background: '#F59E0B' }
const BTN_DELETE = { background: '#EF4444' }
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

export default function TeacherAssignmentsPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [assignments, setAssignments] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadAssignments = useCallback(
    async (page) => {
      setLoading(true)
      try {
        const result = await fetchTeacherAssignments(page, {
          limit: ITEMS_PER_PAGE,
          q: query.trim(),
          sortKey,
          sortDir,
        })
        setAssignments(result.data)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        if (result.page !== page) {
          setCurrentPage(result.page)
        }
      } catch (e) {
        setAssignments([])
        setTotal(0)
        setTotalPages(1)
        console.error('[TeacherAssignmentsPage]', e)
      } finally {
        setLoading(false)
      }
    },
    [query, sortKey, sortDir],
  )

  useEffect(() => {
    void loadAssignments(currentPage)
  }, [currentPage, loadAssignments])

  useEffect(() => {
    setCurrentPage(1)
  }, [query, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handlePrev() {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1)
    }
  }

  function handleNext() {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTeacherAssignment(deleteTarget.id)
      setDeleteTarget(null)
      toastRef.current.success(FACULTY_MSG.assignments.deleted, {
        toastId: FACULTY_TOAST_ID.assignmentDeleteSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      const nextTotal = total - 1
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / ITEMS_PER_PAGE))
      const pageToLoad = currentPage > nextTotalPages ? 1 : currentPage
      if (pageToLoad !== currentPage) {
        setCurrentPage(pageToLoad)
      } else {
        await loadAssignments(pageToLoad)
      }
    } catch (e) {
      toastRef.current.error(FACULTY_MSG.assignments.deleteFailed, {
        toastId: FACULTY_TOAST_ID.assignmentDeleteError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      console.error(e)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Assignments" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Assignment list</h2>
            <div className="mt-3 inline-flex items-center gap-2 border-b-2 pb-1" style={{ borderColor: ACTION_BLUE }}>
              <span className="text-sm font-semibold text-neutral-800">All Assignment</span>
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-600 tabular-nums">
                {total}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => navigate('/teacher/assignments/new')}
          >
            + Add assignment
          </button>
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
          <div className="relative max-w-xs">
            <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {loading ? (
            <p className="py-12 text-center text-sm text-neutral-500">Loading assignments…</p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="border-b border-neutral-200 bg-white">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Name" active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Subject" active={sortKey === 'subject'} direction={sortDir} onClick={() => toggleSort('subject')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Grade Level" active={sortKey === 'grade_level'} direction={sortDir} onClick={() => toggleSort('grade_level')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Quarter" active={sortKey === 'quarter'} direction={sortDir} onClick={() => toggleSort('quarter')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Upload Date" active={sortKey === 'upload_date'} direction={sortDir} onClick={() => toggleSort('upload_date')} />
                      </th>
                      <th className="px-4 py-3 text-left">
                        <SortHeader label="Submission Date" active={sortKey === 'submission_date'} direction={sortDir} onClick={() => toggleSort('submission_date')} />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {assignments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-neutral-500">
                          No assignments found.
                        </td>
                      </tr>
                    ) : (
                      assignments.map((row) => (
                        <tr key={row.id} className="text-neutral-800">
                          <td className="px-4 py-4 font-medium uppercase">{row.title || '—'}</td>
                          <td className="px-4 py-4 font-medium uppercase">{row.subject_name || '—'}</td>
                          <td className="px-4 py-4">{row.grade_level || '—'}</td>
                          <td className="px-4 py-4 tabular-nums">
                            {row.quarter != null && String(row.quarter).trim() !== '' ? row.quarter : '—'}
                          </td>
                          <td className="px-4 py-4 tabular-nums">{formatDateYmd(row.created_at)}</td>
                          <td className="px-4 py-4 tabular-nums">{formatDateYmd(row.submission_deadline)}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <ActionBtn label="Edit" style={BTN_EDIT} onClick={() => navigate(`/teacher/assignments/${row.id}/edit`)} />
                              <ActionBtn label="Delete" style={BTN_DELETE} onClick={() => setDeleteTarget(row)} />
                              <ActionBtn label="View / Submissions" style={BTN_VIEW} onClick={() => navigate(`/teacher/assignments/${row.id}`)} />
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
                  disabled={currentPage === 1}
                  onClick={handlePrev}
                  className="disabled:opacity-40 hover:text-neutral-900"
                >
                  ← Prev
                </button>
                <span className="underline tabular-nums text-neutral-800">{currentPage}</span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={handleNext}
                  className="disabled:opacity-40 hover:text-neutral-900"
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete assignment</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={BTN_DELETE}
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
