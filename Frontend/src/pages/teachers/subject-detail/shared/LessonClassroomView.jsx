import { useState } from 'react'
import { Link } from 'react-router-dom'
import PdfViewerModal from '../../../../components/PdfViewerModal.jsx'
import { cachePdfOnView } from '../../../../lib/pdfCacheStatus.js'
import { resolveTeacherFileUrl } from '../../../../lib/teacherMedia.js'
import { fileNameFromLessonPath, formatLessonPostDate } from './lessonDisplayUtils.js'
import { sanitizeHtml } from '../../../../lib/sanitizeHtml.js'

export default function LessonClassroomView({
  lesson,
  authorName = '',
  subjectId,
  role = 'teacher',
  onBack,
}) {
  const [pdfOpen, setPdfOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  if (!lesson) return null

  const fileUrl = lesson.file_path ? resolveTeacherFileUrl(lesson.file_path) : ''
  const fileName = fileNameFromLessonPath(lesson.file_path) || lesson.title
  const postDate = formatLessonPostDate(lesson.created_at)
  const authorLine = [authorName, postDate].filter(Boolean).join(' • ')
  const editPath =
    role === 'teacher' && subjectId
      ? `/teacher/subjects/${encodeURIComponent(subjectId)}/lessons/${encodeURIComponent(lesson.id)}/edit`
      : null

  return (
    <div className="px-4 py-4">
      <button
        type="button"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-[#185FA5] hover:underline"
        onClick={onBack}
      >
        <i className="ti ti-arrow-left text-sm" aria-hidden="true" />
        Back to modules
      </button>

      <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-500">
            <i className="ti ti-bookmark text-lg" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-normal text-neutral-900">{lesson.title}</h2>
            {authorLine ? <p className="mt-0.5 text-sm text-neutral-500">{authorLine}</p> : null}
          </div>
        </div>
        {editPath ? (
          <div className="relative shrink-0">
            <button
              type="button"
              className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
              aria-label="Lesson options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <i className="ti ti-dots-vertical text-lg" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                  <Link
                    to={editPath}
                    className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Edit
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {(fileUrl || lesson.link_url) ? (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">Read</p>
          {fileUrl ? (
            <button
              type="button"
              className="mt-2 flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
              onClick={() => {
                if (lesson.file_path) void cachePdfOnView(lesson.file_path)
                setPdfOpen(true)
              }}
            >
              <div className="min-w-0 pr-4">
                <div className="truncate text-sm text-[#185FA5] underline">{fileName}</div>
                <div className="mt-0.5 text-xs text-neutral-500">PDF</div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border-l border-neutral-100 pl-3">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-red-600 text-[10px] font-bold text-white">
                  PDF
                </span>
              </div>
            </button>
          ) : null}
          {lesson.link_url ? (
            <a
              href={lesson.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-[#185FA5] hover:underline"
            >
              <i className="ti ti-external-link" aria-hidden="true" />
              Open link
            </a>
          ) : null}
        </div>
      ) : null}

      {lesson.description ? (
        <div
          className="prose prose-sm mt-5 max-w-none text-neutral-700"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.description || '') }}
        />
      ) : null}

      {pdfOpen && fileUrl ? (
        <PdfViewerModal fileUrl={lesson.file_path || fileUrl} fileName={fileName} onClose={() => setPdfOpen(false)} />
      ) : null}
    </div>
  )
}
