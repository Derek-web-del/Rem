import { normalizeGradingCriteria } from './curriculumGuidesDb.js'
import { replaceSubjectGradeComponents } from './subjectGradeCriteriaDb.js'

const COLOR_PALETTE = ['#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444', '#14B8A6', '#EC4899', '#6366F1']

function componentsFromCriteria(criteria) {
  return criteria.map((c, i) => {
    const isQuiz = /\bquiz(zes)?\b/i.test(c.name)
    return {
      name: c.name,
      percentage: c.percentage,
      color: COLOR_PALETTE[i % COLOR_PALETTE.length],
      maps_to_assignment: !isQuiz,
      maps_to_activity: !isQuiz,
      is_quiz: isQuiz,
    }
  })
}

/**
 * Push a published curriculum guide's custom grading criteria down to one subject
 * that's linked to it, so the subject has a single, unified set of criteria instead
 * of the guide's copy and the subject's own copy silently disagreeing.
 *
 * Best-effort: if the subject already has graded work (assignments/activities/quizzes)
 * tied to its current components, replaceSubjectGradeComponents() refuses to delete
 * those in-use rows — that's treated as "leave this subject's criteria as-is" rather
 * than a hard failure, since forcing the replace would orphan real grades.
 */
export async function syncCurriculumGuideGradingCriteriaForSubject(pool, subjectId, guideId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return { ok: false, reason: 'invalid_subject' }

  const gid = guideId ? String(guideId).trim() : ''
  if (!gid) return { ok: false, reason: 'no_guide' }

  const { rows } = await pool.query(
    `SELECT grading_criteria, is_published FROM curriculum_guides WHERE id = $1 LIMIT 1`,
    [gid],
  )
  const guide = rows?.[0]
  if (!guide || guide.is_published !== true) return { ok: false, reason: 'not_published' }

  const criteria = normalizeGradingCriteria(guide.grading_criteria)
  if (!criteria.length) return { ok: false, reason: 'no_criteria' }

  const total = criteria.reduce((s, c) => s + c.percentage, 0)
  if (total !== 100) return { ok: false, reason: 'invalid_total' }

  const result = await replaceSubjectGradeComponents(pool, sid, {
    components: componentsFromCriteria(criteria),
  })
  if (!result.ok) {
    console.warn(
      `[syncCurriculumGuideGradingCriteria] Subject ${sid} kept its own criteria — guide ${gid}'s couldn't be applied: ${result.message}`,
    )
    return { ok: false, reason: 'in_use', message: result.message }
  }
  return { ok: true }
}

export async function syncCurriculumGuideGradingCriteriaForAllSubjects(pool, guideId) {
  const gid = String(guideId || '').trim()
  if (!gid) return
  const { rows } = await pool.query(
    `SELECT id FROM subjects WHERE curriculum_guide_id::text = $1`,
    [gid],
  )
  for (const row of rows || []) {
    await syncCurriculumGuideGradingCriteriaForSubject(pool, row.id, gid)
  }
}
