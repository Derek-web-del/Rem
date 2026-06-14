import { AUTH_PROFILE_UPDATE_DISPLAY_TYPE } from './profileAudit.js'

function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function normDate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10)
}

function normId(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? String(n) : normStr(v)
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function dateValuesDiffer(beforeVal, afterVal) {
  return normDate(beforeVal) !== normDate(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal, { redact = false } = {}) {
  if (redact) {
    changedFields[label] = { old: '[redacted]', new: '[changed]' }
    return
  }
  const o = typeof oldVal === 'string' && oldVal.length > 120 ? `${oldVal.slice(0, 80)}…` : oldVal
  const n = typeof newVal === 'string' && newVal.length > 120 ? `${newVal.slice(0, 80)}…` : newVal
  changedFields[label] = { old: o ?? null, new: n ?? null }
}

/**
 * @param {Record<string, unknown>} oldRow
 * @param {Record<string, unknown>} newData
 * @param {{ passwordChanged?: boolean, appPasswordInBody?: boolean, photoChanged?: boolean }} [flags]
 * @returns {Record<string, { old: unknown, new: unknown }>}
 */
export function computeStudentProfileDetailedDiffs(oldRow, newData, flags = {}) {
  if (!oldRow || !newData) return {}
  /** @type {Record<string, { old: unknown, new: unknown }>} */
  const changedFields = {}

  if (valuesDiffer(newData.firstName, oldRow.first_name)) {
    pushDiff(changedFields, 'First name', oldRow.first_name, newData.firstName)
  }
  if (valuesDiffer(newData.middleName, oldRow.middle_name)) {
    pushDiff(changedFields, 'Middle name', oldRow.middle_name, newData.middleName)
  }
  if (valuesDiffer(newData.lastName, oldRow.last_name)) {
    pushDiff(changedFields, 'Last name', oldRow.last_name, newData.lastName)
  }
  if (valuesDiffer(newData.email, oldRow.email)) {
    pushDiff(changedFields, 'Student Email address', oldRow.email, newData.email)
  }
  if (valuesDiffer(newData.phoneNumber, oldRow.contact_no)) {
    pushDiff(changedFields, 'Student Contact Number', oldRow.contact_no, newData.phoneNumber)
  }
  if (valuesDiffer(newData.address, oldRow.address)) {
    pushDiff(changedFields, 'Student Address', oldRow.address, newData.address)
  }
  if (dateValuesDiffer(newData.dateOfBirth, oldRow.dob)) {
    pushDiff(changedFields, 'Date of Birth', normDate(oldRow.dob), normDate(newData.dateOfBirth))
  }
  if (valuesDiffer(newData.parentPhone, oldRow.parent_contact)) {
    pushDiff(changedFields, "Parent's Contact Number", oldRow.parent_contact, newData.parentPhone)
  }
  if (valuesDiffer(newData.parentEmail, oldRow.parent_email)) {
    pushDiff(changedFields, "Parent's Email", oldRow.parent_email, newData.parentEmail)
  }
  if (valuesDiffer(newData.enrollmentNo, oldRow.enrollment_no)) {
    pushDiff(changedFields, 'Student Enrollment No', oldRow.enrollment_no, newData.enrollmentNo)
  }
  if (valuesDiffer(newData.rollNo, oldRow.roll_no)) {
    pushDiff(changedFields, 'Student Roll No', oldRow.roll_no, newData.rollNo)
  }
  if (valuesDiffer(newData.gradeLevel, oldRow.grade_level)) {
    pushDiff(changedFields, 'Student Grade Level', oldRow.grade_level, newData.gradeLevel)
  }
  if (valuesDiffer(newData.semester, oldRow.semester)) {
    pushDiff(changedFields, 'Student Semester', oldRow.semester, newData.semester)
  }

  const oldSecId = normId(oldRow.section_id)
  const newSecId = normId(newData.sectionId)
  const oldSection = normStr(oldRow.section_name) || oldSecId
  const newSection = normStr(newData.section) || newSecId
  if (valuesDiffer(newSecId, oldSecId) || valuesDiffer(newSection, oldSection)) {
    pushDiff(changedFields, 'Student Section', oldSection, newSection)
  }

  if (valuesDiffer(newData.loginId, oldRow.login_id)) {
    pushDiff(changedFields, 'Student Login ID', oldRow.login_id, newData.loginId)
  }

  const photoUrl = normStr(newData.photoUrl)
  const oldPhoto = normStr(oldRow.photo_url)
  if (flags.photoChanged || (photoUrl && photoUrl !== oldPhoto)) {
    pushDiff(changedFields, 'Student Photo', oldPhoto || null, photoUrl || '[updated]')
  }
  if (flags.passwordChanged) {
    pushDiff(changedFields, 'Student Password', null, null, { redact: true })
  }
  if (flags.appPasswordInBody) {
    pushDiff(changedFields, 'Student App Password (Gmail)', null, null, { redact: true })
  }

  return changedFields
}

export function computeStudentProfileUpdatedFields(oldRow, newData, flags = {}) {
  return Object.keys(computeStudentProfileDetailedDiffs(oldRow, newData, flags))
}

export function buildStudentAuditTargetName(row) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name].map((p) => normStr(p)).filter(Boolean)
  return parts.join(' ') || normStr(row?.email) || `Student #${row?.id ?? ''}`
}

export { AUTH_PROFILE_UPDATE_DISPLAY_TYPE }
