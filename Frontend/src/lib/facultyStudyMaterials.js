import { apiUrl } from './lmsStateStorage.js'

export function resolveStudyMaterialFileUrl(filePath) {
  const path = String(filePath ?? '').trim()
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return apiUrl(path.startsWith('/') ? path : `/${path}`)
}

export function mapStudyMaterialRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    title: String(row.title ?? '').trim(),
    grade_level: String(row.grade_level ?? '').trim(),
    subject: String(row.subject ?? '').trim(),
    file_name: String(row.file_name ?? '').trim(),
    file_url: String(row.file_url ?? '').trim(),
    file_type: 'PDF',
    file_size: row.file_size != null ? Number(row.file_size) : null,
    file_size_label: String(row.file_size_label ?? '').trim(),
    uploaded_by: String(row.uploaded_by ?? '').trim(),
    uploaded_by_name: String(row.uploaded_by_name ?? '').trim(),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

export async function fetchFacultyStudyMaterials() {
  const res = await fetch(apiUrl('/api/v1/study-materials'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load study materials (${res.status}).`))
  }
  const list = Array.isArray(data.materials)
    ? data.materials
    : Array.isArray(data.data)
      ? data.data
      : []
  return list.map(mapStudyMaterialRow).filter(Boolean)
}

export async function fetchFacultyStudyMaterial(id) {
  const res = await fetch(apiUrl(`/api/v1/study-materials/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load study material (${res.status}).`))
  }
  return mapStudyMaterialRow(data.material)
}

export async function createFacultyStudyMaterial(formData) {
  const res = await fetch(apiUrl('/api/v1/study-materials'), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to add study material.'))
  }
  return mapStudyMaterialRow(data.material)
}

export async function updateFacultyStudyMaterial(id, formData) {
  const res = await fetch(apiUrl(`/api/v1/study-materials/${encodeURIComponent(String(id))}`), {
    method: 'PUT',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update study material.'))
  }
  return mapStudyMaterialRow(data.material)
}

export async function deleteFacultyStudyMaterial(id) {
  const res = await fetch(apiUrl(`/api/v1/study-materials/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to delete study material.'))
  }
}

export function formatMaterialUploadDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10) || '—'
  return d.toISOString().slice(0, 10)
}

export function formatGradeTag(gradeLevel) {
  const g = String(gradeLevel || '').trim()
  if (!g) return '—'
  return g.toUpperCase()
}

export function formatSubjectTag(subject) {
  const s = String(subject || '').trim()
  if (!s) return '—'
  return s.toUpperCase()
}

export function formatMaterialSizeLabel(material) {
  if (material?.file_size_label) return material.file_size_label
  const n = Number(material?.file_size)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
