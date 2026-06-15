/** Map admin curriculum guide API row into dashboard curriculum item shape. */
export function mapCurriculumGuideToDashboard(row, resolveUrl = (p) => p) {
  if (!row || typeof row !== 'object') return null
  const filePath = String(row.file_url ?? row.file_data_url ?? '').trim()
  const fileDataUrl = filePath ? resolveUrl(filePath) : String(row.fileDataUrl ?? '').trim()
  const created = row.created_at ?? row.uploadedAt ?? null
  const uploadedAt =
    created != null
      ? typeof created === 'string'
        ? created.slice(0, 10)
        : new Date(created).toISOString().slice(0, 10)
      : ''
  return normalizeCurriculumItem(
    {
      id: String(row.id ?? ''),
      grade: row.grade_level ?? row.grade,
      subject: row.subject ?? row.title,
      description: row.description ?? '',
      fileName: row.file_name ?? row.fileName,
      fileType: row.file_type ?? row.fileType ?? 'application/pdf',
      fileDataUrl,
      fileUrl: filePath,
      isPublished: row.is_published === true,
      uploadedAt,
      uploadedBy: row.uploaded_by_name ?? row.uploadedBy ?? 'Administrator',
      source: row.source ?? 'admin_upload',
    },
    0,
  )
}

export function mapCurriculumGuideList(rows, resolveUrl) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => mapCurriculumGuideToDashboard(row, resolveUrl)).filter(Boolean)
}

/** Repair curriculum rows from server JSON or localStorage (snake_case, missing fields, literal "null"). */
export function normalizeCurriculumList(list) {
  if (!Array.isArray(list)) return []
  return list.map((raw, index) => normalizeCurriculumItem(raw, index)).filter(Boolean)
}

export function normalizeCurriculumItem(raw, index) {
  if (!raw || typeof raw !== 'object') return null
  const nz = (v) => {
    if (v == null) return ''
    const s = String(v).trim()
    if (!s || s === 'null' || s === 'undefined') return ''
    return s
  }
  const id = nz(raw.id) || nz(raw.source_id) || `legacy-${index}`
  const grade = nz(raw.grade) || nz(raw.grade_level)
  const subject = nz(raw.subject) || nz(raw.title)
  const fileName = nz(raw.fileName) || nz(raw.file_name)
  return {
    ...raw,
    id,
    grade: grade || '',
    subject: subject || '(no subject)',
    description: nz(raw.description),
    fileName,
  }
}
