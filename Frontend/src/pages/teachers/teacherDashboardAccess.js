/**
 * RBAC for the teacher dashboard — Better Auth roles `teacher` or `faculty` only.
 */
export function canAccessTeacherDashboard(sessionUser) {
  if (!sessionUser) return false
  const role = String(sessionUser.role || '').toLowerCase()
  return role === 'teacher' || role === 'faculty'
}
