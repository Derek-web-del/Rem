import { useEffect, useState } from 'react'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'
import { fetchAuthenticatedMediaUrl, isDirectMediaUrl } from '../lib/authenticatedMedia.js'
import {
  cachePdfOnView,
  downloadCachedPdf,
  getCachedPdfBlob,
  isPdfCached,
  resolvePdfUrl,
} from '../lib/pdfCacheStatus.js'
import { isOnline } from '../lib/offlineSync.js'
import { ACTION_BLUE } from '../pages/teachers/instituteChrome.js'

export function resolvePdfViewerUrl(fileUrl) {
  return resolvePdfUrl(fileUrl) || uploadsPathToApiUrl(fileUrl)
}

/**
 * Full-screen PDF viewer modal (matches Faculty Curriculum layout).
 * @param {{ fileUrl: string, fileName?: string, onClose: () => void, onDownloadUnavailable?: (message: string) => void }} props
 */
export default function PdfViewerModal({ fileUrl, fileName = 'document.pdf', onClose, onDownloadUnavailable }) {
  const [zoom, setZoom] = useState(100)
  const [cached, setCached] = useState(false)
  const [viewerSrc, setViewerSrc] = useState('')
  const [loadError, setLoadError] = useState('')
  const resolvedUrl = resolvePdfViewerUrl(fileUrl)
  const displayName = String(fileName || 'document.pdf').trim() || 'document.pdf'
  const offline = !isOnline()

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function loadViewer() {
      setLoadError('')
      const cachedOk = await isPdfCached(fileUrl)
      if (!cancelled) setCached(cachedOk)

      if (offline) {
        const blob = await getCachedPdfBlob(fileUrl)
        if (cancelled) return
        if (blob) {
          objectUrl = URL.createObjectURL(blob)
          setViewerSrc(objectUrl)
          return
        }
        setViewerSrc('')
        setLoadError('This file is not available offline. Open it once while online, then try again.')
        return
      }

      if (resolvedUrl) {
        try {
          if (isDirectMediaUrl(resolvedUrl)) {
            setViewerSrc(resolvedUrl)
          } else {
            const blobUrl = await fetchAuthenticatedMediaUrl(fileUrl || resolvedUrl)
            if (cancelled) return
            if (blobUrl.startsWith('blob:')) objectUrl = blobUrl
            setViewerSrc(blobUrl)
          }
          const stored = await cachePdfOnView(fileUrl)
          if (!cancelled && stored) setCached(true)
        } catch {
          if (!cancelled) {
            setViewerSrc('')
            setLoadError('Unable to load PDF preview.')
          }
        }
      } else {
        setViewerSrc('')
      }
    }

    void loadViewer()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileUrl, resolvedUrl, offline])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDownload = async () => {
    const result = await downloadCachedPdf(fileUrl, displayName)
    if (result === 'unavailable') {
      onDownloadUnavailable?.(
        offline
          ? 'PDF not cached offline. View this file once while online, then download will work offline.'
          : 'File unavailable for download.',
      )
    }
  }

  const downloadDisabled = offline && !cached

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
      onClick={onClose}
    >
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{displayName}</p>
            <p className="text-xs text-neutral-500">
              {offline ? (cached ? 'PDF viewer (offline — cached)' : 'PDF viewer (offline)') : 'PDF viewer'}
            </p>
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
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleDownload()}
              disabled={downloadDisabled}
              title={downloadDisabled ? 'View once online to cache for offline download' : undefined}
            >
              Download
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: ACTION_BLUE }}
              onClick={onClose}
              aria-label="Close"
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
            {viewerSrc ? (
              <iframe
                title={displayName}
                src={viewerSrc}
                className="h-[75vh] w-full rounded border border-neutral-200 bg-white"
              />
            ) : (
              <p className="py-12 text-center text-sm text-neutral-500">
                {loadError || 'File unavailable.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
