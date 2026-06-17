import { Navigate, Outlet } from 'react-router-dom'
import { loginPathWithPortalId } from '../lib/loginRoutes.js'
import { authClient } from '../lib/auth-client.js'
import { INSTITUTE_ADMIN_EMAIL } from '../../../shared/constants.js'
import { markAccessDenied, redirectPathForWrongRole } from '../lib/roleAccess.js'

/** Faculty / teacher LMS — blocks everyone except role `teacher` or `faculty`. */
export default function TeacherProtectedRoute() {
  const sessionState = authClient.useSession()
  const pending = sessionState.isPending
  const sessionData = sessionState.data
  const session = sessionData?.session
  const sessionUser = sessionData?.user

  if (import.meta.env.DEV && !pending) {
    const role = String(sessionUser?.role || '').trim().toLowerCase()
    console.log('[GUARD] Session:', !!session, 'role:', role)
  }

  if (pending) {
    return (
      <div
        className="flex h-svh min-h-0 items-center justify-center overflow-hidden bg-neutral-100 font-[Inter,system-ui,sans-serif] text-sm font-medium text-neutral-600"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        Loading…
      </div>
    )
  }

  if (!session) {
    if (import.meta.env.DEV) console.log('[GUARD] Decision: redirect login (no session)')
    return <Navigate to={loginPathWithPortalId('FACULTY')} replace />
  }

  const role = String(sessionUser?.role || '').trim().toLowerCase()
  const isFaculty = role === 'teacher' || role === 'faculty'
  if (!isFaculty) {
    const dest = redirectPathForWrongRole(role, 'teacher')
    if (import.meta.env.DEV) console.log('[GUARD] Decision: wrong role redirect', dest)
    if (role === 'student') markAccessDenied()
    return <Navigate to={dest || '/login'} replace />
  }

  return <Outlet />
}
