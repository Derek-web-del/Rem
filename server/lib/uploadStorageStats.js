import fs from 'node:fs'
import path from 'node:path'
import { uploadsRoot } from './uploadPaths.js'

function countFilesInDir(dir) {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) count += 1
    }
  }
  return count
}

/** Lightweight upload volume summary for health / admin diagnostics. */
export function getUploadStorageStats() {
  const root = uploadsRoot()
  const configured = Boolean(String(process.env.UPLOAD_DIR || '').trim())
  const categories = ['curriculum', 'faculties', 'announcements', 'materials', 'assignments']
  const filesByCategory = {}
  for (const cat of categories) {
    filesByCategory[cat] = countFilesInDir(path.join(root, cat))
  }
  const totalFiles = Object.values(filesByCategory).reduce((sum, n) => sum + n, 0)
  return {
    uploads_root: root,
    upload_dir_env_set: configured,
    ephemeral_warning:
      !configured &&
      'App Platform disk is ephemeral — restore uploads from Droplet backup or use Spaces for persistence.',
    total_files: totalFiles,
    files_by_category: filesByCategory,
  }
}
