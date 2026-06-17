import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  PHOTO_MAX_BYTES,
  PHOTO_MAX_MSG,
} from './uploadLimitsConfig.js'
import { uploadsRoot } from './uploadPaths.js'

export const ANNOUNCEMENT_UPLOAD_REL = '/uploads/announcements'
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg'])
const MAX_BYTES = PHOTO_MAX_BYTES

export function getAnnouncementsUploadDir() {
  return path.join(uploadsRoot(), 'announcements')
}

function ensureUploadDir() {
  const dir = getAnnouncementsUploadDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeStem(raw) {
  return String(raw || 'announcement')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'announcement'
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return '.png'
  return '.jpg'
}

export function validateAnnouncementImageBuffer(buffer, mimeType) {
  if (!buffer?.length) return 'Image is required.'
  if (buffer.length > MAX_BYTES) return PHOTO_MAX_MSG
  const mime = String(mimeType || '').toLowerCase()
  if (!ALLOWED_MIME.has(mime)) return 'Only PNG and JPG images are allowed.'
  return ''
}

export function saveAnnouncementImageBuffer(buffer, originalName, mimeType) {
  const err = validateAnnouncementImageBuffer(buffer, mimeType)
  if (err) throw new Error(err)
  const dir = ensureUploadDir()
  const ext =
    path.extname(String(originalName || '')).toLowerCase() === '.png' ? '.png' : extFromMime(mimeType)
  const stem = safeStem(path.basename(String(originalName || ''), ext))
  const token = crypto.randomBytes(4).toString('hex')
  const fileName = `${stem}-${token}${ext}`
  const abs = path.join(dir, fileName)
  fs.writeFileSync(abs, buffer)
  return {
    file_url: `${ANNOUNCEMENT_UPLOAD_REL}/${fileName}`,
    file_name: String(originalName || fileName).trim() || fileName,
  }
}

export function saveAnnouncementImageFromDataUrl(dataUrl, baseName = 'announcement') {
  const raw = String(dataUrl || '').trim()
  if (!raw.startsWith('data:')) return null
  const match = /^data:([^;]+);base64,(.+)$/i.exec(raw)
  if (!match) return null
  const mime = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  return saveAnnouncementImageBuffer(buffer, baseName, mime)
}

export function deleteAnnouncementFileByUrl(publicPath) {
  const rel = String(publicPath || '').replace(/^\/uploads\/announcements\//, '')
  if (!rel || rel.includes('..')) return
  const abs = path.join(getAnnouncementsUploadDir(), rel)
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch {
    /* ignore */
  }
}
