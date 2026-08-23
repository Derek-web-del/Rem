import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createSpacesS3Client, getSpacesConfig } from './doSpacesClient.js'
import { uploadsRoot } from './uploadPaths.js'
import {
  normalizeStoredUploadPath,
  storedPathToRelative,
  storedPathToObjectKey,
  resolveLocalUploadAbsPath,
  isUploadsOnSpaces,
  ensureLocalUploadFile,
} from './uploadFileStorage.js'

export const RECYCLE_BIN_DIR = (() => {
  const configured = String(process.env.RECYCLE_BIN_DIR || '').trim()
  if (configured) return path.resolve(configured)
  const uploadDir = String(process.env.UPLOAD_DIR || '').trim()
  if (uploadDir) return path.join(path.dirname(path.resolve(uploadDir)), 'recycle-bin')
  return path.join(process.cwd(), 'recycle-bin')
})()

const CONTEXT_LABELS = [
  ['/uploads/curriculum/', 'Curriculum guide'],
  ['/uploads/syllabus/', 'Syllabus'],
  ['/uploads/submissions/assignments/', 'Assignment submission'],
  ['/uploads/submissions/activities/', 'Activity submission'],
  ['/uploads/assignments/', 'Assignment attachment'],
  ['/uploads/activities/', 'Activity attachment'],
  ['/uploads/announcements/', 'Announcement image'],
  ['/uploads/faculties/', 'Faculty photo'],
  ['/uploads/lessons/', 'Lesson file'],
  ['/uploads/materials/', 'Study material'],
  ['/uploads/originality/', 'Originality check upload'],
]

function guessContext(normalizedPath) {
  for (const [prefix, label] of CONTEXT_LABELS) {
    if (normalizedPath.startsWith(prefix)) return label
  }
  return 'Uploaded file'
}

export async function ensureRecycleBinSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.recycled_files (
      id BIGSERIAL PRIMARY KEY,
      original_path VARCHAR(512) NOT NULL,
      recycle_path VARCHAR(512) NOT NULL,
      file_name VARCHAR(512),
      context VARCHAR(255),
      size_bytes BIGINT,
      on_spaces BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_by VARCHAR(64),
      deleted_by_name VARCHAR(255),
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_recycled_files_deleted_at ON public.recycled_files (deleted_at DESC)`,
  )
}

async function moveLocalFile(fromAbs, toAbs) {
  await fsp.mkdir(path.dirname(toAbs), { recursive: true })
  try {
    await fsp.rename(fromAbs, toAbs)
  } catch (e) {
    // EXDEV: rename across devices/volumes isn't allowed — fall back to copy+unlink.
    if (e?.code !== 'EXDEV') throw e
    await fsp.copyFile(fromAbs, toAbs)
    await fsp.unlink(fromAbs)
  }
}

/**
 * Move an uploaded file to the recycle bin instead of deleting it outright.
 * Never throws — on any failure it falls back to a hard delete so callers
 * (many of which fire-and-forget this call) never see a rejected promise.
 * @returns {Promise<boolean>} true if the file was recycled, false if hard-deleted/missing
 */
export async function moveUploadToRecycleBin(pool, storedPath, { deletedBy = null, deletedByName = '' } = {}) {
  const normalized = normalizeStoredUploadPath(storedPath)
  if (!normalized) return false

  try {
    const localAbs = (await ensureLocalUploadFile(normalized)) || resolveLocalUploadAbsPath(normalized)
    const relUnderUploads = storedPathToRelative(normalized)
    const fileName = path.basename(relUnderUploads)
    const ts = Date.now()
    const recycleRel = `${ts}__${relUnderUploads}`.replace(/[\\/]+/g, path.sep === '\\' ? '\\' : '/')
    const recycleAbs = path.join(RECYCLE_BIN_DIR, recycleRel)

    let movedLocally = false
    let sizeBytes = null
    try {
      const stat = await fsp.stat(localAbs)
      sizeBytes = stat.size
      await moveLocalFile(localAbs, recycleAbs)
      movedLocally = true
    } catch {
      /* file missing locally — may still exist on Spaces only */
    }

    let onSpaces = false
    if (isUploadsOnSpaces()) {
      const cfg = getSpacesConfig()
      const client = createSpacesS3Client()
      const originalKey = storedPathToObjectKey(normalized)
      const recycleKey = `recycle/${recycleRel}`.replace(/\\/g, '/')
      if (cfg && client && originalKey) {
        try {
          await client.send(
            new CopyObjectCommand({
              Bucket: cfg.bucket,
              CopySource: `/${cfg.bucket}/${originalKey}`,
              Key: recycleKey,
            }),
          )
          await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: originalKey }))
          onSpaces = true
        } catch {
          /* Spaces object may not have existed — not fatal if local move succeeded */
        }
      }
    }

    if (!movedLocally && !onSpaces) {
      // Nothing found to recycle (already gone) — nothing more to do.
      return false
    }

    await ensureRecycleBinSchema(pool)
    await pool.query(
      `INSERT INTO public.recycled_files
        (original_path, recycle_path, file_name, context, size_bytes, on_spaces, deleted_by, deleted_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        normalized,
        recycleRel,
        fileName,
        guessContext(normalized),
        sizeBytes,
        onSpaces,
        deletedBy != null ? String(deletedBy) : null,
        deletedByName || null,
      ],
    )
    return true
  } catch (e) {
    console.warn('[recycle-bin] Could not recycle file, falling back to hard delete:', storedPath, e?.message || e)
    return false
  }
}

