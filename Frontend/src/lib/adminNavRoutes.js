/** Sidebar nav id ↔ browser path (under /admin). */
export const NAV_ID_TO_PATH = {
  dashboard: '/admin/institute_dashboard',
  curriculum: '/admin/curriculum',
  section: '/admin/section',
  students: '/admin/students',
  faculties: '/admin/faculties',
  subjects: '/admin/subjects',
  updates: '/admin/announcements',
  monitoring: '/admin/audit-logs',
  scoreOverwrite: '/admin/score-overwrite-requests',
  backup: '/admin/backup',
  archive: '/admin/archive-vault',
}

const PATH_TO_NAV_ID = Object.fromEntries(
  Object.entries(NAV_ID_TO_PATH).map(([id, path]) => [path, id]),
)

export function pathForNavId(navId) {
  return NAV_ID_TO_PATH[String(navId || '').trim()] || NAV_ID_TO_PATH.dashboard
}

export function navIdFromPath(pathname) {
  const p = String(pathname || '')
    .split('?')[0]
    .replace(/\/+$/, '')
  if (p === '/admin') return 'dashboard'
  return PATH_TO_NAV_ID[p] || null
}

export function isAdminAppPath(pathname) {
  return String(pathname || '').startsWith('/admin')
}
