import { useEffect, useState } from 'react'
import { fetchAuthenticatedMediaUrl, isDirectMediaUrl } from '../lib/authenticatedMedia.js'
import { resolvePdfUrl } from '../lib/pdfCacheStatus.js'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'

/**
 * PDF iframe preview for authenticated file paths (fetch + blob URL).
 */
export default function AuthenticatedPdfFrame({
  filePath,
  fileUrl,
  title = 'PDF preview',
  className = '',
  emptyClassName = 'flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-100 text-xs text-neutral-500',
  emptyMessage = 'No preview',
}) {
  const [viewerSrc, setViewerSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function load() {
      setFailed(false)
      setViewerSrc('')

      const path = String(filePath || fileUrl || '').trim()
      const direct =
        (path && (isDirectMediaUrl(path) ? path : resolvePdfUrl(path) || uploadsPathToApiUrl(path))) ||
        String(fileUrl || '').trim()

      if (!direct) {
        setFailed(true)
        return
      }

      if (isDirectMediaUrl(direct)) {
        setViewerSrc(direct)
        return
      }

      try {
        const url = await fetchAuthenticatedMediaUrl(path || direct)
        if (cancelled) return
        if (url.startsWith('blob:')) objectUrl = url
        setViewerSrc(`${url}#toolbar=0&navpanes=0&page=1`)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filePath, fileUrl])

  if (!viewerSrc || failed) {
    return <div className={emptyClassName}>{emptyMessage}</div>
  }

  return (
    <iframe
      title={title}
      src={viewerSrc}
      className={`pointer-events-none ${className}`}
    />
  )
}
