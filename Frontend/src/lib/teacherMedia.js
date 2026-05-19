import { apiUrl } from './lmsStateStorage.js'

export function resolveTeacherFileUrl(fileUrl) {
  const t = String(fileUrl || '').trim()
  if (!t) return ''
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/api/')) return apiUrl(t)
  if (t.startsWith('/uploads/')) return apiUrl(t)
  return t
}

export function formatCreatedTagYmd(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}${m[2]}${m[3]}`
  return ''
}

export function detectMaterialKind(material) {
  const ft = String(material?.file_type || '').toLowerCase()
  const url = String(material?.file_url || '').toLowerCase()
  const name = String(material?.material_name || material?.unit_name || '').toLowerCase()
  const ext = (url.split('.').pop() || name.split('.').pop() || '').split('?')[0]
  if (ft.includes('pdf') || ext === 'pdf') return 'pdf'
  if (['mp4', 'avi', 'mov', 'webm', 'mkv'].includes(ext) || ft.includes('video')) return 'video'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || ft.includes('image')) return 'image'
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'office'
  return 'other'
}
