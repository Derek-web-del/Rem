/**
 * Restore missing upload files from DB-stored base64 (announcements).
 * Run after deploy when UPLOAD_DIR volume was empty but Postgres still has image data.
 *
 *   node --env-file=.env scripts/rehydrate-uploads-from-db.mjs
 *   node --env-file=.env scripts/rehydrate-uploads-from-db.mjs --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { saveAnnouncementImageFromDataUrl } from '../server/lib/announcementImageStorage.js'
import { normalizeStoredUploadPath, resolvePublicUploadPath, uploadsRoot } from '../server/lib/uploadPaths.js'

const dryRun = process.argv.includes('--dry-run')

if (!process.env.DATABASE_URL) {
  console.error('[rehydrate-uploads] DATABASE_URL missing')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
console.log('[rehydrate-uploads] uploads root:', uploadsRoot())
if (dryRun) console.log('[rehydrate-uploads] dry-run — no files or DB rows will change')

const { rows } = await pool.query(`
  SELECT id, title, image_path, announcement_image, image_name
  FROM announcements
  WHERE COALESCE(announcement_image, '') LIKE 'data:%'
`)

let restored = 0
let skipped = 0
let failed = 0

for (const row of rows) {
  const dataUrl = String(row.announcement_image || '').trim()
  const imagePath = normalizeStoredUploadPath(row.image_path || '')
  const abs = imagePath ? resolvePublicUploadPath(imagePath) : ''
  const exists = abs && fs.existsSync(abs)

  if (exists) {
    skipped++
    continue
  }

  const baseName = String(row.image_name || row.title || `announcement-${row.id}`).trim()
  if (dryRun) {
    console.log(`  would restore announcement #${row.id} → ${imagePath || '(new path)'}`)
    restored++
    continue
  }

  try {
    const saved = saveAnnouncementImageFromDataUrl(dataUrl, baseName)
    if (!saved?.file_url) {
      failed++
      console.warn(`  failed announcement #${row.id}: could not decode image`)
      continue
    }

    await pool.query(
      `UPDATE announcements SET image_path = $1, image_name = COALESCE(NULLIF(image_name, ''), $2) WHERE id = $3`,
      [saved.file_url, saved.file_name, row.id],
    )
    restored++
    console.log(`  restored announcement #${row.id} → ${saved.file_url}`)
  } catch (e) {
    failed++
    console.warn(`  failed announcement #${row.id}:`, e.message)
  }
}

console.log(
  `[rehydrate-uploads] done — restored: ${restored}, skipped (already on disk): ${skipped}, failed: ${failed}`,
)
await pool.end()
