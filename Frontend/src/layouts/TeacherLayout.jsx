import { Suspense, useCallback, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { authClient } from '../lib/auth-client.js'
import { useIdleSession } from '../hooks/useIdleSession.js'
import { clearTermsAcceptance } from '../lib/termsSession.js'
import TeacherSidebar from '../pages/teachers/TeacherSidebar.jsx'
import OfflineBanner from '../components/OfflineBanner.jsx'
import SystemOfflineBanner from '../components/SystemOfflineBanner.jsx'

const IDLE_MS = 30 * 60 * 1000

function TeacherOutletFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
      Loading…
    </div>
  )
}

export default function TeacherLayout() {
  const navigate = useNavigate()
  const [sidebarNavLocked, setSidebarNavLocked] = useState(false)

  const sessionState = authClient.useSession()
  const sessionData = sessionState.data
  const session = sessionData?.session

  const logoutToPortal = useCallback(async () => {
    clearTermsAcceptance()
    await authClient.signOut()
    navigate('/login', { replace: true })
  }, [navigate])

  useIdleSession({
    enabled: !!session,
    timeoutMs: IDLE_MS,
    onIdle: logoutToPortal,
  })

  return (
    <div
      className="flex h-svh min-h-0 overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <TeacherSidebar onLogout={logoutToPortal} navLocked={sidebarNavLocked} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-neutral-100">
        <OfflineBanner />
        <SystemOfflineBanner />
        <Suspense fallback={<TeacherOutletFallback />}>
          <Outlet context={{ logoutToPortal, setSidebarNavLocked }} />
        </Suspense>
      </div>
    </div>
  )
}
