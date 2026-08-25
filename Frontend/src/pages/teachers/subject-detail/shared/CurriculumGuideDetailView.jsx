import { useState } from 'react'
import { Link } from 'react-router-dom'
import { curriculumGuideLabel } from './curriculumGuideLabel.js'
import { InlinePdfPreview } from './curriculumGuidePreview.jsx'
import { resolvePdfUrl } from '../../../../lib/pdfCacheStatus.js'

/** Detail page for the auto-generated "Course Curriculum Guide" module item — the Canvas/
 * Instructure-style expanded view of the institute PDF that the admin linked to this subject. */
export default function CurriculumGuideDetailView({ subject, libraryPath = '', onBack }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!subject) return null

  const guideId = String(subject.curriculumGuideId || subject.curriculum_guide_id || '').trim()
  const label = curriculumGuideLabel(subject)
  const fileUrl = String(subject.curriculumGuideFileUrl || subject.curriculum_guide_file_url || '').trim()
  const fileName = String(subject.curriculumGuideFileName || '').trim() || 'curriculum-guide.pdf'
  const guide = { id: guideId || subject.id, file_url: fileUrl, file_name: fileName, title: label }

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

      <div className="flex items-start gap-3 border-b border-neutral-200 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 text-neutral-500">
          <i className="ti ti-file-type-pdf text-lg" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-normal text-neutral-900">Curriculum Guide</h2>
          <p className="mt-0.5 text-sm text-neutral-500">{label} — Official institute reference used to build this subject syllabus</p>
        </div>
      </div>

      {fileUrl ? (
        <div className="mt-4">
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
        <p className="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
          Curriculum PDF is linked but not available for preview.
        </p>
      )}
    </div>
  )
}
