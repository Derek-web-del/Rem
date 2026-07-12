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
export function normalizeStoredUploadPath(storedPath) {
  let t = String(storedPath || '').trim().replace(/\\/g, '/')
  if (!t) return ''
  if (t.startsWith('public/')) t = t.slice('public/'.length)
  if (!t.startsWith('/') && (t.startsWith('uploads/') || t.startsWith('api/files/'))) {
    t = `/${t}`
  }
  if (t.startsWith('/api/files/faculties/')) {
    return `/uploads/faculties/${t.slice('/api/files/faculties/'.length)}`
  }
  if (t.startsWith('/api/files/photos/')) {
    return `/uploads/faculties/${t.slice('/api/files/photos/'.length)}`
  }
  if (t.startsWith('/api/files/')) {
    const rest = t.slice('/api/files/'.length)
    const slash = rest.indexOf('/')
    if (slash === -1) return ''
    const category = rest.slice(0, slash)
    const filePart = rest.slice(slash + 1)
    const dirMap = {
      photos: 'faculties',
      subjects: 'Subjects_images',
      assignments: 'assignments',
      submissions: 'submissions',
      materials: 'materials',
      activities: 'activities',
      lessons: 'lessons',
      announcements: 'announcements',
      curriculum: 'curriculum',
      syllabus: 'syllabus',
      originality: 'originality',
    }
    const dir = dirMap[category] || category
    return `/uploads/${dir}/${filePart}`.replace(/\/+/g, '/')
  }
  return t
}

export function resolvePublicUploadPath(storedPath) {
  const t = normalizeStoredUploadPath(storedPath)
  if (!t.startsWith('/uploads/')) return ''
  const rel = t.slice('/uploads/'.length)
  return path.join(uploadsRoot(), rel)
}

/** Async resolve — downloads from Spaces when local file is missing. */
export async function resolvePublicUploadPathAsync(storedPath) {
  const { ensureLocalUploadFile } = await import('./uploadFileStorage.js')
  const local = await ensureLocalUploadFile(storedPath)
  return local || resolvePublicUploadPath(storedPath)
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
  'Subjects_images',
]

/** Ensure upload subdirectories exist (safe on ephemeral or volume-backed storage). */
export function ensureUploadDirs() {
  const root = uploadsRoot()
  fs.mkdirSync(root, { recursive: true })
  for (const sub of UPLOAD_SUBDIRS) {
    fs.mkdirSync(path.join(root, sub), { recursive: true })
  }
}
