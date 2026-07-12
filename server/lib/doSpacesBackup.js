import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createSpacesS3Client, getSpacesConfig, isSpacesConfigured } from './doSpacesClient.js'

/**
 * @param {string} localPath
 * @param {string} objectKey
 * @returns {Promise<{ objectKey: string, etag?: string }>}
 */
export async function uploadBackupToSpaces(localPath, objectKey) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) {
    throw new Error('DigitalOcean Spaces is not configured.')
  }
  const key = String(objectKey || '').trim()
  if (!key) throw new Error('Spaces object key is required.')
  const resolved = path.resolve(String(localPath || '').trim())
  await fsp.access(resolved, fs.constants.R_OK)

  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: key,
      Body: fs.createReadStream(resolved),
      ContentType: 'application/octet-stream',
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  })

  const result = await upload.done()
  return { objectKey: key, etag: result.ETag ? String(result.ETag) : undefined }
}

/**
 * @param {string} objectKey
 * @param {string} destPath
 */
export async function downloadBackupFromSpaces(objectKey, destPath) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) {
    throw new Error('DigitalOcean Spaces is not configured.')
  }
  const key = String(objectKey || '').trim()
  if (!key) throw new Error('Spaces object key is required.')
  const dest = path.resolve(String(destPath || '').trim())
  await fsp.mkdir(path.dirname(dest), { recursive: true })

  const response = await client.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  )
  if (!response.Body) {
    throw new Error(`Spaces object not found: ${key}`)
  }
  await pipeline(response.Body, fs.createWriteStream(dest))
  return dest
}

/** @param {string} objectKey */
export async function headBackupInSpaces(objectKey) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) return false
  const key = String(objectKey || '').trim()
  if (!key) return false
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    )
    return true
  } catch {
    return false
  }
}

/** @param {string} objectKey */
export async function deleteBackupFromSpaces(objectKey) {
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) return false
  const key = String(objectKey || '').trim()
  if (!key) return false
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    )
    return true
  } catch (e) {
    console.warn('[backup] Spaces delete failed:', e?.message || e)
    return false
  }
}

/** Probe bucket reachability for diagnostics. */
export async function probeSpacesReachability() {
  if (!isSpacesConfigured()) {
    return { configured: false, reachable: false, bucket: null, prefix: null, error: 'not_configured' }
  }
  const cfg = getSpacesConfig()
  const client = createSpacesS3Client()
  if (!cfg || !client) {
    return { configured: false, reachable: false, bucket: null, prefix: null, error: 'client_unavailable' }
  }
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
    return {
      configured: true,
      reachable: true,
      bucket: cfg.bucket,
      prefix: cfg.backupsPrefix,
      endpoint: cfg.endpoint,
      error: null,
    }
  } catch (e) {
    return {
      configured: true,
      reachable: false,
      bucket: cfg.bucket,
      prefix: cfg.backupsPrefix,
      endpoint: cfg.endpoint,
      error: String(e?.message || e).slice(0, 500),
    }
  }
}
