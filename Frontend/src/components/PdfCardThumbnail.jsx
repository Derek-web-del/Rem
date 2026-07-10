import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fetchAuthenticatedMediaUrl, isDirectMediaUrl, requiresAuthenticatedFetch } from '../lib/authenticatedMedia.js'
import { resolvePdfUrl } from '../lib/pdfCacheStatus.js'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * Renders the first PDF page as a card thumbnail (fit-to-width, no iframe scrollbars).
 */
export default function PdfCardThumbnail({
  filePath,
  fileUrl,
  title = 'PDF preview',
  className = 'h-44',
  emptyMessage = 'Preview unavailable',
}) {
  const canvasRef = useRef(null)
  const shellRef = useRef(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function load() {
      setStatus('loading')

      const path = String(filePath || fileUrl || '').trim()
      if (!path) {
        setStatus('error')
        return
      }

      try {
        let pdfUrl = ''
        if (requiresAuthenticatedFetch(path)) {
          pdfUrl = await fetchAuthenticatedMediaUrl(path)
          if (pdfUrl.startsWith('blob:')) objectUrl = pdfUrl
        } else {
          const direct =
            (path && (isDirectMediaUrl(path) ? path : resolvePdfUrl(path) || uploadsPathToApiUrl(path))) ||
            String(fileUrl || '').trim()
          if (!direct) {
            setStatus('error')
            return
          }
          pdfUrl = direct
          if (!isDirectMediaUrl(direct)) {
            pdfUrl = await fetchAuthenticatedMediaUrl(path || direct)
            if (pdfUrl.startsWith('blob:')) objectUrl = pdfUrl
          }
        }

        const task = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: !pdfUrl.startsWith('blob:') })
        const pdf = await task.promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        if (cancelled) return

        const canvas = canvasRef.current
        const shell = shellRef.current
        if (!canvas || !shell) {
          setStatus('error')
          return
        }

        const baseViewport = page.getViewport({ scale: 1 })
        const shellWidth = shell.clientWidth || baseViewport.width
        const shellHeight = shell.clientHeight || 176
        const scale = Math.min(shellWidth / baseViewport.width, shellHeight / baseViewport.height)
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')

        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: context, viewport }).promise

        if (!cancelled) setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filePath, fileUrl])

  const shellClass = `relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-white ${className}`

  if (status === 'error') {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-100 text-xs text-neutral-500 ${className}`}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div ref={shellRef} className={shellClass} aria-label={title}>
      {status === 'loading' ? (
        <div className="flex h-full items-center justify-center text-xs text-neutral-500">Loading preview…</div>
      ) : null}
      <canvas
        ref={canvasRef}
        className={`block w-full ${status === 'ready' ? 'h-auto max-h-full object-contain object-top' : 'hidden'}`}
      />
    </div>
  )
}
