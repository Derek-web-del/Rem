import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { uploadsPathToApiUrl } from '../../lib/fileUrls.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const HIGH_SCHOOL_GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

const GRADE_LEVELS = ['All Grades', ...HIGH_SCHOOL_GRADES]

const HIGH_SCHOOL_GRADE_SET = new Set(HIGH_SCHOOL_GRADES)

/** Faculty curriculum guides are limited to Junior High School grades 7–10. */
function filterHighSchoolGuides(list) {
  if (!Array.isArray(list)) return []
  return list.filter((guide) => {
    const grade = String(guide?.grade_level || guide?.grade || '').trim()
    if (!grade) return true
    return HIGH_SCHOOL_GRADE_SET.has(grade)
  })
}

function formatUploadDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10) || '—'
  return d.toISOString().slice(0, 10)
}

function resolveFileUrl(fileUrl) {
  return uploadsPathToApiUrl(fileUrl)
}

function PdfPreviewFrame({ fileUrl, title, className = '' }) {
  const src = resolveFileUrl(fileUrl)
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-100 text-xs text-neutral-500 ${className}`}
      >
        No preview
      </div>
    )
  }
  return (
    <iframe
      title={title || 'Curriculum preview'}
      src={`${src}#toolbar=0&navpanes=0`}
      className={`w-full rounded-lg border border-neutral-200 bg-white ${className}`}
    />
  )
}

function CurriculumPdfModal({ guide, onClose }) {
  const [zoom, setZoom] = useState(100)
  const fileUrl = resolveFileUrl(guide?.file_url)
  const fileName = guide?.file_name || guide?.title || 'curriculum.pdf'

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDownload = () => {
    if (!fileUrl) return
    const a = document.createElement('a')
    a.href = fileUrl
    a.download = fileName
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{fileName}</p>
            <p className="text-xs text-neutral-500">PDF viewer</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
              <button
                type="button"
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-xs font-medium text-neutral-600">{zoom}%</span>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              onClick={handleDownload}
            >
              Download
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: ACTION_BLUE }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-4">
          <div
            className="mx-auto origin-top"
            style={{ transform: `scale(${zoom / 100})`, width: `${10000 / zoom}%`, maxWidth: '100%' }}
          >
            {fileUrl ? (
              <iframe title={fileName} src={fileUrl} className="h-[75vh] w-full rounded border border-neutral-200 bg-white" />
            ) : (
              <p className="py-12 text-center text-sm text-neutral-500">File unavailable.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CurriculumGuideCard({ guide, onView }) {
  const [hover, setHover] = useState(false)
  const grade = guide.grade_level || '—'
  const subject = guide.subject || '—'
  const title = guide.title || guide.file_name || 'Curriculum guide'
  const uploaded = formatUploadDate(guide.created_at)
  const by = guide.uploaded_by_name || 'Administrator'

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative bg-neutral-50 p-3">
        <PdfPreviewFrame fileUrl={guide.file_url} title={title} className="h-44" />
        {hover ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/35 transition"
            onClick={() => onView(guide)}
          >
            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow">
              <i className="ti ti-eye" aria-hidden="true" />
              View
            </span>
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 text-left">
        <p className="truncate text-xs text-neutral-500">{guide.file_name}</p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            {grade}
          </span>
          <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
            {subject}
          </span>
        </div>
        <h4 className="text-sm font-bold uppercase tracking-wide text-neutral-900">{title}</h4>
        <p className="mt-auto text-xs text-neutral-500">
          Uploaded: {uploaded} · By: {by}
        </p>
      </div>
    </article>
  )
}

export default function TeacherCurriculumPage() {
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterGrade, setFilterGrade] = useState('All Grades')
  const [filterSubject, setFilterSubject] = useState('All Subjects')
  const [appliedGrade, setAppliedGrade] = useState('All Grades')
  const [appliedSubject, setAppliedSubject] = useState('All Subjects')
  const [viewing, setViewing] = useState(null)
  const [subjectCatalog, setSubjectCatalog] = useState(['All Subjects'])

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/api/teacher/curriculum-guides'), { credentials: 'include' })
        const data = await res.json().catch(() => [])
        if (!res.ok || !Array.isArray(data)) return
        const set = new Set()
        for (const g of data) {
          const s = String(g?.subject || '').trim()
          if (s) set.add(s)
        }
        setSubjectCatalog(['All Subjects', ...Array.from(set).sort((a, b) => a.localeCompare(b))])
      } catch {
        /* ignore */
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadGuides = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (appliedGrade && appliedGrade !== 'All Grades') params.set('grade_level', appliedGrade)
        if (appliedSubject && appliedSubject !== 'All Subjects') params.set('subject', appliedSubject)
        const qs = params.toString()
        const res = await fetch(apiUrl(`/api/teacher/curriculum-guides${qs ? `?${qs}` : ''}`), {
          credentials: 'include',
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          const msg =
            data && typeof data === 'object'
              ? String(data.message || data.error || '').trim()
              : ''
          throw new Error(msg || `Failed to load curriculum guides (${res.status}).`)
        }
        if (!cancelled) setGuides(filterHighSchoolGuides(Array.isArray(data) ? data : []))
      } catch (e) {
        const msg = String(e?.message || e || 'Failed to load curriculum guides.')
        console.error('[TeacherCurriculumPage] fetch error:', msg)
        if (!cancelled) {
          setGuides([])
          setError(msg)
          toastRef.current.error(FACULTY_MSG.curriculum.loadFailed, {
            toastId: FACULTY_TOAST_ID.curriculumFetchError,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadGuides()
    return () => {
      cancelled = true
    }
  }, [appliedGrade, appliedSubject])

  const subjectOptions = subjectCatalog

  const applyFilters = () => {
    setAppliedGrade(filterGrade)
    setAppliedSubject(filterSubject)
  }

  const clearFilters = () => {
    setFilterGrade('All Grades')
    setFilterSubject('All Subjects')
    setAppliedGrade('All Grades')
    setAppliedSubject('All Subjects')
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Curriculum" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Curriculum Guides</h2>
          </div>
        </div>

        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={filterGrade}
              onChange={(e) => {
                setFilterGrade(e.target.value)
                setFilterSubject('All Subjects')
              }}
            >
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
            >
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: ACTION_BLUE }}
              onClick={applyFilters}
            >
              Filter
            </button>
            <button
              type="button"
              className="rounded-lg bg-neutral-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-500">
            All Curriculum Guides
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-neutral-500" role="status">
              <i className="ti ti-loader-2 mr-2 animate-spin text-lg" aria-hidden="true" />
              Loading curriculum guides…
            </div>
          ) : error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </div>
          ) : guides.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-600">
              No curriculum guides published yet.
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {guides.map((guide) => (
                <CurriculumGuideCard key={guide.id} guide={guide} onView={setViewing} />
              ))}
            </div>
          )}
        </section>
      </main>

      {viewing ? <CurriculumPdfModal guide={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  )
}
