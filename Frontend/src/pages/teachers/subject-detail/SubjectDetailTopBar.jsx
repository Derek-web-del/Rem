export default function SubjectDetailTopBar({ subject }) {
  const name = String(subject?.subject_name || 'Subject').trim()
  const code = String(subject?.subject_code || '').trim()
  const grade = String(subject?.grade_level || '').trim()
  const teacher = String(subject?.faculty_name || subject?.assignedFacultyName || '').trim()

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
      <div className="text-sm font-semibold text-neutral-900">{code ? `${code} — ${name}` : name}</div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {[grade, teacher ? `Teacher: ${teacher}` : ''].filter(Boolean).join(' · ')}
      </div>
    </div>
  )
}
