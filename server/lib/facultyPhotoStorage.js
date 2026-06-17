import fs from 'node:fs'
import path from 'node:path'
import { PHOTO_MAX_BYTES, PHOTO_MAX_MSG } from './uploadLimitsConfig.js'
import { resolvePublicUploadPath, uploadsRoot } from './uploadPaths.js'

export const FACULTY_UPLOAD_REL = '/uploads/faculties'
export const FACULTY_PHOTO_MAX_BYTES = PHOTO_MAX_BYTES

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg'])
const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
}

export function getFacultyUploadDir() {
  return path.join(uploadsRoot(), 'faculties')
}

export function isFacultyPhotoDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg);base64,/i.test(String(value || '').trim())
}

export function isStoredFacultyPhotoPath(value) {
  const t = String(value || '').trim()
  return t.startsWith(`${FACULTY_UPLOAD_REL}/`)
}

function extForMime(mime) {
  return EXT_BY_MIME[String(mime || '').toLowerCase()] || null
}

export function assertFacultyPhotoMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (!ALLOWED_MIME.has(m)) {
    const err = new Error('Only PNG or JPG images are allowed.')
    err.statusCode = 400
    throw err
  }
}

export function assertFacultyPhotoSize(byteLength) {
  const n = Number(byteLength)
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('Photo file is empty.')
    err.statusCode = 400
    throw err
  }
  if (n > FACULTY_PHOTO_MAX_BYTES) {
    const err = new Error(PHOTO_MAX_MSG)
    err.statusCode = 400
    throw err
  }
}

/** @param {Buffer} buffer @param {string} mime @param {string} facultyId */
export async function saveFacultyPhotoBuffer(buffer, mime, facultyId) {
  assertFacultyPhotoMime(mime)
  assertFacultyPhotoSize(buffer.length)
  const ext = extForMime(mime)
  if (!ext) {
    const err = new Error('Only PNG or JPG images are allowed.')
    err.statusCode = 400
    throw err
  }
  const dir = getFacultyUploadDir()
  await fs.promises.mkdir(dir, { recursive: true })
  const safeId = String(facultyId || 'new')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64)
  const name = `faculty_${safeId}_${Date.now()}.${ext}`
  const rel = `${FACULTY_UPLOAD_REL}/${name}`
  await fs.promises.writeFile(path.join(dir, name), buffer)
  return rel
}

/** @param {string} dataUrl @param {string} facultyId */
export async function saveFacultyPhotoFromDataUrl(dataUrl, facultyId) {
  const raw = String(dataUrl || '').trim()
  const match = raw.match(/^data:(image\/[^;]+);base64,(.+)$/is)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const buffer = Buffer.from(match[2], 'base64')
  return saveFacultyPhotoBuffer(buffer, mime, facultyId)
}

export async function deleteStoredFacultyPhotoIfLocal(photoUrl) {
  if (!isStoredFacultyPhotoPath(photoUrl)) return
  const rel = String(photoUrl).replace(/^\//, '')
  const filePath = resolvePublicUploadPath(`/${rel}`)
  try {
    await fs.promises.unlink(filePath)
  } catch {
    /* ignore missing file */
  }
}

/**
 * Resolve photo for DB from multipart file or legacy data URL in JSON body.
 * @param {{
 *   file?: { buffer: Buffer, mimetype: string } | null,
 *   body: Record<string, unknown>,
 *   facultyId: string,
 *   isUpdate?: boolean,
 *   priorPhotoUrl?: string,
 * }} opts
 */
export async function resolveFacultyPhotoForDb({ file, body, facultyId, isUpdate = false, priorPhotoUrl = '' }) {
  let nextPath = null
  if (file?.buffer) {
    nextPath = await saveFacultyPhotoBuffer(file.buffer, file.mimetype, facultyId)
  } else {
    const raw =
      (body?.photo_url != null && String(body.photo_url).trim()) ||
      (body?.photoDataUrl != null && String(body.photoDataUrl).trim()) ||
      ''
    if (raw && isFacultyPhotoDataUrl(raw)) {
      nextPath = await saveFacultyPhotoFromDataUrl(raw, facultyId)
    } else if (raw && isStoredFacultyPhotoPath(raw)) {
      nextPath = raw
    } else if (raw && !isUpdate) {
      nextPath = raw
    }
  }

  if (!nextPath) {
    return { photoSent: false, photoUrl: null }
  }

  if (isUpdate && priorPhotoUrl && priorPhotoUrl !== nextPath) {
    await deleteStoredFacultyPhotoIfLocal(priorPhotoUrl)
  }

  body.photo_url = nextPath
  body.photoDataUrl = nextPath
  return { photoSent: true, photoUrl: nextPath }
}
