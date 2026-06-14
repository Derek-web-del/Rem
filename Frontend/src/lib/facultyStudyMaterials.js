import apiFetch from './apiClient.js'
import { getListSnapshot, saveListSnapshot, saveToStore, getFromStore } from './indexedDB.js'
import { isOnline } from './offlineSync.js'
import { uploadsPathToApiUrl } from './fileUrls.js'
import { apiUrl } from './lmsStateStorage.js'

async function materialsApiJson(path, options = {}) {
  const res = await apiFetch(apiUrl(path), options)
  const data = await res.json().catch(() => ({}))
  return data
}

export function resolveStudyMaterialFileUrl(filePath) {
  return uploadsPathToApiUrl(filePath)
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
  try {
    if (!isOnline()) throw new Error('offline')
    const data = await materialsApiJson('/api/v1/study-materials')
    const list = Array.isArray(data.materials)
      ? data.materials
      : Array.isArray(data.data)
        ? data.data
        : []
    const materials = list.map(mapStudyMaterialRow).filter(Boolean)
    await saveListSnapshot('study_materials', materials, 'faculty_list')
    return materials
  } catch (e) {
    const cached = await getListSnapshot('study_materials', 'faculty_list')
    if (cached.length > 0) return cached
    throw e
  }
}

export async function fetchFacultyStudyMaterial(id) {
  const mid = String(id ?? '')
  try {
    if (!isOnline()) throw new Error('offline')
    const data = await materialsApiJson(`/api/v1/study-materials/${encodeURIComponent(mid)}`)
    const material = mapStudyMaterialRow(data.material)
    await saveToStore('study_materials', { id: mid, ...material })
    return material
  } catch (e) {
    const cached = await getFromStore('study_materials', mid)
    if (cached?.id) {
      const { cachedAt: _c, ...material } = cached
      return material
    }
    throw e
  }
}

export async function createFacultyStudyMaterial(formData) {
  const data = await materialsApiJson('/api/v1/study-materials', { method: 'POST', body: formData })
  return mapStudyMaterialRow(data.material)
}

export async function updateFacultyStudyMaterial(id, formData) {
  const data = await materialsApiJson(`/api/v1/study-materials/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: formData,
  })
  return mapStudyMaterialRow(data.material)
}

export async function deleteFacultyStudyMaterial(id) {
  await materialsApiJson(`/api/v1/study-materials/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
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
