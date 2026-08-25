import { useEffect, useRef, useState } from 'react'
import { resolveCurriculumPreviewPaths } from '../../../../components/CurriculumPdfPreview.jsx'
import { resolvePdfUrl } from '../../../../lib/pdfCacheStatus.js'

/** Native browser PDF viewer (page nav, zoom, rotate, fullscreen) — no `#toolbar=0`, so the
 * chrome shows through, matching Canvas/Instructure's own file-preview panel. */
export function InlinePdfPreview({ guide, title }) {
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
