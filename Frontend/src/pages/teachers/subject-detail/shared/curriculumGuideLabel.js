export function curriculumGuideLabel(subject) {
  const grade = String(subject?.curriculumGuideGrade ?? '').trim()
  const title = String(subject?.curriculumGuideTitle ?? subject?.curriculumGuideLabel ?? '').trim()
  if (grade && title) return `${grade} — ${title}`
  if (title) return title
  if (grade) return grade
  return 'Linked institute guide'
}
