import { Link } from 'react-router-dom'
import CurriculumPdfPreview from '../../../components/CurriculumPdfPreview.jsx'

function curriculumGuideLabel(subject) {
  const grade = String(subject?.curriculumGuideGrade ?? '').trim()
  const title = String(subject?.curriculumGuideTitle ?? subject?.curriculumGuideLabel ?? '').trim()
  if (grade && title) return `${grade} — ${title}`
  if (title) return title
  if (grade) return grade
  return 'Linked institute guide'
}

export default function SubjectCurriculumGuideCard({ subject }) {
  if (!subject) return null

  const guideId = String(subject.curriculumGuideId || subject.curriculum_guide_id || '').trim()
  const label = curriculumGuideLabel(subject)
  const fileUrl = String(subject.curriculumGuideFileUrl || subject.curriculum_guide_file_url || '').trim()
  const fileName = String(subject.curriculumGuideFileName || '').trim() || 'curriculum-guide.pdf'
  const guide = {
    id: guideId || subject.id,
    file_url: fileUrl,
    file_name: fileName,
    title: label,
  }

  if (!guideId && !label) {
    return (
      <aside className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Curriculum guide (DepEd)</p>
        <p className="mt-2 text-sm text-neutral-600">
          No institute curriculum guide is linked to this subject yet. Ask your admin to link one when creating the
          subject.
        </p>
        <Link to="/teacher/curriculum" className="mt-3 inline-block text-sm font-semibold text-sky-800 hover:underline">
          Browse curriculum library
        </Link>
      </aside>
    )
  }

  return (
    <aside className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Curriculum guide (DepEd)</p>
          <p className="mt-1 text-sm font-medium text-neutral-900">{label}</p>
          <p className="mt-1 text-xs text-neutral-500">Official institute reference used to build this subject syllabus</p>
        </div>
        <Link
          to="/teacher/curriculum"
          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
        >
          Open library
        </Link>
      </div>

      {fileUrl ? (
        <div className="mt-3">
          <CurriculumPdfPreview
            guide={guide}
            title={fileName}
            className="h-44"
            emptyMessage="Preview unavailable"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-xs text-neutral-500">
          Curriculum PDF is linked but not available for preview.
        </p>
      )}
    </aside>
  )
}
