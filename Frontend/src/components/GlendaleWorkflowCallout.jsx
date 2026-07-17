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
