import { curriculumGuideLabel } from './curriculumGuideLabel.js'

/** Read-only module card, styled like TopicGroup, that surfaces the institute curriculum guide
 * linked to this subject as an auto "Course Curriculum Guide" topic — opens CurriculumGuideDetailView. */
export default function CurriculumGuideTopicCard({ subject, onOpen }) {
  if (!subject) return null
  const guideId = String(subject.curriculumGuideId || subject.curriculum_guide_id || '').trim()
  const fileUrl = String(subject.curriculumGuideFileUrl || subject.curriculum_guide_file_url || '').trim()
  if (!guideId && !fileUrl) return null

  const label = curriculumGuideLabel(subject)

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-700">
          <i className="ti ti-books text-sm" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">Course Curriculum Guide</span>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-500 ring-1 ring-inset ring-neutral-200">
          1 item
        </span>
      </div>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
        onClick={onOpen}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
          <i className="ti ti-file-type-pdf text-sm" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">Curriculum Guide</span>
          <span className="mt-0.5 inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
            {label}
          </span>
        </span>
        <i className="ti ti-chevron-right shrink-0 text-neutral-300" aria-hidden="true" />
      </button>
    </div>
  )
}
