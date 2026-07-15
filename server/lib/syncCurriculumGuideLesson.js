import {
  createSubjectLesson,
  deleteSubjectLesson,
  ensureSubjectCurriculumSchema,
  updateSubjectLesson,
} from './subjectCurriculumDb.js'

export const CURRICULUM_GUIDE_LESSON_MARKER_PREFIX = '__curriculum_guide:'

export function curriculumGuideLessonMarker(guideId) {
  return `${CURRICULUM_GUIDE_LESSON_MARKER_PREFIX}${String(guideId || '').trim()}__`
}

export function isCurriculumGuideLessonMarker(description) {
  return String(description || '').trim().startsWith(CURRICULUM_GUIDE_LESSON_MARKER_PREFIX)
}

async function findSyncedLesson(pool, subjectId, guideId) {
  const marker = curriculumGuideLessonMarker(guideId)
  const { rows } = await pool.query(
    `
      SELECT id
      FROM subject_modules
      WHERE subject_id = $1
        AND trim(coalesce(description, '')) = $2
      LIMIT 1
    `,
    [Number(subjectId), marker],
  )
  return rows?.[0]?.id ?? null
}

async function fetchPublishedGuide(pool, guideId) {
  const { rows } = await pool.query(
    `
      SELECT id, title, subject, grade, grade_level, file_url, file_data_url, file_name, is_published, description
      FROM curriculum_guides
      WHERE id = $1
      LIMIT 1
    `,
    [String(guideId).trim()],
  )
  return rows?.[0] ?? null
}

function guideFilePath(guide) {
  const fileUrl = String(guide?.file_url ?? '').trim()
  const fileData = String(guide?.file_data_url ?? '').trim()
  const path = fileUrl || fileData
  if (!path || path.startsWith('data:')) return ''
  return path
}

function guideTitle(guide) {
  return (
    String(guide?.title ?? '').trim() ||
    String(guide?.subject ?? '').trim() ||
    String(guide?.file_name ?? '').trim() ||
    'Curriculum'
  )
}

/** Create or update an unassigned module lesson from a published curriculum guide linked to a subject. */
export async function syncCurriculumGuideLessonForSubject(pool, subjectId, guideId) {
  await ensureSubjectCurriculumSchema(pool)
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return null

  const gid = guideId ? String(guideId).trim() : ''
  const { rows: staleRows } = await pool.query(
    `
      SELECT id, description
      FROM subject_modules
      WHERE subject_id = $1
        AND trim(coalesce(description, '')) LIKE $2
    `,
    [sid, `${CURRICULUM_GUIDE_LESSON_MARKER_PREFIX}%`],
  )
  const currentMarker = gid ? curriculumGuideLessonMarker(gid) : ''
  for (const row of staleRows || []) {
    if (String(row.description || '').trim() !== currentMarker) {
      await deleteSubjectLesson(pool, sid, row.id)
    }
  }

  const existingId = gid ? await findSyncedLesson(pool, sid, gid) : null

  if (!gid) {
    if (existingId) await deleteSubjectLesson(pool, sid, existingId)
    return null
  }

  const guide = await fetchPublishedGuide(pool, gid)
  if (!guide || guide.is_published !== true) {
    if (existingId) await deleteSubjectLesson(pool, sid, existingId)
    return null
  }

  const filePath = guideFilePath(guide)
  if (!filePath) {
    if (existingId) await deleteSubjectLesson(pool, sid, existingId)
    return null
  }

  const payload = {
    title: guideTitle(guide),
    file_path: filePath,
    description: curriculumGuideLessonMarker(gid),
    topic_id: null,
  }

  if (existingId) {
    return updateSubjectLesson(pool, sid, existingId, payload)
  }

  return createSubjectLesson(pool, sid, null, payload)
}

export async function syncCurriculumGuideLessonForAllSubjects(pool, guideId) {
  const gid = String(guideId || '').trim()
  if (!gid) return
  const { rows } = await pool.query(
    `SELECT id FROM subjects WHERE curriculum_guide_id::text = $1`,
    [gid],
  )
  for (const row of rows || []) {
    await syncCurriculumGuideLessonForSubject(pool, row.id, gid)
  }
}
