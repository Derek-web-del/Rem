import { normalizeGradeLevel, resolveStudentGradeLevel } from './studentSession.js'
import { computePercent } from './gradesDb.js'

function gradeToneFromScore(score, total) {
  const percent = computePercent(score, total)
  if (percent == null) return 'neutral'
  if (percent >= 75) return 'passed'
  if (percent >= 60) return 'at_risk'
  return 'failed'
}

function resolveWorkStatusLabelAndTone(sub, total) {
  const status = String(sub.status ?? 'not_submitted').trim().toLowerCase()
  const score = sub.score != null ? Number(sub.score) : null
  const submittedAt = sub.submitted_at ?? null
  const hasFile = Boolean(String(sub.file_path ?? '').trim())

  if (status === 'expired') {
    return { statusLabel: `Score: 0/${total}`, statusTone: 'failed' }
  }
  if (status === 'not_submitted' && !hasFile && !submittedAt) {
    return { statusLabel: 'Not Submitted', statusTone: 'neutral' }
  }
  if (score != null && Number.isFinite(score) && status !== 'expired') {
    return {
      statusLabel: `Score: ${score}/${total}`,
      statusTone: gradeToneFromScore(score, total),
    }
  }
  if (status === 'submitted' || submittedAt || hasFile) {
    return { statusLabel: 'Pending', statusTone: 'pending' }
  }
  return { statusLabel: 'Not Submitted', statusTone: 'neutral' }
}

export function isSubmissionOpen(deadlineIso) {
  if (!deadlineIso) return true
  const d = new Date(deadlineIso)
  if (Number.isNaN(d.getTime())) return true
  return d.getTime() >= Date.now()
}

export function isDeadlinePassed(deadlineIso) {
  return !isSubmissionOpen(deadlineIso)
}

export function isSubmissionOpenForStudent(deadlineIso, lateUntilIso) {
  if (lateUntilIso) {
    const late = new Date(lateUntilIso)
    if (!Number.isNaN(late.getTime()) && late.getTime() >= Date.now()) return true
  }
  return isSubmissionOpen(deadlineIso)
}

export function isWorkLockedForStudent(deadlineIso, lateUntilIso, { submittedAt } = {}) {
  if (!isDeadlinePassed(deadlineIso)) return false
  if (lateUntilIso) {
    const late = new Date(lateUntilIso)
    if (!Number.isNaN(late.getTime()) && late.getTime() >= Date.now()) return false
  }
  if (submittedAt && lateUntilIso) {
    const submitted = new Date(submittedAt)
    const late = new Date(lateUntilIso)
    if (
      !Number.isNaN(submitted.getTime()) &&
      !Number.isNaN(late.getTime()) &&
      submitted.getTime() <= late.getTime()
    ) {
      return false
    }
  }
  return true
}

function normalizeIso(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function mapStudentWorkListRow(row, submission, kind = 'assignment') {
  const total = row.total_score != null ? Number(row.total_score) : 100
  const sub = submission || {}
  const status = String(sub.status ?? 'not_submitted').trim().toLowerCase()
  const score = sub.score != null ? Number(sub.score) : null
  const submittedAt = sub.submitted_at ?? null
  const hasFile = Boolean(String(sub.file_path ?? '').trim())
  const deadline = row.submission_deadline ?? null
  const lateUntil = normalizeIso(sub.late_submission_until)
  const open = isSubmissionOpenForStudent(deadline, lateUntil)
  const globalOpen = isSubmissionOpen(deadline)

  const { statusLabel, statusTone } = resolveWorkStatusLabelAndTone(sub, total)

  const subjectCode = String(row.subject_code ?? row.subject_name ?? '').trim()
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim(),
    subject: subjectCode,
    subject_name: String(row.subject_name ?? '').trim(),
    subject_code: subjectCode,
    grade_level: String(row.grade_level ?? '').trim(),
    description: String(row.description ?? '').trim(),
    upload_date: row.created_at ?? null,
    created_at: row.created_at ?? null,
    submission_deadline: deadline,
    deadline,
    total_score: total,
    file_path: String(row.file_path ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    submission_id: sub.id != null ? String(sub.id) : '',
    submission_status: status,
    submitted_at: submittedAt,
    submission_file_path: String(sub.file_path ?? '').trim(),
    submission_file_name: String(sub.file_name ?? '').trim(),
    score,
    feedback: String(sub.feedback ?? '').trim(),
    status: statusLabel,
    status_tone: statusTone,
    submission_open: open,
    can_submit: open,
    late_submission_until: lateUntil,
    has_late_extension: Boolean(lateUntil && new Date(lateUntil).getTime() >= Date.now()),
    submission_badge: open ? (globalOpen ? 'Open' : 'Late') : 'Closed',
    submission_badge_tone: open ? (globalOpen ? 'green' : 'yellow') : 'red',
    has_submission_file: hasFile,
    kind,
  }
}

export async function assertStudentWorkAccess(pool, studentRow, table, idCol, itemId) {
  const sid = Number(itemId)
  if (!Number.isFinite(sid) || sid <= 0) return null
  const grade = await resolveStudentGradeLevel(pool, studentRow)
  if (!grade) return null

  const subjectJoin =
    table === 'assignments'
      ? `LEFT JOIN subjects sub ON sub.id = a.subject_id`
      : `LEFT JOIN subjects sub ON sub.id = a.subject_id`

  const selectSubject = `COALESCE(NULLIF(trim(sub.subject_code), ''), NULLIF(trim(a.subject_name), '')) AS subject_code`

  const { rows } = await pool.query(
    `
      SELECT a.*, ${selectSubject}, sub.subject_name AS joined_subject_name
      FROM ${table} a
      ${subjectJoin}
      WHERE a.id = $1
        AND lower(trim(replace(coalesce(a.grade_level, ''), '  ', ' '))) = $2
      LIMIT 1
    `,
    [sid, grade],
  )
  const row = rows?.[0]
  if (!row) return null
  if (!row.subject_name && row.joined_subject_name) {
    row.subject_name = row.joined_subject_name
  }
  return row
}

export async function fetchStudentWorkSubmission(pool, submissionTable, fkCol, itemId, studentId) {
  const { rows } = await pool.query(
    `
      SELECT * FROM ${submissionTable}
      WHERE ${fkCol} = $1 AND student_id = $2
      LIMIT 1
    `,
    [itemId, studentId],
  )
  return rows?.[0] ?? null
}
