import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { authClient } from '../lib/auth-client.js'
import { clearTermsAcceptance } from '../lib/termsSession.js'
import { loginPathWithPortalId } from '../lib/loginRoutes.js'
import { useIdleSession } from '../hooks/useIdleSession.js'
import { warmStudentOfflineCache, resetStudentTermsOnLogout } from '../lib/studentPortal.js'
import { isOnline } from '../lib/offlineSync.js'
import StudentSidebar from '../pages/students/StudentSidebar.jsx'
import OfflineBanner from '../components/OfflineBanner.jsx'
import SystemOfflineBanner from '../components/SystemOfflineBanner.jsx'

const IDLE_MS = 30 * 60 * 1000
const OFFLINE_WARM_KEY = 'lenlearn:student-offline-warmed'

function StudentOutletFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
      Loading…
    </div>
  )
}

export default function StudentLayout() {
  const parentContext = useOutletContext() || {}
  const [sidebarNavLocked, setSidebarNavLocked] = useState(false)

  const logoutToPortal = useCallback(async () => {
    clearTermsAcceptance()
    await resetStudentTermsOnLogout()
    await authClient.signOut()
    /** Hard redirect (not client-side navigate) — avoids a stale cached session briefly
     * re-triggering App.jsx's post-login redirect (which would bounce back to /student/terms
     * instead of landing cleanly on the login page). */
    window.location.assign(loginPathWithPortalId('STUDENT'))
  }, [])

  useIdleSession({
    enabled: true,
    timeoutMs: IDLE_MS,
    onIdle: logoutToPortal,
  })

  useEffect(() => {
    if (!isOnline()) return
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OFFLINE_WARM_KEY)) return
    try {
      sessionStorage.setItem(OFFLINE_WARM_KEY, '1')
    } catch {
      /* ignore */
    }
    void warmStudentOfflineCache()
  }, [])

  return (
    <div
      className="flex h-svh min-h-0 overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <StudentSidebar onLogout={logoutToPortal} navLocked={sidebarNavLocked} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100">
        <OfflineBanner />
        <SystemOfflineBanner />
        <Suspense fallback={<StudentOutletFallback />}>
          <Outlet
            context={{ ...parentContext, logoutToPortal, setSidebarNavLocked }}
          />
        </Suspense>
      </div>
    </div>
  )
}
