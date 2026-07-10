function stepStatus(done) {
  return done
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
}

export default function SubjectWorkflowStrip({ subject }) {
  if (!subject) return null

  const hasCurriculum = Boolean(
    String(subject.curriculumGuideId || subject.curriculum_guide_id || '').trim() ||
      String(subject.curriculumGuideTitle || '').trim(),
  )
  const hasSyllabus = Boolean(String(subject.syllabus_url || subject.syllabus_pdf || '').trim())
  const hasSubject = Boolean(String(subject.subject_name || '').trim())

  const steps = [
    { key: 'curriculum', label: 'Curriculum guide', done: hasCurriculum },
    { key: 'syllabus', label: 'School syllabus', done: hasSyllabus },
    { key: 'subject', label: 'Subject classroom', done: hasSubject },
  ]

  return (
    <aside className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Subject workflow</p>
      <p className="mt-1 text-xs text-neutral-500">Curriculum guide → school syllabus → subject classroom</p>
      <ol className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${stepStatus(step.done)}`}
            >
              {step.done ? '✓' : index + 1}
            </span>
            <span className={`text-sm font-medium ${step.done ? 'text-neutral-900' : 'text-neutral-500'}`}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
