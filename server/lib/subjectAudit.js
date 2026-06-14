function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal) {
  const o = typeof oldVal === 'string' && oldVal.length > 120 ? `${oldVal.slice(0, 80)}…` : oldVal
  const n = typeof newVal === 'string' && newVal.length > 120 ? `${newVal.slice(0, 80)}…` : newVal
  changedFields[label] = { old: o ?? null, new: n ?? null }
}

function syllabusFileLabel(row) {
  const raw = normStr(row?.syllabus_pdf ?? row?.syllabusPdf ?? row?.syllabusDataUrl)
  if (!raw) return ''
  if (raw.startsWith('data:')) return '(PDF syllabus)'
  if (raw.length > 80) return `${raw.slice(0, 60)}…`
  return raw
}

function facultyDisplay(row, facultyName) {
  const name = normStr(facultyName ?? row?.faculty_name ?? row?.assignedFacultyName)
  if (name) return name
  const id = normStr(row?.faculty_id ?? row?.assignedFacultyId)
  return id || ''
}

export function subjectPgRowSnapshot(row, facultyName) {
  if (!row || typeof row !== 'object') return null
  const id = row.id != null ? String(row.id) : ''
  const subjectCode = normStr(row.subject_code ?? row.subjectCode)
  const subjectName = normStr(row.subject_name ?? row.subjectName)
  if (!id && !subjectCode && !subjectName) return null
  return {
    id,
    subjectCode,
    subjectName,
    gradeLevel: normStr(row.grade_level ?? row.grade ?? row.gradeLevel),
    semester: normStr(row.semester),
    facultyName: facultyDisplay(row, facultyName),
    facultyId: normStr(row.faculty_id ?? row.assignedFacultyId),
    syllabusLabel: syllabusFileLabel(row),
  }
}

export function computeSubjectDetailedDiffs(oldRow, newRow, opts = {}) {
  const oldSnap = subjectPgRowSnapshot(oldRow, opts.oldFacultyName)
  const newSnap = subjectPgRowSnapshot(newRow, opts.newFacultyName)
  if (!oldSnap || !newSnap) return {}

  const changedFields = {}

  if (valuesDiffer(oldSnap.subjectCode, newSnap.subjectCode)) {
    pushDiff(changedFields, 'Subject code', oldSnap.subjectCode, newSnap.subjectCode)
  }
  if (valuesDiffer(oldSnap.subjectName, newSnap.subjectName)) {
    pushDiff(changedFields, 'Subject name', oldSnap.subjectName, newSnap.subjectName)
  }
  if (valuesDiffer(oldSnap.gradeLevel, newSnap.gradeLevel)) {
    pushDiff(changedFields, 'Grade level', oldSnap.gradeLevel, newSnap.gradeLevel)
  }
  if (valuesDiffer(oldSnap.semester, newSnap.semester)) {
    pushDiff(changedFields, 'Semester', oldSnap.semester, newSnap.semester)
  }
  if (valuesDiffer(oldSnap.facultyName, newSnap.facultyName)) {
    pushDiff(changedFields, 'Assigned faculty', oldSnap.facultyName || '(none)', newSnap.facultyName || '(none)')
  }

  const oldSyllabus = normStr(oldRow?.syllabus_pdf ?? oldRow?.syllabusPdf)
  const newSyllabus = normStr(newRow?.syllabus_pdf ?? newRow?.syllabusPdf)
  if (oldSyllabus !== newSyllabus && (oldSyllabus || newSyllabus)) {
    pushDiff(
      changedFields,
      'Syllabus file',
      oldSnap.syllabusLabel || '(previous file)',
      newSnap.syllabusLabel || '(replaced file)',
    )
  }

  return changedFields
}

export function subjectAuditDescription(action, snapshot) {
  const name = normStr(snapshot?.subjectName) || normStr(snapshot?.subjectCode) || 'Untitled'
  const grade = normStr(snapshot?.gradeLevel)
  const gradePart = grade ? ` (${grade})` : ''
  if (action === 'created') return `Subject created: ${name}${gradePart}`
  if (action === 'updated') return `Subject updated: ${name}${gradePart}`
  if (action === 'deleted') return `Subject deleted: ${name}${gradePart}`
  return `Subject ${action}: ${name}${gradePart}`
}

export function subjectAuditDetails(snapshot, extra = {}) {
  return {
    recordId: normStr(snapshot?.id),
    subjectCode: normStr(snapshot?.subjectCode),
    subjectName: normStr(snapshot?.subjectName),
    gradeLevel: normStr(snapshot?.gradeLevel),
    semester: normStr(snapshot?.semester),
    facultyName: normStr(snapshot?.facultyName),
    ...extra,
  }
}
