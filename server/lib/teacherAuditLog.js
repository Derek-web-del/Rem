import { insertAuditLogRecord } from './auditLogsLedger.js'
import { facultyDisplayName } from './facultySession.js'

const SENSITIVE_KEYS = new Set([
  'password',
  'quiz_password',
  'quiz_password_plain',
  'password_hash',
  'announcement_image',
  'file_data',
  'file_content',
  'content_base64',
  'data_url',
  'avatar_data_url',
])

const BLOB_PREFIXES = ['data:image/', 'data:application/']

function isBlobValue(v) {
  if (typeof v !== 'string') return false
  const s = v.trim()
  if (s.length > 500) return true
  return BLOB_PREFIXES.some((p) => s.startsWith(p))
}

function sanitizeValue(key, value) {
  const k = String(key || '').toLowerCase()
  if (SENSITIVE_KEYS.has(k)) return '[redacted]'
  if (isBlobValue(value)) return '[file omitted]'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeValue(`${k}[${i}]`, item))
  }
  if (value && typeof value === 'object') {
    return sanitizeAuditRecord(value)
  }
  return value
}

/** Strip passwords, file blobs, and large base64 from audit snapshots. */
export function sanitizeAuditRecord(record, fields = null) {
  if (record == null) return null
  if (typeof record !== 'object' || Array.isArray(record)) {
    return sanitizeValue('', record)
  }
  const out = {}
  const keys = fields ? fields.map(String) : Object.keys(record)
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    out[key] = sanitizeValue(key, record[key])
  }
  return out
}

function valuesEqual(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return String(a) === String(b)
}

/**
 * Compare old vs new record; return only changed fields.
 * @param {Record<string, unknown>|null} oldRecord
 * @param {Record<string, unknown>|null} newRecord
 * @param {string[]|null} [fieldList]
 */
export function diffRecords(oldRecord, newRecord, fieldList = null) {
  const oldSan = sanitizeAuditRecord(oldRecord || {})
  const newSan = sanitizeAuditRecord(newRecord || {})
  const keys = fieldList?.length
    ? fieldList.map(String)
    : [...new Set([...Object.keys(oldSan || {}), ...Object.keys(newSan || {})])]
  const old_values = {}
  const new_values = {}
  const changed_fields = []
  for (const key of keys) {
    const ov = oldSan?.[key]
    const nv = newSan?.[key]
    if (!valuesEqual(ov, nv)) {
      changed_fields.push(key)
      if (ov !== undefined) old_values[key] = ov
      if (nv !== undefined) new_values[key] = nv
    }
  }
  return { old_values, new_values, changed_fields }
}

function flattenQuizQuestions(quiz) {
  const out = []
  const parts = quiz?.parts || quiz?.quiz_parts || []
  for (const part of parts) {
    for (const q of part?.questions || []) {
      const id = q?.id != null ? String(q.id) : null
      const key = id || `tmp:${String(q?.question_text || '').slice(0, 40)}:${q?.order_index ?? ''}`
      out.push({
        key,
        id,
        question_text: q?.question_text ?? '',
        question_type: q?.question_type ?? '',
        points: q?.points ?? null,
        order_index: q?.order_index ?? null,
      })
    }
  }
  return out
}

/**
 * Detect quiz question add/edit/delete from before/after quiz payloads.
 * @returns {Array<{ event_type: string, old_values: object, new_values: object, changed_fields: string[], target_label: string }>}
 */
export function diffQuizQuestions(oldQuiz, newQuiz) {
  const before = new Map(flattenQuizQuestions(oldQuiz).map((q) => [q.key, q]))
  const after = new Map(flattenQuizQuestions(newQuiz).map((q) => [q.key, q]))
  const events = []
  const quizTitle = String(newQuiz?.title || oldQuiz?.title || 'Quiz').trim()

  for (const [key, q] of after) {
    if (!before.has(key)) {
      events.push({
        event_type: 'quiz_question_added',
        old_values: {},
        new_values: sanitizeAuditRecord(q, ['question_text', 'question_type', 'points', 'order_index']),
        changed_fields: ['question_text'],
        target_label: `${quizTitle} — new question`,
        target_id: q.id,
      })
    }
  }
  for (const [key, q] of before) {
    if (!after.has(key)) {
      events.push({
        event_type: 'quiz_question_deleted',
        old_values: sanitizeAuditRecord(q, ['question_text', 'question_type', 'points', 'order_index']),
        new_values: {},
        changed_fields: ['question_text'],
        target_label: `${quizTitle} — removed question`,
        target_id: q.id,
      })
    }
  }
  for (const [key, oldQ] of before) {
    const newQ = after.get(key)
    if (!newQ) continue
    const { old_values, new_values, changed_fields } = diffRecords(oldQ, newQ, [
      'question_text',
      'question_type',
      'points',
      'order_index',
    ])
    if (changed_fields.length) {
      events.push({
        event_type: 'quiz_question_edited',
        old_values,
        new_values,
        changed_fields,
        target_label: `${quizTitle} — ${String(newQ.question_text || 'question').slice(0, 60)}`,
        target_id: newQ.id || oldQ.id,
      })
    }
  }
  return events
}

