import { normalizeGradeLevel } from './assignmentsDb.js'
import { itemKey } from './gradebookCalc.js'

export async function fetchSubjectGradeItems(pool, subjectId, subjectRow = null) {
  const sid = Number(subjectId)
  const items = []
  const subjectName = String(subjectRow?.subject_name || '').trim()
  const gradeNorm = normalizeGradeLevel(subjectRow?.grade_level)

  const { rows: assignments } = await pool.query(
    `
    SELECT a.id, a.title, COALESCE(a.total_score, 100) AS max_points, a.grade_component_id,
           a.submission_deadline AS deadline, a.created_at, a.module_order
    FROM assignments a
    WHERE a.subject_id = $1
      AND lower(coalesce(a.status, 'published')) = 'published'
    ORDER BY a.module_order ASC NULLS LAST, a.created_at ASC, a.id ASC
    `,
    [sid],
  )
  for (const r of assignments || []) {
    items.push({
      id: Number(r.id),
      type: 'assignment',
      title: String(r.title || '').trim() || 'Untitled assignment',
      max_points: Number(r.max_points) || 100,
      grade_component_id: r.grade_component_id != null ? Number(r.grade_component_id) : null,
      deadline: r.deadline ?? null,
    })
  }

  const { rows: activities } = await pool.query(
    `
    SELECT a.id, a.title, COALESCE(a.total_score, 100) AS max_points, a.grade_component_id,
           a.submission_deadline AS deadline, a.created_at, a.module_order
    FROM activities a
    WHERE a.subject_id = $1
      AND lower(coalesce(a.status, 'published')) = 'published'
    ORDER BY a.module_order ASC NULLS LAST, a.created_at ASC, a.id ASC
    `,
    [sid],
  )
  for (const r of activities || []) {
    items.push({
      id: Number(r.id),
      type: 'activity',
      title: String(r.title || '').trim() || 'Untitled activity',
      max_points: Number(r.max_points) || 100,
      grade_component_id: r.grade_component_id != null ? Number(r.grade_component_id) : null,
      deadline: r.deadline ?? null,
    })
  }

  const { rows: quizzes } = await pool.query(
    `
    SELECT q.id, q.title, COALESCE(q.total_points, 0) AS max_points, q.grade_component_id,
           q.deadline, q.created_at, q.module_order
    FROM quizzes q
    WHERE (
        q.subject_id = $1
        OR (
          q.subject_id IS NULL
          AND lower(trim(coalesce(q.subject, ''))) = lower(trim($2))
          AND lower(trim(replace(coalesce(q.grade_level, ''), '  ', ' '))) = $3
        )
      )
      AND lower(coalesce(q.status, 'published')) = 'published'
      AND coalesce(q.is_hidden, false) = false
    ORDER BY q.module_order ASC NULLS LAST, q.created_at ASC, q.id ASC
    `,
    [sid, subjectName, gradeNorm || ''],
  )
  for (const r of quizzes || []) {
    items.push({
      id: Number(r.id),
      type: 'quiz',
      title: String(r.title || '').trim() || 'Untitled quiz',
      max_points: Number(r.max_points) || 0,
      grade_component_id: r.grade_component_id != null ? Number(r.grade_component_id) : null,
      deadline: r.deadline ?? null,
    })
  }

  return items
}

export async function fetchStudentScoresForItems(pool, studentId, items) {
  const sid = Number(studentId)
  const scores = {}
  if (!Number.isFinite(sid) || sid <= 0 || !items.length) return scores

  const assignmentIds = items.filter((i) => i.type === 'assignment').map((i) => i.id)
  const activityIds = items.filter((i) => i.type === 'activity').map((i) => i.id)
  const quizIds = items.filter((i) => i.type === 'quiz').map((i) => i.id)

  if (assignmentIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.assignment_id AS entity_id, s.id AS submission_id, s.score, s.submitted_at, s.updated_at,
             s.late_submission_until
      FROM assignment_submissions s
      WHERE s.assignment_id = ANY($1::bigint[]) AND s.student_id = $2
      `,
      [assignmentIds, sid],
    )
    for (const r of rows || []) {
      const item = items.find((i) => i.type === 'assignment' && i.id === Number(r.entity_id))
      const key = itemKey('assignment', r.entity_id)
      scores[key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: item?.max_points ?? 100,
        submitted_at: r.submitted_at ?? r.updated_at ?? null,
        late_submission_until: r.late_submission_until ?? null,
        has_score: r.score != null,
      }
    }
  }

  if (activityIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.activity_id AS entity_id, s.id AS submission_id, s.score, s.submitted_at, s.updated_at,
             s.late_submission_until
      FROM activity_submissions s
      WHERE s.activity_id = ANY($1::bigint[]) AND s.student_id = $2
      `,
      [activityIds, sid],
    )
    for (const r of rows || []) {
      const item = items.find((i) => i.type === 'activity' && i.id === Number(r.entity_id))
      const key = itemKey('activity', r.entity_id)
      scores[key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: item?.max_points ?? 100,
        submitted_at: r.submitted_at ?? r.updated_at ?? null,
        late_submission_until: r.late_submission_until ?? null,
        has_score: r.score != null,
      }
    }
  }

  if (quizIds.length) {
    const { rows } = await pool.query(
      `
      SELECT s.quiz_id AS entity_id, s.id AS submission_id, s.score, s.total_points,
             s.submitted_at, s.updated_at, s.late_submission_until
      FROM quiz_submissions s
      WHERE s.quiz_id = ANY($1::bigint[]) AND s.student_id = $2
      `,
      [quizIds, sid],
    )
    for (const r of rows || []) {
      const item = items.find((i) => i.type === 'quiz' && i.id === Number(r.entity_id))
      const maxPts = r.total_points != null ? Number(r.total_points) : item?.max_points ?? 0
      const key = itemKey('quiz', r.entity_id)
      scores[key] = {
        score: r.score != null ? Number(r.score) : 0,
        submission_id: r.submission_id != null ? Number(r.submission_id) : null,
        max_points: maxPts,
        submitted_at: r.submitted_at ?? r.updated_at ?? null,
        late_submission_until: r.late_submission_until ?? null,
        has_score: r.score != null,
      }
    }
  }

  for (const item of items) {
    const key = itemKey(item.type, item.id)
    if (!scores[key]) {
      scores[key] = {
        score: 0,
        submission_id: null,
        max_points: item.max_points,
        submitted_at: null,
        has_score: false,
      }
    }
  }

  return scores
}
