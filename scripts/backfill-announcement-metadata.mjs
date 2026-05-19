/**
 * Backfill announcements rows missing image_path / image_name / uploaded_by / updated_at.
 *
 *   node scripts/backfill-announcement-metadata.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import {
  announcementRowToResponse,
  maybeDeleteOldAnnouncementFile,
  resolveAnnouncementImageForSave,
} from '../server/lib/announcementsDb.js'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('[backfill-announcement-metadata] Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 2 })

try {
  const { rows } = await pool.query(`
    SELECT id, announcement_image, image_path, image_name, uploaded_by, title, created_at, updated_at
    FROM announcements
    ORDER BY id ASC
  `)

  let updated = 0
  for (const row of rows || []) {
    const needsPath = !String(row.image_path || '').trim()
    const needsName = !String(row.image_name || '').trim()
    const needsBy = !String(row.uploaded_by || '').trim()
    const needsUpdatedAt = row.updated_at == null
    const hasImage = String(row.announcement_image || '').trim()

    if (!needsPath && !needsName && !needsBy && !needsUpdatedAt) continue

    let imageFields = {
      announcement_image: row.announcement_image || '',
      image_path: row.image_path || '',
      image_name: row.image_name || '',
      deleteOldPath: '',
    }

    if (hasImage && needsPath) {
      imageFields = resolveAnnouncementImageForSave({
        announcement_image: row.announcement_image,
        image_name: row.image_name || row.title,
        title: row.title,
        existingPath: row.image_path,
        existingDataUrl: row.announcement_image,
      })
      maybeDeleteOldAnnouncementFile(imageFields.deleteOldPath, imageFields.image_path)
    }

    const uploadedBy = needsBy ? 'Institute' : row.uploaded_by
    const imageName = needsName ? imageFields.image_name || `${row.title || 'announcement'}.jpg` : row.image_name

    await pool.query(
      `
      UPDATE announcements
      SET image_path = $1,
          image_name = $2,
          uploaded_by = $3,
          updated_at = COALESCE(updated_at, created_at, NOW())
      WHERE id = $4
      `,
      [
        imageFields.image_path || row.image_path || null,
        imageName || null,
        uploadedBy || null,
        row.id,
      ],
    )

    const { rows: checkRows } = await pool.query(
      `SELECT id, image_path, image_name, uploaded_by, updated_at FROM announcements WHERE id = $1`,
      [row.id],
    )
    console.log('[backfill]', announcementRowToResponse(checkRows[0]))
    updated += 1
  }

  console.log(`[backfill-announcement-metadata] Updated ${updated} row(s).`)
} catch (e) {
  console.error('[backfill-announcement-metadata]', e?.message || e)
  process.exit(1)
} finally {
  await pool.end().catch(() => {})
}
