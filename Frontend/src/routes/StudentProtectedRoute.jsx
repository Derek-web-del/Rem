import { Navigate, Outlet } from 'react-router-dom'
import { authClient } from '../lib/auth-client.js'

/** Student LMS — blocks everyone except role `student`. */
export default function StudentProtectedRoute() {
  const sessionState = authClient.useSession()
  const pending = sessionState.isPending
  const sessionData = sessionState.data
  const session = sessionData?.session
  const sessionUser = sessionData?.user

  if (pending) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login/student" replace />
  }

  const role = String(sessionUser?.role || '').trim().toLowerCase()
  if (role !== 'student') {
    return <Navigate to="/login/student" replace />
  }

  return <Outlet context={{ sessionUser }} />
}
