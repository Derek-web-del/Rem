import { Navigate, Outlet } from 'react-router-dom'
import { authClient } from '../lib/auth-client.js'

/** Faculty / teacher LMS — blocks everyone except role `teacher` or `faculty`. */
export default function TeacherProtectedRoute() {
  const sessionState = authClient.useSession()
  const pending = sessionState.isPending
  const sessionData = sessionState.data
  const session = sessionData?.session
  const sessionUser = sessionData?.user

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
    return <Navigate to="/login" replace />
  }

  const role = String(sessionUser?.role || '').trim().toLowerCase()
  if (role !== 'teacher' && role !== 'faculty') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
