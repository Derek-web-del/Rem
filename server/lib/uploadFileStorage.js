import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createSpacesS3Client, getSpacesConfig, isSpacesConfigured } from './doSpacesClient.js'
import { uploadsRoot } from './uploadPaths.js'

function envDisabled(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'no' || v === 'off'
}

/** Live uploads persist to Spaces when configured (Phase 2). */
export function isUploadsOnSpaces() {
  if (!isSpacesConfigured()) return false
  if (envDisabled('DO_SPACES_UPLOADS_ENABLED')) return false
  return true
}

/** @param {string} storedPath e.g. /uploads/curriculum/foo.pdf */
export function normalizeStoredUploadPath(storedPath) {
  let t = String(storedPath || '').trim().replace(/\\/g, '/')
  if (!t) return ''
  if (t.startsWith('public/')) t = t.slice('public/'.length)
  if (!t.startsWith('/uploads/')) {
    if (t.startsWith('uploads/')) t = `/${t}`
    else return ''
  }
  return t.replace(/\/+/g, '/')
}

/** Relative path under uploads root: curriculum/foo.pdf */
export function storedPathToRelative(storedPath) {
  const t = normalizeStoredUploadPath(storedPath)
  if (!t.startsWith('/uploads/')) return ''
  return t.slice('/uploads/'.length)
}

/** S3 object key: uploads/curriculum/foo.pdf */
export function storedPathToObjectKey(storedPath) {
  const rel = storedPathToRelative(storedPath)
  if (!rel) return ''
  const cfg = getSpacesConfig()
  const prefix = cfg?.uploadsPrefix || 'uploads/'
  return `${prefix}${rel}`.replace(/\/+/g, '/')
}

export function relativeToStoredPath(relativePath) {
  const rel = String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel) return ''
  return `/uploads/${rel}`.replace(/\/+/g, '/')
}

export function resolveLocalUploadAbsPath(storedPath) {
  const rel = storedPathToRelative(storedPath)
  if (!rel) return ''
  return path.join(uploadsRoot(), rel)
}

async function putObjectBuffer(objectKey, buffer, contentType = 'application/octet-stream') {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) throw new Error('DigitalOcean Spaces is not configured.')
  const key = String(objectKey || '').trim()
  if (!key) throw new Error('Spaces object key is required.')
  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  })
  await upload.done()
}

async function putObjectFile(objectKey, localPath, contentType = 'application/octet-stream') {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) throw new Error('DigitalOcean Spaces is not configured.')
  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  })
  await upload.done()
}

async function downloadObjectToPath(objectKey, destPath) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) throw new Error('DigitalOcean Spaces is not configured.')
  await fsp.mkdir(path.dirname(destPath), { recursive: true })
  const response = await client.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
    }),
  )
  if (!response.Body) throw new Error(`Spaces object not found: ${objectKey}`)
  await pipeline(response.Body, fs.createWriteStream(destPath))
}

async function headObject(objectKey) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) return false
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * Write upload to local cache and Spaces (when enabled).
 * @param {string} storedPath `/uploads/...` path returned to DB
 * @param {Buffer} buffer
 */
export async function persistUploadBuffer(storedPath, buffer) {
  const normalized = normalizeStoredUploadPath(storedPath)
  if (!normalized) throw new Error('Invalid upload path.')
  const abs = resolveLocalUploadAbsPath(normalized)
  await fsp.mkdir(path.dirname(abs), { recursive: true })
  await fsp.writeFile(abs, buffer)
  if (isUploadsOnSpaces()) {
    const key = storedPathToObjectKey(normalized)
    if (key) await putObjectBuffer(key, buffer)
  }
  return normalized
}

/** Upload an existing local file to Spaces (e.g. after multer disk write). */
export async function syncLocalFileToSpaces(storedPath, localAbsPath = null) {
  if (!isUploadsOnSpaces()) return false
  const normalized = normalizeStoredUploadPath(storedPath)
  const abs = localAbsPath || resolveLocalUploadAbsPath(normalized)
  if (!normalized || !abs) return false
  try {
    await fsp.access(abs, fs.constants.R_OK)
  } catch {
    return false
  }
  const key = storedPathToObjectKey(normalized)
  if (!key) return false
  await putObjectFile(key, abs)
  return true
}

