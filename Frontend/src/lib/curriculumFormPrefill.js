import { fetchTeacherSubject, moveCurriculumItem } from './teacherSubjectCurriculum.js'

export function readCurriculumQuery(searchParams) {
  return {
    subjectId: String(searchParams.get('subject_id') || searchParams.get('subjectId') || '').trim(),
    moduleId: String(searchParams.get('module_id') || searchParams.get('moduleId') || '').trim(),
    topicId: String(searchParams.get('topic_id') || searchParams.get('topicId') || '').trim(),
  }
}

export async function prefillSubjectFromQuery(subjectId, patchForm) {
  if (!subjectId) return null
  const sub = await fetchTeacherSubject(subjectId)
  patchForm({
    subject_name: String(sub.subject_name || '').trim(),
    grade_level: String(sub.grade_level || '').trim(),
    subject: String(sub.subject_name || '').trim(),
  })
  return sub
}

export async function linkCreatedItemToCurriculum({ itemType, itemId, moduleId, topicId, subjectId }) {
  if (!itemId || (!moduleId && !topicId && !subjectId)) return
  await moveCurriculumItem({
    item_type: itemType,
    item_id: itemId,
    module_id: moduleId || null,
    topic_id: topicId || null,
    subject_id: subjectId || null,
  })
}

export function curriculumReturnPath(subjectId, fallback = '/teacher/subjects') {
  return subjectId ? `/teacher/subjects/${encodeURIComponent(subjectId)}` : fallback
}
