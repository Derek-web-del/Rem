import { useEffect, useState } from 'react'
import { fetchAuthenticatedMediaUrl } from '../lib/authenticatedMedia.js'

export default function CurriculumPdfModal({ guide, onClose }) {
  const [zoom, setZoom] = useState(100)
  const [viewerSrc, setViewerSrc] = useState('')
  const [loadError, setLoadError] = useState('')
  const filePath = String(guide?.file_url || '').trim()
  const fileName = guide?.file_name || guide?.title || 'curriculum.pdf'

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function load() {
      setLoadError('')
      setViewerSrc('')
      if (!filePath) {
        setLoadError('File unavailable.')
        return
      }
      try {
        const url = await fetchAuthenticatedMediaUrl(filePath)
        if (cancelled) return
        if (url.startsWith('blob:')) objectUrl = url
        setViewerSrc(url)
      } catch {
        if (!cancelled) setLoadError('File unavailable.')
      }
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filePath])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
            <p className="text-xs text-neutral-500">Curriculum PDF viewer</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
              <button
                type="button"
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-xs font-medium text-neutral-600">{zoom}%</span>
              <button
                type="button"
                className="rounded px-2 py-0.5 text-sm font-semibold text-neutral-700 hover:bg-white"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="rounded-lg bg-neutral-200 px-3 py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-300"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-4">
          {loadError ? (
            <p className="text-center text-sm text-red-600">{loadError}</p>
          ) : viewerSrc ? (
            <iframe
              title={fileName}
              src={viewerSrc}
              className="mx-auto block rounded border border-neutral-200 bg-white shadow-sm"
              style={{
                width: `${zoom}%`,
                minWidth: '280px',
                height: 'calc(92vh - 120px)',
              }}
            />
          ) : (
            <p className="text-center text-sm text-neutral-500">Loading PDF…</p>
          )}
        </div>
      </div>
    </div>
  )
}
