import { loginPathWithPortalId } from './loginRoutes.js'

export const ACCESS_DENIED_STORAGE_KEY = 'lenlearn:access-denied'

export const ROLE_HOME = {
  admin: '/admin/institute_dashboard',
  faculty: '/teacher/dashboard',
  teacher: '/teacher/dashboard',
  student: '/student/dashboard',
}

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

export function homePathForRole(role) {
  const r = normalizeRole(role)
  if (r === 'admin') return ROLE_HOME.admin
  if (r === 'student') return ROLE_HOME.student
  if (r === 'teacher' || r === 'faculty') return ROLE_HOME.faculty
  return '/login'
}

/** Login path for a portal tile id (INSTITUTE | FACULTY | STUDENT). */
export function loginPathForPortal(portalRoleId) {
  return loginPathWithPortalId(portalRoleId)
}

/**
 * Resolve effective role for portal matching (institute admin email on Institute tile).
 * @param {{ role?: string, email?: string } | null | undefined} user
 * @param {string | null | undefined} portalRoleId
 * @param {string} [instituteAdminEmail]
 */
export function resolveAuthRoleForPortal(user, portalRoleId, instituteAdminEmail = '') {
  const role = normalizeRole(user?.role)
  if (role === 'admin') return 'admin'
  const adminEmail = String(instituteAdminEmail || '').trim().toLowerCase()
  const userEmail = String(user?.email || '').trim().toLowerCase()
  if (portalRoleId === 'INSTITUTE' && adminEmail && userEmail === adminEmail) return 'admin'
  return role
}

/** True when the selected login portal matches the user's resolved role. */
export function portalMatchesUserRole(portalRoleId, resolvedRole) {
  if (!portalRoleId) return false
  const role = normalizeRole(resolvedRole)
  if (portalRoleId === 'INSTITUTE') return role === 'admin'
  if (portalRoleId === 'FACULTY') return role === 'teacher' || role === 'faculty'
  if (portalRoleId === 'STUDENT') return role === 'student'
  return false
}

export function portalMismatchMessage(portalRoleId, resolvedRole) {
  const role = normalizeRole(resolvedRole)
  if (role === 'student') {
    return 'This account is a Student account. Use the Student login.'
  }
  if (role === 'teacher' || role === 'faculty') {
    return 'This account is a Faculty account. Use the Faculty login.'
  }
  if (role === 'admin') {
    return 'This account is an Institute admin account. Use the Institute login.'
  }
  if (portalRoleId === 'INSTITUTE') {
    return 'This account is not an Institute admin. Use the correct login portal for your role.'
  }
  if (portalRoleId === 'FACULTY') {
    return 'This account is not a Faculty account. Use the correct login portal for your role.'
  }
  if (portalRoleId === 'STUDENT') {
    return 'This account is not a Student account. Use the correct login portal for your role.'
  }
  return 'This account does not match the selected login portal.'
}

export function markAccessDenied() {
  try {
    sessionStorage.setItem(ACCESS_DENIED_STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumeAccessDenied() {
  try {
    if (sessionStorage.getItem(ACCESS_DENIED_STORAGE_KEY) === '1') {
      sessionStorage.removeItem(ACCESS_DENIED_STORAGE_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function redirectPathForWrongRole(currentRole, area) {
  const role = normalizeRole(currentRole)
  if (area === 'student') {
    if (role === 'student') return null
    if (role === 'admin') return ROLE_HOME.admin
    return ROLE_HOME.faculty
  }
  if (area === 'teacher') {
    if (role === 'teacher' || role === 'faculty') return null
    if (role === 'student') return ROLE_HOME.student
    if (role === 'admin') return ROLE_HOME.admin
    return '/login'
  }
  if (area === 'admin') {
    if (role === 'admin') return null
    if (role === 'student') return ROLE_HOME.student
    if (role === 'teacher' || role === 'faculty') return ROLE_HOME.faculty
    return '/login'
  }
  return '/login'
}