/** Ensure file exists locally; download from Spaces if needed. Returns absolute path or ''. */
export async function ensureLocalUploadFile(storedPath) {
  const normalized = normalizeStoredUploadPath(storedPath)
  if (!normalized) return ''
  const abs = resolveLocalUploadAbsPath(normalized)
  try {
    await fsp.access(abs, fs.constants.R_OK)
    return abs
  } catch {
    /* missing locally */
  }
  if (!isUploadsOnSpaces()) return ''
  const key = storedPathToObjectKey(normalized)
  if (!key || !(await headObject(key))) return ''
  try {
    await downloadObjectToPath(key, abs)
    return abs
  } catch (e) {
    console.warn('[uploads] Spaces download failed:', key, e?.message || e)
    return ''
  }
}

export async function deleteUploadByStoredPath(storedPath) {
  const normalized = normalizeStoredUploadPath(storedPath)
  if (!normalized) return
  const abs = resolveLocalUploadAbsPath(normalized)
  try {
    await fsp.unlink(abs)
  } catch {
    /* ignore */
  }
  if (!isUploadsOnSpaces()) return
  const key = storedPathToObjectKey(normalized)
  if (!key) return
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) return
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    )
  } catch (e) {
    console.warn('[uploads] Spaces delete failed:', key, e?.message || e)
  }
}

/** Before backup: pull all Spaces upload objects into local uploads dir for tar pack. */
export async function hydrateUploadsDirFromSpaces(uploadsDir = uploadsRoot()) {
  if (!isUploadsOnSpaces()) return { hydrated: 0, skipped: true }
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) return { hydrated: 0, skipped: true }

  const prefix = cfg.uploadsPrefix || 'uploads/'
  let token = undefined
  let hydrated = 0

  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    )
    for (const obj of list.Contents || []) {
      const key = String(obj.Key || '')
      if (!key || key.endsWith('/')) continue
      const rel = key.startsWith(prefix) ? key.slice(prefix.length) : key
      if (!rel) continue
      const dest = path.join(uploadsDir, rel)
      let needsDownload = true
      try {
        const stat = await fsp.stat(dest)
        if (stat.isFile() && obj.Size != null && stat.size === obj.Size) {
          needsDownload = false
        }
      } catch {
        needsDownload = true
      }
      if (needsDownload) {
        await downloadObjectToPath(key, dest)
        hydrated += 1
      }
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (token)

  if (hydrated > 0) {
    console.log(`[uploads] Hydrated ${hydrated} file(s) from Spaces into ${uploadsDir}`)
  }
  return { hydrated, skipped: false }
}

/** After restore extract: push all local upload files to Spaces. */
export async function syncUploadsDirToSpaces(uploadsDir = uploadsRoot()) {
  if (!isUploadsOnSpaces()) return { uploaded: 0, skipped: true }
  const root = path.resolve(uploadsDir)
  let uploaded = 0

  async function walk(dir) {
    let entries = []
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        const rel = path.relative(root, full).replace(/\\/g, '/')
        const stored = relativeToStoredPath(rel)
        const key = storedPathToObjectKey(stored)
        if (!key) continue
        try {
          await putObjectFile(key, full)
          uploaded += 1
        } catch (e) {
          console.warn('[uploads] Spaces sync failed:', key, e?.message || e)
        }
      }
    }
  }

  await walk(root)
  if (uploaded > 0) {
    console.log(`[uploads] Synced ${uploaded} file(s) from ${root} to Spaces`)
  }
  return { uploaded, skipped: false }
}

export async function probeUploadsStorage() {
  const onSpaces = isUploadsOnSpaces()
  const cfg = getSpacesConfig()
  return {
    uploads_on_spaces: onSpaces,
    uploads_prefix: cfg?.uploadsPrefix || null,
    local_root: uploadsRoot(),
  }
}
