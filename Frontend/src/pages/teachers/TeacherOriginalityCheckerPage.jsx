import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ACCEPT_FILE_TYPES,
  contentPreview,
  deletePlagiarismReport,
  fetchPlagiarismReports,
  formatReportDateOnly,
  formatReportDateTime,
  getRiskLevel,
  MAX_FILE_BYTES,
  ORIGINALITY_FILE_MAX_MSG,
  riskBadgeStyle,
  submitForAnalysis,
} from '../../lib/originalityChecker.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_ANNOUNCEMENT_TOAST_MS, useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import { ACTION_BLUE, SIDEBAR_GOLD, SIDEBAR_GOLD_DARK } from './instituteChrome.js'

const HEADER_GRADIENT = `linear-gradient(90deg, ${SIDEBAR_GOLD} 0%, ${SIDEBAR_GOLD_DARK} 100%)`
const BTN_VIEW = { background: '#14B8A6' }
const ROWS_PER_PAGE = 10

function GradientCardHeader({ title, subtitle, badges }) {
  return (
    <div className="shrink-0 rounded-t-xl px-4 py-3 text-white md:px-5 md:py-4" style={{ background: HEADER_GRADIENT }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold md:text-lg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-white/85 md:text-sm">{subtitle}</p> : null}
        </div>
        {badges}
      </div>
    </div>
  )
}

function RiskBadge({ score }) {
  const risk = getRiskLevel(score)
  const style = riskBadgeStyle(risk.tone)
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      {risk.label}
    </span>
  )
}

function ScoreBadge({ score }) {
  const risk = getRiskLevel(score)
  const style = riskBadgeStyle(risk.tone)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: style.bg, color: style.color }}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: style.dot }} aria-hidden="true" />
      {Number(score).toFixed(1)}%
    </span>
  )
}

export default function TeacherOriginalityCheckerPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const fileRef = useRef(null)
  const reportsRef = useRef(null)

  const [activeTab, setActiveTab] = useState('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [reports, setReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const refreshReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const rows = await fetchPlagiarismReports()
      setReports(rows)
    } catch (e) {
      setReports([])
      console.error('[TeacherOriginalityCheckerPage]', e)
      toastRef.current.error(FACULTY_MSG.originality.loadFailed, {
        toastId: FACULTY_TOAST_ID.originalityFetchError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => {
    void refreshReports()
  }, [refreshReports])

  async function confirmDelete() {
    if (!deleteTarget?.id) return
    const newTotal = reports.length - 1
    setDeleting(true)
    try {
      await deletePlagiarismReport(deleteTarget.id)
      toastRef.current.success(FACULTY_MSG.originality.deleted, {
        toastId: FACULTY_TOAST_ID.originalityDeleteSuccess,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      setDeleteTarget(null)
      await refreshReports()
      setPage((p) => {
        const newMaxPage = Math.max(1, Math.ceil(newTotal / ROWS_PER_PAGE))
        return p > newMaxPage ? Math.max(1, newMaxPage) : p
      })
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.originality.deleteFailed), {
        toastId: FACULTY_TOAST_ID.originalityDeleteError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setDeleting(false)
    }
  }

  const charCount = text.length
  const lastReportDate = reports[0]?.createdAt
  const totalPages = Math.ceil(reports.length / ROWS_PER_PAGE)
  const safePage = Math.min(page, Math.max(1, totalPages || 1))
  const start = (safePage - 1) * ROWS_PER_PAGE
  const pageReports = reports.slice(start, start + ROWS_PER_PAGE)

  const statsBadge = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{reports.length} Total</span>
        {lastReportDate ? (
          <span className="text-xs text-white/85">Last: {formatReportDateOnly(lastReportDate)}</span>
        ) : null}
      </div>
    ),
    [reports.length, lastReportDate],
  )

  function onFilePick(nextFile) {
    if (!nextFile) return
    const ext = nextFile.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'docx', 'pdf'].includes(ext || '')) {
      toastRef.current.error('Supported formats: .txt, .docx, .pdf')
      return
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      toastRef.current.error(ORIGINALITY_FILE_MAX_MSG)
      return
    }
    setFile(nextFile)
  }

  async function handleAnalyze() {
    if (analyzing) return

    if (activeTab === 'file') {
      if (!file) {
        toastRef.current.error('Choose a file to analyze.')
        return
      }
    } else if (!text.trim()) {
      toastRef.current.error('Enter text to analyze.')
      return
    } else if (text.trim().length < 50) {
      toastRef.current.error('Minimum 50 characters required.')
      return
    }

    setAnalyzing(true)

    try {
      const report = await submitForAnalysis(
        activeTab === 'file' ? { file } : { content: text.trim() },
      )
      await refreshReports()
      setPage(1)
      reportsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toastRef.current.success('Analysis complete.')
      navigate(`/teacher/originality-checker/reports/${report.id}`)
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.originality.createFailed), {
        toastId: FACULTY_TOAST_ID.originalityCreateError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <>
      <TeacherMainHeader pageTitle="AI-Checker" />
      <main className="flex flex-col p-4 md:p-6">
        <TeacherBackButton to="/teacher/dashboard" className="mb-2 block w-fit text-left" />

        <div className="mb-3 w-full shrink-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Plagiarism Checker</h2>
        </div>

        <div className="flex flex-col gap-3 lg:gap-4">
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_280px] lg:gap-4">
            <div>
              <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <GradientCardHeader
                title="AI Plagiarism Analysis"
                subtitle="Upload or paste your content for instant analysis"
              />

              <div className="border-b border-neutral-200 px-4 pt-3 md:px-5">
                <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition md:px-4 md:py-2 ${
                      activeTab === 'text'
                        ? 'bg-white shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    style={activeTab === 'text' ? { color: ACTION_BLUE } : undefined}
                  >
                    <i className="ti ti-forms" aria-hidden="true" />
                    Text Input
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition md:px-4 md:py-2 ${
                      activeTab === 'file'
                        ? 'bg-white shadow-sm'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                    style={activeTab === 'file' ? { color: ACTION_BLUE } : undefined}
                  >
                    <i className="ti ti-upload" aria-hidden="true" />
                    File Upload
                  </button>
                </div>
              </div>

              <div className="space-y-3 p-4 md:space-y-4 md:p-5">
                {activeTab === 'text' ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                      Enter your text to analyze
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      placeholder="Paste your content here for plagiarism analysis..."
                      className="w-full resize-y rounded-lg border border-neutral-300 px-4 py-3 text-sm text-neutral-900 outline-none ring-blue-500/30 focus-visible:ring-2"
                    />
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                      <span>{charCount} characters</span>
                      <span>Minimum 50 characters recommended</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                      dragOver ? 'border-blue-400 bg-blue-50' : 'border-neutral-300 bg-neutral-50'
                    }`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(ev) => {
                      ev.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(ev) => {
                      ev.preventDefault()
                      setDragOver(false)
                      onFilePick(ev.dataTransfer.files?.[0])
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') fileRef.current?.click()
                    }}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ACCEPT_FILE_TYPES}
                      className="hidden"
                      onChange={(ev) => {
                        onFilePick(ev.target.files?.[0])
                        ev.target.value = ''
                      }}
                    />
                    <i className="ti ti-cloud-upload mb-2 text-3xl" style={{ color: ACTION_BLUE }} aria-hidden="true" />
                    <p className="text-sm text-neutral-600">Drag &amp; drop your file here</p>
                    <button
                      type="button"
                      className="mt-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-blue-50"
                      style={{ borderColor: ACTION_BLUE, color: ACTION_BLUE }}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        fileRef.current?.click()
                      }}
                    >
                      Choose File
                    </button>
                    <p className="mt-2 text-xs text-neutral-500">
                      Supported formats: .txt, .docx, .pdf — Max 15MB
                    </p>
                    {file ? <p className="mt-1 text-sm font-medium text-neutral-800">{file.name}</p> : null}
                  </div>
                )}

                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => void handleAnalyze()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
                  style={{ backgroundColor: ACTION_BLUE }}
                >
                  <i className="ti ti-scan" aria-hidden="true" />
                  {analyzing ? 'Analyzing…' : 'Analyze for Plagiarism'}
                </button>
              </div>
            </section>
            </div>

            <aside className="flex flex-col gap-3 lg:gap-4">
            <section className="shrink-0 rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm md:p-5">
              <div
                className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 md:h-16 md:w-16"
                style={{ color: ACTION_BLUE }}
              >
                <i className="ti ti-robot text-3xl" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-neutral-900">AI-Powered Detection</h3>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5">
                  <i className="ti ti-bolt text-xl text-amber-500" aria-hidden="true" />
                  <p className="mt-1 text-xs font-semibold text-neutral-700">Instant</p>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5">
                  <i className="ti ti-shield-check text-xl text-emerald-500" aria-hidden="true" />
                  <p className="mt-1 text-xs font-semibold text-neutral-700">Accurate</p>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5">
                  <i className="ti ti-world text-xl text-sky-500" aria-hidden="true" />
                  <p className="mt-1 text-xs font-semibold text-neutral-700">Global</p>
                </div>
              </div>
            </section>

            <section className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <GradientCardHeader title="Pro Tips" />
              <ul className="space-y-3 p-4 md:space-y-4 md:p-5">
                {[
                  {
                    title: 'Check Multiple Sources',
                    body: 'Cross-reference results for better accuracy.',
                  },
                  {
                    title: 'Review Flagged Content',
                    body: 'Examine highlighted sentences carefully.',
                  },
                  {
                    title: 'Proper Citations',
                    body: 'Always cite your sources correctly.',
                  },
                ].map((tip) => (
                  <li key={tip.title} className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50"
                      style={{ color: ACTION_BLUE }}
                    >
                      <i className="ti ti-check" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{tip.title}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{tip.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            </aside>
          </div>

          <div ref={reportsRef} className="w-full">
            <section className="flex w-full flex-col rounded-xl border border-neutral-200 bg-white shadow-sm">
              <GradientCardHeader
                title="Recent Reports"
                subtitle="Your analysis history"
                badges={statsBadge}
              />

              <div>
                <table className="w-full min-w-full table-fixed text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    <tr>
                      <th className="w-[18%] px-3 py-2.5 md:px-4 md:py-3">Date &amp; Time</th>
                      <th className="w-[34%] px-3 py-2.5 md:px-4 md:py-3">Content Preview</th>
                      <th className="w-[14%] px-3 py-2.5 md:px-4 md:py-3">Similarity Score</th>
                      <th className="w-[14%] px-3 py-2.5 md:px-4 md:py-3">Risk Level</th>
                      <th className="w-[24%] px-3 py-2.5 md:px-4 md:py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingReports ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                          Loading reports…
                        </td>
                      </tr>
                    ) : reports.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                          No reports yet. Run your first analysis above.
                        </td>
                      </tr>
                    ) : (
                      pageReports.map((report) => (
                        <tr key={report.id} className="border-b border-neutral-100 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2.5 text-neutral-700 md:px-4 md:py-3">
                            {formatReportDateTime(report.createdAt)}
                          </td>
                          <td className="px-3 py-2.5 text-neutral-700 md:px-4 md:py-3">
                            <span className="line-clamp-2">{contentPreview(report.content, 80)}</span>
                            <span className="mt-0.5 block text-xs text-neutral-400">
                              {String(report.content || '').length} characters
                            </span>
                          </td>
                          <td className="px-3 py-2.5 md:px-4 md:py-3">
                            <ScoreBadge score={report.similarityScore} />
                          </td>
                          <td className="px-3 py-2.5 md:px-4 md:py-3">
                            <RiskBadge score={report.similarityScore} />
                          </td>
                          <td className="px-3 py-2.5 md:px-4 md:py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/teacher/originality-checker/reports/${report.id}`)}
                                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                                style={BTN_VIEW}
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(report)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:border-red-400 hover:bg-red-100"
                                title="Delete report"
                                aria-label="Delete report"
                              >
                                <i className="ti ti-trash" aria-hidden="true" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!loadingReports && reports.length > 0 ? (
                <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 md:px-5">
                  <span className="text-xs text-neutral-500">
                    Showing {start + 1}–{Math.min(start + ROWS_PER_PAGE, reports.length)} of {reports.length} reports
                  </span>

                  {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ← Previous
                      </button>
                      <span className="min-w-[80px] text-center text-xs tabular-nums text-neutral-500">
                        Page {safePage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next →
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete Report</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Are you sure you want to delete this report? This action cannot be undone.
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
      ) : null}
    </>
  )
}