export function readUserAgent(req) {
  return String(req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || '').trim().slice(0, 512) || null
}

/**
 * @param {import('express').Request} req
 * @param {{
 *   event_type: string,
 *   module: string,
 *   action: string,
 *   performed_by?: string,
 *   performed_by_name?: string,
 *   target_id?: string|number|null,
 *   target_label?: string,
 *   old_values?: object|null,
 *   new_values?: object|null,
 *   changed_fields?: string[],
 *   user?: object,
 *   facultyRow?: object,
 *   summary?: string,
 * }} entry
 */
export async function logTeacherAuditEvent(req, entry) {
  try {
    const user = entry.user || null
    const facultyRow = entry.facultyRow || null
    const performed_by = String(entry.performed_by || user?.id || '').trim()
    const performed_by_name =
      String(entry.performed_by_name || '').trim() ||
      (facultyRow ? facultyDisplayName(facultyRow) : '') ||
      String(user?.name || '').trim() ||
      String(user?.email || '').trim()
    const event_type = String(entry.event_type || '').trim()
    const module = String(entry.module || '').trim()
    const action = String(entry.action || '').trim()
    const target_id = entry.target_id != null && String(entry.target_id).trim() !== '' ? String(entry.target_id) : null
    const target_label = String(entry.target_label || '').trim() || null
    const old_values = entry.old_values && Object.keys(entry.old_values).length ? entry.old_values : null
    const new_values = entry.new_values && Object.keys(entry.new_values).length ? entry.new_values : null
    const changed_fields = Array.isArray(entry.changed_fields) ? entry.changed_fields : []
    const user_agent = readUserAgent(req)
    const summary =
      String(entry.summary || '').trim() ||
      buildSummary({ module, action, target_label, changed_fields })

    const payload = {
      event_type,
      module,
      action,
      performed_by,
      performed_by_name,
      target_id,
      target_label,
      old_values,
      new_values,
      changed_fields,
      user_agent,
      summary,
      userId: performed_by,
      userName: performed_by_name,
      role: 'teacher',
      description: summary,
      ...(entry.detailedDiffs && typeof entry.detailedDiffs === 'object'
        ? { detailedDiffs: entry.detailedDiffs }
        : {}),
    }

    await insertAuditLogRecord(event_type.toUpperCase(), payload, {
      event_type,
      module,
      action,
      performed_by,
      performed_by_name,
      target_id,
      target_label,
      old_values,
      new_values,
      changed_fields,
      user_agent,
    })
  } catch (err) {
    console.warn('[teacherAudit] log failed:', err?.message || err)
  }
}

function buildSummary({ module, action, target_label, changed_fields }) {
  const parts = [action, module].filter(Boolean)
  if (target_label) parts.push(target_label)
  if (changed_fields?.length) parts.push(`(${changed_fields.join(', ')})`)
  return parts.join(' — ')
}

export const TEACHER_AUDIT_MODULES = {
  ASSIGNMENTS: 'Assignments',
  ACTIVITIES: 'Activities',
  QUIZZES: 'Quiz Maker',
  STUDY_MATERIALS: 'Study Materials',
  GRADES: 'Grades',
  ANNOUNCEMENTS: 'Announcements',
  SUBJECT_MODULES: 'Subjects',
  PLAGIARISM: 'AI-Checker',
}

export const TEACHER_AUDIT_ACTIONS = {
  CREATE: 'Create',
  EDIT: 'Edit',
  DELETE: 'Delete',
  PUBLISH: 'Publish',
  UNPUBLISH: 'Unpublish',
  GRADE: 'Grade',
}
