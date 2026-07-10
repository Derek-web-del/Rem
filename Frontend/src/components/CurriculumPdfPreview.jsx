import { useEffect, useRef, useState } from 'react'
import { resolvePdfUrl } from '../lib/pdfCacheStatus.js'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'

/** Resolve stored curriculum guide paths for authenticated PDF preview. */
export function resolveCurriculumPreviewPaths(guide) {
  const inline = String(guide?.fileDataUrl ?? guide?.file_data_url ?? '').trim()
  if (inline.startsWith('data:') || inline.startsWith('blob:')) {
    return { direct: inline, fetchPath: '' }
  }
  if (inline.startsWith('http://') || inline.startsWith('https://')) {
    return { direct: inline, fetchPath: inline }
  }
  const path = String(guide?.fileUrl ?? guide?.file_url ?? guide?.file_data_url ?? inline ?? '').trim()
  if (!path) return { direct: '', fetchPath: '' }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return { direct: path, fetchPath: path }
  }
  return { direct: uploadsPathToApiUrl(path), fetchPath: path }
}

/**
 * PDF card thumbnail matching admin curriculum preview (fetch + blob for protected files).
 */
export default function CurriculumPdfPreview({
  guide,
  title = 'Curriculum preview',
  className = 'h-44',
  frameClassName = 'h-full w-full',
  emptyMessage = 'Preview unavailable',
}) {
  const [viewerSrc, setViewerSrc] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const objectUrlRef = useRef('')

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      setLoading(true)
      setLoadError('')
      setViewerSrc('')

      const { direct, fetchPath } = resolveCurriculumPreviewPaths(guide)
      if (!direct && !fetchPath) {
        setLoadError(emptyMessage)
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
        if (!res.ok || contentType.includes('application/json')) {
          throw new Error(emptyMessage)
        }
        const blob = await res.blob()
        if (cancelled) return
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = ''
        }
        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl
        setViewerSrc(objectUrl)
      } catch {
        if (!cancelled) setLoadError(emptyMessage)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = ''
      }
    }
  }, [
    guide?.id,
    guide?.fileUrl,
    guide?.file_url,
    guide?.fileDataUrl,
    guide?.file_data_url,
    emptyMessage,
  ])

  const shellClass = `flex w-full items-center justify-center rounded-lg border bg-neutral-50 text-center text-xs text-neutral-500 ${className}`

  if (loading) {
    return <div className={shellClass}>Loading preview…</div>
  }
  if (loadError || !viewerSrc) {
    return <div className={shellClass}>{emptyMessage}</div>
  }

  return (
    <div className={`w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 ${className}`}>
      <iframe
        title={title}
        src={`${viewerSrc}#toolbar=0&navpanes=0&page=1`}
        className={`pointer-events-none ${frameClassName}`}
      />
    </div>
  )
}
