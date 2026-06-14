import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PdfViewerModal from '../../components/PdfViewerModal.jsx'
import { StudyMaterialPdfThumb } from '../../components/StudyMaterialPdfViewer.jsx'
import {
  formatGradeTag,
  formatMaterialUploadDate,
  formatSubjectTag,
} from '../../lib/facultyStudyMaterials.js'
import { fetchStudentStudyMaterials } from '../../lib/studentPortal.js'
import { isOnline } from '../../lib/offlineSync.js'
import { downloadCachedPdf, isPdfCached } from '../../lib/pdfCacheStatus.js'
import { useNotify } from '../../components/notifications.jsx'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import PdfOfflineBadge from '../../components/PdfOfflineBadge.jsx'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'

const cardActionClass =
  'inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50'

function PdfBadgeIcon({ className }) {
  return (
    <div className={`flex items-center justify-center rounded-lg bg-sky-100 text-sky-700 ${className}`}>
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h2M8 17h6M8 9h1" />
      </svg>
    </div>
  )
}

function StudentStudyMaterialCard({ material, onView, badgeRefreshKey = 0, onDownloadUnavailable }) {
  const [hover, setHover] = useState(false)
  const [cached, setCached] = useState(false)
  const offline = !isOnline()
  const grade = formatGradeTag(material.grade_level)
  const subject = formatSubjectTag(material.subject)
  const title = material.title || material.file_name || 'Study material'
  const uploaded = formatMaterialUploadDate(material.created_at)
  const by = material.uploaded_by_name || 'Faculty'

  useEffect(() => {
    let cancelled = false
    void isPdfCached(material.file_url).then((ok) => {
      if (!cancelled) setCached(ok)
    })
    return () => {
      cancelled = true
    }
  }, [material.file_url, badgeRefreshKey])

  async function handleDownload() {
    const result = await downloadCachedPdf(material.file_url, material.file_name || title)
    if (result === 'unavailable') {
      onDownloadUnavailable?.(
        offline
          ? 'PDF not cached offline. Open View once while online, then download will work offline.'
          : 'File unavailable for download.',
      )
    }
  }

  const downloadDisabled = offline && !cached

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative bg-neutral-50 p-3">
        <StudyMaterialPdfThumb fileUrl={material.file_url} title={title} className="h-44" />
        {hover ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/35 transition"
            onClick={() => onView(material)}
          >
            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow">
              <i className="ti ti-eye" aria-hidden="true" />
              View
            </span>
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 text-left">
        <div className="flex items-start gap-2">
          <PdfBadgeIcon className="h-10 w-10 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-600">{material.file_name || '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            {grade}
          </span>
          <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
            {subject}
          </span>
          <PdfOfflineBadge fileUrl={material.file_url} refreshKey={badgeRefreshKey} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-900">{title}</h3>
        <p className="mt-auto text-xs text-neutral-500">
          Uploaded: {uploaded} · By: {by}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-4 py-3">
        <button type="button" className={cardActionClass} onClick={() => onView(material)}>
          <i className="ti ti-eye text-sm" aria-hidden="true" />
          View
        </button>
        <button
          type="button"
          className={cardActionClass}
          onClick={() => void handleDownload()}
          disabled={downloadDisabled}
          title={downloadDisabled ? 'View once online to cache for offline download' : undefined}
        >
          <i className="ti ti-download text-sm" aria-hidden="true" />
          Download
        </button>
      </div>
    </article>
  )
}

export default function StudentStudyMaterialsPage() {
  const { logoutToPortal } = useOutletContext() || {}
  const { error: notifyError } = useNotify()
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState(null)
  const [badgeRefreshKey, setBadgeRefreshKey] = useState(0)

  const loadMaterials = useCallback(async () => {
    setLoading(true)
    try {
      const offline = !isOnline()
      const list = await fetchStudentStudyMaterials()
      setMaterials(Array.isArray(list) ? list : [])
      setFromCache(offline)
    } catch (e) {
      setMaterials([])
      console.error('[StudentStudyMaterialsPage]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMaterials()
  }, [loadMaterials])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter((m) => {
      return (
        String(m.title || '').toLowerCase().includes(q) ||
        String(m.grade_level || '').toLowerCase().includes(q) ||
        String(m.subject || '').toLowerCase().includes(q) ||
        String(m.file_name || '').toLowerCase().includes(q) ||
        String(m.uploaded_by_name || '').toLowerCase().includes(q)
      )
    })
  }, [materials, query])

  return (
    <>
      <StudentMainHeader pageTitle="Study Materials" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <StudentViewHeader title="Study Materials" backTo="/student/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        <div className="relative max-w-md">
          <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search materials..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-neutral-500">Loading study materials…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-white py-12 text-center text-sm text-neutral-500">
            <i
              className="ti ti-file-off mx-auto mb-3 block text-4xl text-neutral-400"
              aria-hidden="true"
            />
            {query.trim()
              ? `No materials found for "${query.trim()}"`
              : !isOnline()
                ? 'No offline study materials yet. Connect to the internet and open the dashboard once to sync.'
                : 'No study materials available yet.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((material) => {
              if (!material?.id) return null
              return (
                <StudentStudyMaterialCard
                  key={material.id}
                  material={material}
                  onView={setViewing}
                  badgeRefreshKey={badgeRefreshKey}
                  onDownloadUnavailable={(msg) => notifyError(msg)}
                />
              )
            })}
          </div>
        )}
      </main>

      {viewing ? (
        <PdfViewerModal
          fileUrl={viewing.file_url}
          fileName={viewing.file_name || viewing.title || 'document.pdf'}
          onClose={() => {
            setViewing(null)
            setBadgeRefreshKey((k) => k + 1)
          }}
          onDownloadUnavailable={(msg) => notifyError(msg)}
        />
      ) : null}
    </>
  )
}
