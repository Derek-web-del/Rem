import {
  deleteAnnouncementFileByUrl,
  saveAnnouncementImageFromDataUrl,
} from './announcementImageStorage.js'

export const FACULTY_ANNOUNCEMENT_TYPES = ['Institute', 'Campus', 'Department', 'General']
export const MAX_ANNOUNCEMENT_IMAGE_CHARS = 2_000_000

export async function ensureAnnouncementsMetadataColumns(pool) {
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_path VARCHAR(512)`)
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_name VARCHAR(255)`)
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255)`)
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`)
}

function normalizeText(raw, maxChars, label) {
  const s = String(raw ?? '').trim()
  if (s.length > maxChars) {
    console.warn(`[announcements] ${label} truncated (${s.length} chars > ${maxChars})`)
    return s.slice(0, maxChars)
  }
  return s
}

export function readAnnouncementBodyFields(body) {
  const b = body || {}
  const title = normalizeText(b.title, 255, 'title')
  const type = normalizeText(b.type ?? b.updateType, 50, 'type')
  const message = normalizeText(b.message ?? b.description, 50_000, 'message')
  const rawImage =
    b.announcement_image ?? b.announcementImage ?? b.imageDataUrl ?? b.image_data_url ?? ''
  const announcement_image = normalizeText(rawImage, MAX_ANNOUNCEMENT_IMAGE_CHARS, 'announcement_image')
  const image_name = normalizeText(b.image_name ?? b.imageName, 255, 'image_name')
  return { title, type, message, announcement_image, image_name }
}

export function announcementRowToResponse(row) {
  if (!row) return null
  const created = row.created_at
  const updated = row.updated_at ?? created
  const imagePath = String(row.image_path ?? '').trim()
  const imageDataUrl = String(row.announcement_image ?? row.imageDataUrl ?? '').trim()
  const imageSrc = imagePath || imageDataUrl
  return {
    id: row.id != null ? Number(row.id) : row.id,
    title: row.title,
    type: row.type,
    updateType: row.type,
    message: row.message,
    description: row.message,
    announcement_image: imageDataUrl,
    imageDataUrl,
    image_path: imagePath,
    imagePath,
    image_name: row.image_name ?? '',
    imageName: row.image_name ?? '',
    imageSrc,
    uploaded_by: row.uploaded_by ?? '',
    uploadedBy: row.uploaded_by ?? '',
    created_at: created,
    createdAt: created,
    updated_at: updated,
    updatedAt: updated,
    postedAt: created,
  }
}

export async function resolveAnnouncementImageForSave({
  announcement_image,
  image_name,
  title,
  existingPath,
  existingDataUrl,
}) {
  const dataUrl = String(announcement_image || '').trim()
  const existingPathStr = String(existingPath || '').trim()
  const existingData = String(existingDataUrl || '').trim()

  if (!dataUrl) {
    return {
      announcement_image: '',
      image_path: '',
      image_name: '',
      deleteOldPath: existingPathStr,
    }
  }

  if (dataUrl.startsWith('data:')) {
    if (existingData && dataUrl === existingData && existingPathStr) {
      return {
        announcement_image: dataUrl,
        image_path: existingPathStr,
        image_name: String(image_name || '').trim(),
        deleteOldPath: '',
      }
    }
    const saved = await saveAnnouncementImageFromDataUrl(dataUrl, image_name || title || 'announcement')
    if (saved) {
      return {
        announcement_image: dataUrl,
        image_path: saved.file_url,
        image_name: saved.file_name,
        deleteOldPath:
          existingPathStr && existingPathStr !== saved.file_url ? existingPathStr : '',
      }
    }
  }

  const pathFromUrl = dataUrl.includes('/uploads/announcements/')
    ? dataUrl.slice(dataUrl.indexOf('/uploads/announcements/'))
    : dataUrl.startsWith('/uploads/announcements/')
      ? dataUrl
      : existingPathStr

  if (pathFromUrl.startsWith('/uploads/announcements/')) {
    return {
      announcement_image: existingData || '',
      image_path: pathFromUrl,
      image_name: String(image_name || '').trim(),
      deleteOldPath: '',
    }
  }

  return {
    announcement_image: dataUrl,
    image_path: existingPathStr,
    image_name: String(image_name || '').trim(),
    deleteOldPath: '',
  }
}

export async function maybeDeleteOldAnnouncementFile(oldPath, newPath) {
  const oldP = String(oldPath || '').trim()
  const newP = String(newPath || '').trim()
  if (oldP && oldP.startsWith('/uploads/announcements/') && oldP !== newP) {
    await deleteAnnouncementFileByUrl(oldP)
  }
}

export function resolveSessionUploadedByLabel(session, fallback = 'Institute') {
  const user =
    session?.user ??
    session?.data?.user ??
    session?.session?.user ??
    session?.data?.session?.user ??
    {}
  const name = String(user.name || '').trim()
  if (name) return name
  const email = String(user.email || '').trim()
  if (email) return email
  return fallback
}
