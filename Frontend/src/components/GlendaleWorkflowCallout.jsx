/** Glendale LMS setup order — shown on Curriculum admin pages for panel defense. */
export default function GlendaleWorkflowCallout({ compact = false }) {
  const steps = [
    'Upload official DepEd MATATAG curriculum PDF (institute reference library).',
    'Create Subject — link curriculum guide, class schedule, faculty, and Glendale syllabus PDF.',
    'Faculty publishes modules, quizzes, and study materials aligned to the syllabus.',
  ]

  if (compact) {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-950">
        <p className="font-semibold">Glendale setup order</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-900">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 md:p-5">
      <h4 className="text-sm font-bold text-blue-950">Glendale LMS workflow</h4>
      <p className="mt-1 text-xs text-blue-800">
        Curriculum guides are official DepEd references — not AI-generated templates. Subject syllabi and faculty
        materials are built from these guides.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-blue-900">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  )
}

/** Warn when a multi-grade DepEd filename is tagged with a single JHS grade. */
export function curriculumGradeFilenameHint(fileName, selectedGrade) {
  const name = String(fileName || '').toLowerCase()
  const grade = String(selectedGrade || '').trim()
  if (!name || !grade) return ''
  const multiGrade = /\bgrade[_\s-]*(\d+)[_\s-]*(\d+)/i.test(name) || /grades?[_\s-]*\d+[_\s-]*\d+/i.test(name)
  if (!multiGrade) return ''
  if (/\d+-\d+/.test(name) || /grade[_\s]*\d+[_\s-]*10/i.test(name)) {
    return `This file appears to cover multiple grades. Select the JHS grade you use (${grade}) and note the full DepEd span in Description (e.g. "MATATAG English Grades 2–10; used for ${grade}").`
  }
  return ''
}
