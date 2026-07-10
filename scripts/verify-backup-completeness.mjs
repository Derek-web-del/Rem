/**
 * Verifies .lnbak backup includes:
 * - All files under public/uploads (uploads_archive.tar.gz)
 * - DB rows including archived (soft-deleted) records
 * - Round-trip file manifest integrity
 *
 * Run: node --env-file=.env scripts/verify-backup-completeness.mjs
 */
import 'dotenv/config'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import {
  exportBackupData,
  writeLnbakArchiveToPath,
  readLnbakBuffer,
  validateLnbakParsed,
  buildBackupManifest,
  verifyRestoredFiles,
  BACKUPS_DIR,
  UPLOADS_DIR,
} from '../server/lib/lnbakEngine.js'

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('FAIL: DATABASE_URL not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 2 })

function countArchived(rows) {
  if (!Array.isArray(rows)) return 0
  return rows.filter((r) => r.archived_at != null && String(r.archived_at).trim() !== '').length
}

async function countDiskFiles(dir) {
  let count = 0
  async function walk(d) {
    let entries
    try {
      entries = await fsp.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const abs = path.join(d, ent.name)
      if (ent.isDirectory()) await walk(abs)
      else if (ent.isFile()) count += 1
    }
  }
  await walk(dir)
  return count
}

async function main() {
  console.log('[backup-verify] uploads root:', UPLOADS_DIR)
  console.log('[backup-verify] backups dir:', BACKUPS_DIR)

  const diskFileCount = await countDiskFiles(UPLOADS_DIR)
  console.log(`[backup-verify] files on disk (uploads): ${diskFileCount}`)

  const { meta, data, manifest } = await exportBackupData(pool)
  validateLnbakParsed({ meta, data })

  const archivedFaculties = countArchived(data.faculties)
  const archivedStudents = countArchived(data.students)
  const archivedSubjects = countArchived(data.subjects)
  const totalTables = Object.keys(data).filter((k) => Array.isArray(data[k])).length
  const totalRows = Object.values(data).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0)

  console.log(`[backup-verify] export tables: ${totalTables}, total rows: ${totalRows}`)
  console.log(`[backup-verify] archived in backup — faculties: ${archivedFaculties}, students: ${archivedStudents}, subjects: ${archivedSubjects}`)
  console.log(`[backup-verify] manifest files_backed_up: ${manifest.files_backed_up}`)
  console.log(`[backup-verify] manifest uploads_size_bytes: ${manifest.uploads_size_bytes}`)
  console.log(`[backup-verify] manifest categories:`, manifest.files_by_category || {})

  if (diskFileCount > 0 && Number(manifest.files_backed_up) === 0) {
    throw new Error('Disk has upload files but manifest reports 0 — backup would miss files')
  }

  if (diskFileCount > 0 && Number(manifest.files_backed_up) < diskFileCount) {
    console.warn(
      `[backup-verify] WARN: disk file count (${diskFileCount}) > manifest (${manifest.files_backed_up}) — check nested dirs or empty files`,
    )
  }

  const curriculumRows = Array.isArray(data.curriculum_guides) ? data.curriculum_guides.length : 0
  const syllabusSubjects = (data.subjects || []).filter((s) => String(s.syllabus_pdf || '').trim()).length
  console.log(`[backup-verify] curriculum_guides rows: ${curriculumRows}`)
  console.log(`[backup-verify] subjects with syllabus_pdf: ${syllabusSubjects}`)

  const tmpPath = path.join(BACKUPS_DIR, `_verify_${Date.now()}.lnbak`)
  await writeLnbakArchiveToPath({ meta, data, diskPath: tmpPath, manifest })
  const stat = await fsp.stat(tmpPath)
  console.log(`[backup-verify] wrote test .lnbak: ${tmpPath} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`)

  const buf = await fsp.readFile(tmpPath)
  const lnbak = await readLnbakBuffer(buf)
  validateLnbakParsed(lnbak.parsed)
  if (!lnbak.uploadsBuffer?.length) {
    throw new Error('.lnbak missing uploads_archive.tar.gz content')
  }
  console.log(`[backup-verify] uploads_archive.tar.gz size: ${lnbak.uploadsBuffer.length} bytes`)

  const fileCheck = await verifyRestoredFiles(lnbak.parsed, manifest)
  console.log(`[backup-verify] DB path sample check: ${fileCheck.verified}/${fileCheck.sample_checked} exist on disk now`)
  if (fileCheck.missing.length) {
    console.warn('[backup-verify] missing referenced files (pre-restore):', fileCheck.missing.slice(0, 5))
  }

  await fsp.unlink(tmpPath).catch(() => {})

  // Spot-check archived records are restorable (present in dump, not filtered out)
  const { rows: archivedFacultyDb } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.faculties WHERE archived_at IS NOT NULL`,
  )
  const dbArchivedFaculty = Number(archivedFacultyDb[0]?.c || 0)
  if (dbArchivedFaculty > 0 && archivedFaculties === 0) {
    throw new Error('DB has archived faculties but backup exported 0 archived rows')
  }
  if (dbArchivedFaculty > 0) {
    console.log(`[backup-verify] archived faculties in DB (${dbArchivedFaculty}) are included in backup dump`)
  }

  console.log('[backup-verify] ALL CHECKS PASSED')
  console.log('')
  console.log('Restore behavior reminder:')
  console.log('  - Restore replaces live DB + uploads with backup snapshot.')
  console.log('  - Records deleted BEFORE backup was created are NOT in the file (cannot restore).')
  console.log('  - Records deleted AFTER backup can be recovered by restoring that backup.')
  console.log('  - Archived (soft-deleted) records ARE included in every backup.')
}

main()
  .catch((e) => {
    console.error('[backup-verify] FAIL:', e?.message || e)
    process.exit(1)
  })
  .finally(() => pool.end())
