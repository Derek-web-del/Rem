import { lazy, Suspense, useCallback, useEffect, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { clearInstituteTermsAcceptance } from '../TermsAndConditions.jsx'
import { useIdleSession } from '../hooks/useIdleSession.js'
import { authClient } from '../lib/auth-client.js'
import { navIdFromPath } from '../lib/adminNavRoutes.js'
import { INSTITUTE_ADMIN_EMAIL } from '../../../shared/constants.js'

const InstituteDashboard = lazy(() => import('../modules/dashboard/InstituteDashboardModule.jsx'))

const IDLE_MS = 30 * 60 * 1000
const SESSION_LOST_DEBOUNCE_MS = 3500

function isInstituteAdminUser(user) {
  return (
    user?.role === 'admin' ||
    String(user?.email || '').toLowerCase() === INSTITUTE_ADMIN_EMAIL.toLowerCase()
  )
}

export default function AdminDashboardRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionState = authClient.useSession()
  const sessionPending = sessionState.isPending
  const session = sessionState.data?.session
  const sessionUser = sessionState.data?.user
  const hadActiveSessionRef = useRef(false)

  useEffect(() => {
    if (session) hadActiveSessionRef.current = true
  }, [session])

  useEffect(() => {
    const id = navIdFromPath(location.pathname)
    if (!id) {
      navigate('/admin/institute_dashboard', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    if (session) return undefined
    if (sessionPending) return undefined
    if (!hadActiveSessionRef.current) return undefined

    let cancelled = false
    const id = window.setTimeout(async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        const { data } = await authClient.getSession()
        if (data?.session) return
      } catch {
        return
      }
      if (cancelled) return
      navigate('/login', { replace: true })
    }, SESSION_LOST_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [session, sessionPending, navigate])

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== 'visible') return
      if (session) return
      void authClient.getSession()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [session])

  const onIdleSignOut = useCallback(async () => {
    clearInstituteTermsAcceptance()
    await authClient.signOut()
    navigate('/login', { replace: true })
  }, [navigate])

  useIdleSession({
    enabled: !!session,
    timeoutMs: IDLE_MS,
    onIdle: onIdleSignOut,
  })

  async function handleDashboardLogout() {
    clearInstituteTermsAcceptance()
    await authClient.signOut()
    navigate('/login', { replace: true })
  }

  if (sessionPending) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
        Loading dashboard…
      </div>
    )
  }

  if (!session || !isInstituteAdminUser(sessionUser)) {
    return <Navigate to="/login" replace />
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
          Loading dashboard…
        </div>
      }
    >
      <InstituteDashboard onLogout={handleDashboardLogout} schoolName="Glendale School, Inc." />
    </Suspense>
  )
}
