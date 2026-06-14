import { useEffect } from 'react'
import PdfViewerModal from '../../../../components/PdfViewerModal.jsx'
import { sanitizeHtml } from '../../../../lib/sanitizeHtml.js'

export default function LessonViewerModal({ lesson, fileUrl, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!lesson) return null

  if (fileUrl) {
    return (
      <div className="relative">
        <PdfViewerModal fileUrl={fileUrl} fileName={lesson.title} onClose={onClose} />
        {lesson.description ? (
          <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[60] max-h-32 overflow-auto bg-white/95 px-6 py-3 text-sm text-neutral-700 shadow-lg">
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.description || '') }} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="presentation">
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-900">{lesson.title}</h2>
          <button type="button" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={onClose} aria-label="Close">
            <i className="ti ti-x text-lg" aria-hidden="true" />
          </button>
        </div>
        {lesson.description ? (
          <div className="prose prose-sm mt-4 max-w-none text-neutral-700" dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.description || '') }} />
        ) : (
          <p className="mt-4 text-sm text-neutral-500">No description.</p>
        )}
        {lesson.link_url ? (
          <a
            href={lesson.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#185FA5] hover:underline"
          >
            <i className="ti ti-external-link" aria-hidden="true" />
            Open link
          </a>
        ) : null}
      </div>
    </div>
  )
}