export async function listRecycledFiles(pool) {
  await ensureRecycleBinSchema(pool)
  const { rows } = await pool.query(
    `SELECT id, original_path, recycle_path, file_name, context, size_bytes, on_spaces,
            deleted_by, deleted_by_name, deleted_at
     FROM public.recycled_files
     ORDER BY deleted_at DESC`,
  )
  return rows.map((r) => ({
    id: String(r.id),
    original_path: r.original_path,
    file_name: r.file_name,
    context: r.context,
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    on_spaces: Boolean(r.on_spaces),
    deleted_by: r.deleted_by,
    deleted_by_name: r.deleted_by_name,
    deleted_at: r.deleted_at instanceof Date ? r.deleted_at.toISOString() : r.deleted_at,
  }))
}

async function fetchRecycledRow(pool, id) {
  await ensureRecycleBinSchema(pool)
  const { rows } = await pool.query(`SELECT * FROM public.recycled_files WHERE id = $1 LIMIT 1`, [id])
  return rows?.[0] || null
}

export async function restoreRecycledFile(pool, id) {
  const row = await fetchRecycledRow(pool, id)
  if (!row) return { ok: false, error: 'NOT_FOUND' }

  const recycleAbs = path.join(RECYCLE_BIN_DIR, row.recycle_path)
  const originalAbs = resolveLocalUploadAbsPath(row.original_path)

  let restoredLocally = false
  try {
    await fsp.access(recycleAbs, fs.constants.R_OK)
    await moveLocalFile(recycleAbs, originalAbs)
    restoredLocally = true
  } catch {
    /* not present locally (Spaces-only recycle) */
  }

  if (row.on_spaces) {
    const cfg = getSpacesConfig()
    const client = createSpacesS3Client()
    const recycleKey = `recycle/${row.recycle_path}`.replace(/\\/g, '/')
    const originalKey = storedPathToObjectKey(row.original_path)
    if (cfg && client && originalKey) {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: cfg.bucket,
            CopySource: `/${cfg.bucket}/${recycleKey}`,
            Key: originalKey,
          }),
        )
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: recycleKey }))
      } catch (e) {
        if (!restoredLocally) return { ok: false, error: String(e?.message || e) }
      }
    }
  }

  if (!restoredLocally && !row.on_spaces) {
    return { ok: false, error: 'FILE_MISSING_IN_RECYCLE_BIN' }
  }

  await pool.query(`DELETE FROM public.recycled_files WHERE id = $1`, [id])
  return { ok: true, original_path: row.original_path, file_name: row.file_name }
}

export async function permanentlyDeleteRecycledFile(pool, id) {
  const row = await fetchRecycledRow(pool, id)
  if (!row) return { ok: false, error: 'NOT_FOUND' }

  const recycleAbs = path.join(RECYCLE_BIN_DIR, row.recycle_path)
  try {
    await fsp.unlink(recycleAbs)
  } catch {
    /* ignore */
  }

  if (row.on_spaces) {
    const cfg = getSpacesConfig()
    const client = createSpacesS3Client()
    const recycleKey = `recycle/${row.recycle_path}`.replace(/\\/g, '/')
    if (cfg && client) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: recycleKey }))
      } catch {
        /* ignore */
      }
    }
  }

  await pool.query(`DELETE FROM public.recycled_files WHERE id = $1`, [id])
  return { ok: true, file_name: row.file_name }
}
