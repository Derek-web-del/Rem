import fs from 'node:fs'
import path from 'node:path'

/** User-uploaded files root (Railway volume mount target). */
export function uploadsRoot() {
  const configured = String(process.env.UPLOAD_DIR || '').trim()
  if (configured) return path.resolve(configured)
  return path.resolve(process.cwd(), 'public', 'uploads')
}

/** Bundled subject cover logos (deployed with app, not on uploads volume). */
export function subjectAssetsRoot() {
  return path.resolve(process.cwd(), 'public', 'assets', 'subjects')
}

/** Resolve a stored `/uploads/...` path to an absolute filesystem path. */
export function resolvePublicUploadPath(storedPath) {
  const t = String(storedPath || '').trim()
  if (!t.startsWith('/uploads/')) return ''
  const rel = t.slice('/uploads/'.length)
  return path.join(uploadsRoot(), rel)
}

const UPLOAD_SUBDIRS = [
  'assignments',
  'activities',
  'lessons',
  'materials',
  'faculties',
  'announcements',
  'curriculum',
  'syllabus',
  'originality',
  'submissions/assignments',
  'submissions/activities',
]

/** Ensure upload subdirectories exist (safe on ephemeral or volume-backed storage). */
export function ensureUploadDirs() {
  const root = uploadsRoot()
  fs.mkdirSync(root, { recursive: true })
  for (const sub of UPLOAD_SUBDIRS) {
    fs.mkdirSync(path.join(root, sub), { recursive: true })
  }
}
