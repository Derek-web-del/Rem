import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { resolveCurriculumPreviewPaths } from '../../../components/CurriculumPdfPreview.jsx'
import { resolvePdfUrl } from '../../../lib/pdfCacheStatus.js'

function curriculumGuideLabel(subject) {
  const grade = String(subject?.curriculumGuideGrade ?? '').trim()
  const title = String(subject?.curriculumGuideTitle ?? subject?.curriculumGuideLabel ?? '').trim()
  if (grade && title) return `${grade} — ${title}`
  if (title) return title
  if (grade) return grade
  return 'Linked institute guide'
}

/** Native browser PDF viewer (page nav, zoom, rotate, fullscreen) — no `#toolbar=0`, so the
 * chrome shows through, matching Canvas/Instructure's own file-preview panel. */
function InlinePdfPreview({ guide, title }) {
  const [viewerSrc, setViewerSrc] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const objectUrlRef = useRef('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError('')
      const { direct, fetchPath } = resolveCurriculumPreviewPaths(guide)
      if (!direct && !fetchPath) {
        setLoadError('Preview unavailable')
        setLoading(false)
        return
      }
      if (direct.startsWith('data:') || direct.startsWith('blob:')) {
        setViewerSrc(direct)
        setLoading(false)
        return
      }
      const fetchUrl = resolvePdfUrl(fetchPath || direct) || direct
      try {
        const res = await fetch(fetchUrl, { credentials: 'include' })
        const contentType = String(res.headers.get('content-type') || '').toLowerCase()
        if (!res.ok || contentType.includes('application/json')) throw new Error('Preview unavailable')
        const blob = await res.blob()
        if (cancelled) return
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl
        setViewerSrc(objectUrl)
      } catch {
        if (!cancelled) setLoadError('Preview unavailable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = ''
      }
    }
  }, [guide?.id, guide?.file_url])

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
        Loading preview…
      </div>
    )
  }
  if (loadError || !viewerSrc) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
        {loadError || 'Preview unavailable'}
      </div>
    )
  }
  return (
    <iframe
      title={title}
      src={viewerSrc}
      className="h-[70vh] w-full rounded-lg border border-neutral-200 bg-white"
    />
  )
}

/** libraryPath: optional route to a "browse curriculum library" page — omit for roles (e.g.
 * students) that don't have one, and the link is simply hidden. */
export default function SubjectCurriculumGuideCard({ subject, libraryPath = '' }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!subject) return null

  const guideId = String(subject.curriculumGuideId || subject.curriculum_guide_id || '').trim()
  const label = curriculumGuideLabel(subject)
  const fileUrl = String(subject.curriculumGuideFileUrl || subject.curriculum_guide_file_url || '').trim()
  const fileName = String(subject.curriculumGuideFileName || '').trim() || 'curriculum-guide.pdf'
  const guide = {
    id: guideId || subject.id,
    file_url: fileUrl,
    file_name: fileName,
    title: label,
  }

  if (!guideId && !label) {
    return (
      <aside className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Curriculum guide (DepEd)</p>
        <p className="mt-2 text-sm text-neutral-600">
          No institute curriculum guide is linked to this subject yet.
        </p>
        {libraryPath ? (
          <Link to={libraryPath} className="mt-3 inline-block text-sm font-semibold text-sky-800 hover:underline">
            Browse curriculum library
          </Link>
        ) : null}
      </aside>
    )
  }

  return (
    <aside className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Curriculum guide (DepEd)</p>
          <p className="mt-1 text-sm font-medium text-neutral-900">{label}</p>
          <p className="mt-1 text-xs text-neutral-500">Official institute reference used to build this subject syllabus</p>
        </div>
      </div>

      {fileUrl ? (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <div className="flex items-center gap-2">
            <i className="ti ti-file-type-pdf shrink-0 text-lg text-red-600" aria-hidden="true" />
            <a
              href={resolvePdfUrl(fileUrl)}
              download={fileName}
              className="min-w-0 truncate text-sm font-medium text-sky-800 underline-offset-2 hover:underline"
            >
              {fileName}
            </a>
            <a
              href={resolvePdfUrl(fileUrl)}
              download={fileName}
              className="shrink-0 text-neutral-400 hover:text-neutral-700"
              aria-label="Download file"
              title="Download"
            >
              <i className="ti ti-download text-base" aria-hidden="true" />
            </a>
          </div>
          <button
            type="button"
            className="mt-1.5 text-xs font-medium text-sky-800 hover:underline"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? 'Minimise file preview' : 'Preview file'}
          </button>
          {previewOpen ? (
            <div className="mt-2">
              <InlinePdfPreview guide={guide} title={fileName} />
            </div>
          ) : null}
          {libraryPath ? (
            <div className="mt-2">
              <Link to={libraryPath} className="text-xs font-semibold text-blue-800 hover:underline">
                Open library
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
          Curriculum PDF is linked but not available for preview.
        </p>
      )}
    </aside>
  )
}
