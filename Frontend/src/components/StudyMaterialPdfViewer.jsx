import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { resolveStudyMaterialFileUrl } from '../lib/facultyStudyMaterials.js'
import { ACTION_BLUE } from '../pages/teachers/instituteChrome.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

function formatUploadDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10) || '—'
  return d.toISOString().slice(0, 10)
}

export default function StudyMaterialPdfViewer({ material, onClose }) {
  const canvasRef = useRef(null)
  const [zoom, setZoom] = useState(100)
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [renderError, setRenderError] = useState('')
  const pdfDocRef = useRef(null)

  const fileUrl = resolveStudyMaterialFileUrl(material?.file_url)
  const fileName = material?.file_name || material?.title || 'document.pdf'

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    pdfDocRef.current = null
    setLoading(true)
    setRenderError('')
    setPage(1)
    setNumPages(0)

    if (!fileUrl) {
      setLoading(false)
      setRenderError('File unavailable.')
      return undefined
    }

    ;(async () => {
      try {
        const task = pdfjsLib.getDocument({ url: fileUrl, withCredentials: true })
        const pdf = await task.promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setNumPages(pdf.numPages)
      } catch (e) {
        if (!cancelled) {
          console.error('[StudyMaterialPdfViewer] load error', e)
          setRenderError('Unable to load PDF preview.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      pdfDocRef.current = null
    }
  }, [fileUrl])

  useEffect(() => {
    const pdf = pdfDocRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || loading || renderError) return

    let cancelled = false
    ;(async () => {
      try {
        const pdfPage = await pdf.getPage(page)
        if (cancelled) return
        const scale = zoom / 100
        const viewport = pdfPage.getViewport({ scale })
        const context = canvas.getContext('2d')
        canvas.height = viewport.height
        canvas.width = viewport.width
        await pdfPage.render({ canvasContext: context, viewport }).promise
      } catch (e) {
        if (!cancelled) {
          console.error('[StudyMaterialPdfViewer] render error', e)
          setRenderError('Unable to render PDF page.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, zoom, loading, renderError, numPages])

  function handleDownload() {
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
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-xs font-medium text-neutral-600">{zoom}%</span>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white disabled:opacity-40"
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
              aria-label="Close viewer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
          <p>
            Uploaded: {formatUploadDate(material?.created_at)}
            {material?.uploaded_by_name ? ` · By: ${material.uploaded_by_name}` : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-neutral-200 bg-white px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <span className="min-w-[4.5rem] text-center font-medium">
              {numPages > 0 ? `${page} of ${numPages}` : '—'}
            </span>
            <button
              type="button"
              className="rounded border border-neutral-200 bg-white px-2 py-1 font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              disabled={page >= numPages || loading || numPages === 0}
              onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            >
              ›
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-neutral-500">Loading PDF…</p>
          ) : renderError ? (
            <p className="py-12 text-center text-sm text-red-600">{renderError}</p>
          ) : (
            <div className="mx-auto flex justify-center">
              <canvas ref={canvasRef} className="rounded border border-neutral-200 bg-white shadow-sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function StudyMaterialPdfThumb({ fileUrl, title, className = '' }) {
  const src = resolveStudyMaterialFileUrl(fileUrl)
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
      title={title || 'PDF preview'}
      src={`${src}#toolbar=0&navpanes=0&page=1`}
      className={`w-full rounded-lg border border-neutral-200 bg-white pointer-events-none ${className}`}
    />
  )
}
