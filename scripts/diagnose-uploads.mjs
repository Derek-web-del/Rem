/**
 * Compare DB-stored file paths vs files on disk.
 * Run: node --env-file=.env scripts/diagnose-uploads.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { uploadsRoot } from '../server/lib/uploadPaths.js'

function existsForUploadPath(storedPath) {
  const p = String(storedPath || '').trim()
  if (!p.startsWith('/uploads/')) return { kind: 'not-path', exists: null }
  const rel = p.slice('/uploads/'.length)
  const abs = path.join(uploadsRoot(), rel)
  return { kind: 'path', exists: fs.existsSync(abs), abs }
}

async function auditTable(pool, label, sql, pickPath) {
  const { rows } = await pool.query(sql)
  let missing = 0
  let ok = 0
  let other = 0
  for (const row of rows) {
    const stored = pickPath(row)
    const check = existsForUploadPath(stored)
    if (check.kind === 'not-path') {
      other++
      continue
    }
    if (check.exists) ok++
    else missing++
  }
  return { label, total: rows.length, ok, missing, other }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing')
  process.exit(1)
}

const root = uploadsRoot()
console.log('[diagnose-uploads] uploads root:', root)
console.log('[diagnose-uploads] UPLOAD_DIR set:', Boolean(String(process.env.UPLOAD_DIR || '').trim()))

for (const cat of ['faculties', 'announcements', 'materials', 'curriculum', 'assignments', 'activities']) {
  const dir = path.join(root, cat)
  let count = 0
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      try {
        if (fs.statSync(path.join(dir, name)).isFile()) count++
      } catch {
        /* */
      }
    }
  }
  console.log(`  disk ${cat}: ${count} file(s)`)
}

const audits = await Promise.all([
  auditTable(
    pool,
    'announcements.image_path',
    `SELECT image_path FROM announcements WHERE COALESCE(image_path, '') <> ''`,
    (r) => r.image_path,
  ),
  auditTable(
    pool,
    'faculties.photo_url',
    `SELECT photo_url FROM faculties WHERE COALESCE(photo_url, '') LIKE '/uploads/%'`,
    (r) => r.photo_url,
  ),
  auditTable(
    pool,
    'study_materials.file_url',
    `SELECT file_url FROM study_materials WHERE COALESCE(file_url, '') <> ''`,
    (r) => r.file_url,
  ),
  auditTable(
    pool,
    'curriculum_guides.file_url',
    `SELECT file_url FROM curriculum_guides WHERE COALESCE(file_url, '') <> ''`,
    (r) => r.file_url,
  ),
])

console.log('\n[diagnose-uploads] DB path audit:')
for (const a of audits) {
  console.log(
    `  ${a.label}: ${a.total} rows — on disk: ${a.ok}, missing: ${a.missing}, non-path/other: ${a.other}`,
  )
}

const { rows: annBase64 } = await pool.query(`
  SELECT COUNT(*)::int AS n
  FROM announcements
  WHERE COALESCE(announcement_image, '') LIKE 'data:%'
    AND (COALESCE(image_path, '') = '' OR image_path IS NULL)
`)
console.log(
  `\n[diagnose-uploads] announcements with base64 only (no image_path): ${annBase64[0]?.n ?? 0}`,
)

await pool.end()
