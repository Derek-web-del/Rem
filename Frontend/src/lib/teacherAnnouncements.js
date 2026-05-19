import { apiUrl } from './lmsStateStorage.js'

export const ANNOUNCEMENT_TYPES = ['Institute', 'Campus', 'Department', 'General']

export function mapAnnouncementRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = row.id != null ? String(row.id) : ''
  const postedAt = row.postedAt ?? row.created_at ?? row.createdAt ?? ''
  return {
    id,
    title: String(row.title ?? '').trim(),
    updateType: String(row.updateType ?? row.type ?? '').trim(),
    description: String(row.description ?? row.message ?? '').trim(),
    imageDataUrl: String(row.imageDataUrl ?? row.announcement_image ?? '').trim(),
    imagePath: String(row.imagePath ?? row.image_path ?? '').trim(),
    imageName: String(row.imageName ?? row.image_name ?? '').trim(),
    uploadedBy: String(row.uploadedBy ?? row.uploaded_by ?? 'Institute').trim() || 'Institute',
    postedAt: postedAt ? String(postedAt) : '',
  }
}

export function resolveAnnouncementImageSrc(item) {
  if (!item) return ''
  const path = String(item.imagePath ?? item.image_path ?? '').trim()
  if (path && !path.startsWith('data:')) {
    return path.startsWith('http') ? path : apiUrl(path.startsWith('/') ? path : `/${path}`)
  }
  const dataUrl = String(item.imageDataUrl ?? item.announcement_image ?? item.imageSrc ?? '').trim()
  return dataUrl
}

export function formatDatePosted(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function safeDownloadName(baseName, ext) {
  const safe =
    String(baseName || 'announcement')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'announcement'
  return `${safe}.${ext}`
}

export async function downloadAnnouncementImage(item, onStart) {
  const src = resolveAnnouncementImageSrc(item)
  if (!src) return false

  onStart?.()

  const path = String(item?.imagePath ?? item?.image_path ?? '').trim()
  const fileName = String(item?.imageName ?? item?.image_name ?? item?.title ?? 'announcement').trim()

  if (path && !path.startsWith('data:')) {
    const url = src
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return false
    const blob = await res.blob()
    const ext = path.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = safeDownloadName(fileName.replace(/\.(png|jpe?g)$/i, ''), ext)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
    return true
  }

  if (src.startsWith('data:')) {
    const mime = src.split(';')[0]?.replace('data:', '') || 'image/jpeg'
    const ext = mime.includes('png') ? 'png' : 'jpg'
    const a = document.createElement('a')
    a.href = src
    a.download = safeDownloadName(item?.title, ext)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return true
  }

  return false
}

export async function fetchTeacherAnnouncements() {
  const res = await fetch(apiUrl('/api/teacher/announcements'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load announcements (${res.status}).`))
  }
  const list = Array.isArray(data.announcements) ? data.announcements : []
  return list.map(mapAnnouncementRow).filter(Boolean)
}

export async function fetchTeacherAnnouncement(id) {
  const res = await fetch(apiUrl(`/api/teacher/announcements/${encodeURIComponent(String(id))}`), {
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Failed to load announcement (${res.status}).`))
  }
  return mapAnnouncementRow(data.announcement)
}

export async function createTeacherAnnouncement(payload) {
  const res = await fetch(apiUrl('/api/teacher/announcements'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      updateType: payload.updateType,
      type: payload.updateType,
      description: payload.description,
      message: payload.description,
      imageDataUrl: payload.imageDataUrl || '',
      imageName: payload.imageName || '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to add announcement.'))
  }
  return mapAnnouncementRow(data.announcement)
}

export async function updateTeacherAnnouncement(id, payload) {
  const res = await fetch(apiUrl(`/api/teacher/announcements/${encodeURIComponent(String(id))}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      updateType: payload.updateType,
      type: payload.updateType,
      description: payload.description,
      message: payload.description,
      imageDataUrl: payload.imageDataUrl || '',
      imageName: payload.imageName || '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || 'Failed to update announcement.'))
  }
  return mapAnnouncementRow(data.announcement)
}
