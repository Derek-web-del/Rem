import { sanitizeAuditRecord } from './teacherAuditLog.js'

export function assignmentAuditSnapshot(row) {
  if (!row) return null
  const mapped = typeof row === 'object' && row.title != null ? row : null
  const r = mapped || row
  return sanitizeAuditRecord({
    id: r.id,
    title: r.title,
    description: r.description,
    subject_name: r.subject_name,
    grade_level: r.grade_level,
    semester: r.semester,
    total_score: r.total_score,
    submission_deadline: r.submission_deadline,
    status: r.status,
    grade_component_id: r.grade_component_id,
    file_name: r.file_name,
  })
}

export function materialAuditSnapshot(row) {
  if (!row) return null
  return sanitizeAuditRecord({
    id: row.id,
    material_name: row.material_name ?? row.title,
    unit_no: row.unit_no,
    unit_name: row.unit_name,
    semester: row.semester,
    file_name: row.file_name,
    file_type: row.file_type,
    status: row.status,
  })
}

export function announcementAuditSnapshot(row) {
  if (!row) return null
  return sanitizeAuditRecord({
    id: row.id,
    title: row.title,
    type: row.type,
    message: row.message,
    image_name: row.image_name,
  })
}

export function activityAuditSnapshot(row) {
  if (!row) return null
  return sanitizeAuditRecord({
    id: row.id,
    title: row.title,
    description: row.description,
    subject_name: row.subject_name,
    grade_level: row.grade_level,
    semester: row.semester,
    total_score: row.total_score,
    submission_deadline: row.submission_deadline,
    status: row.status,
    grade_component_id: row.grade_component_id,
    file_name: row.file_name,
  })
}

export function quizAuditSnapshot(quiz) {
  if (!quiz) return null
  return sanitizeAuditRecord({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject,
    grade_level: quiz.grade_level,
    semester: quiz.semester,
    duration_mins: quiz.duration_mins,
    deadline: quiz.deadline,
    total_points: quiz.total_points,
    max_attempts: quiz.max_attempts,
    is_hidden: quiz.is_hidden,
    status: quiz.status,
    question_count: (quiz.parts || []).reduce((n, p) => n + (p.questions?.length || 0), 0),
  })
}

export function buildTargetLabel(title, subjectName, suffix = '') {
  const parts = [String(title || '').trim(), String(subjectName || '').trim()].filter(Boolean)
  const base = parts.join(' — ') || 'Record'
  return suffix ? `${base} ${suffix}`.trim() : base
}
