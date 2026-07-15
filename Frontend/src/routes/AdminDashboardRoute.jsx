import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { clearTermsAcceptance, isTermsAccepted, setTermsAccepted } from '../lib/termsSession.js'
import { fetchAdminTermsStatus } from '../lib/adminPortal.js'
import { useIdleSession } from '../hooks/useIdleSession.js'
import { authClient } from '../lib/auth-client.js'
import { navIdFromPath } from '../lib/adminNavRoutes.js'
import { INSTITUTE_ADMIN_EMAIL } from '../../../shared/constants.js'
import { loginPathWithPortalId } from '../lib/loginRoutes.js'
import { markAccessDenied } from '../lib/roleAccess.js'

const InstituteDashboard = lazy(() => import('../modules/dashboard/InstituteDashboardModule.jsx'))
const AdminLayout = lazy(() => import('../layouts/AdminLayout.jsx'))
const AdminTermsPage = lazy(() => import('../pages/admin/AdminTermsPage.jsx'))
const AdminLessonFormPage = lazy(() => import('../pages/admin/AdminLessonFormPage.jsx'))

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
  const [adminTermsChecked, setAdminTermsChecked] = useState(false)
  const [adminTermsAccepted, setAdminTermsAccepted] = useState(false)

  useEffect(() => {
    if (session) hadActiveSessionRef.current = true
  }, [session])

  useEffect(() => {
    if (!session) {
      setAdminTermsChecked(false)
      setAdminTermsAccepted(false)
      return undefined
    }
    let cancelled = false
    void (async () => {
      try {
        const status = await fetchAdminTermsStatus()
        if (cancelled) return
        const ok = status.accepted === true
        setAdminTermsAccepted(ok)
        if (ok) setTermsAccepted()
      } catch {
        if (!cancelled) setAdminTermsAccepted(isTermsAccepted())
      } finally {
        if (!cancelled) setAdminTermsChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    const id = navIdFromPath(location.pathname)
    const onLessonForm = /^\/admin\/subjects\/[^/]+\/lessons/.test(location.pathname.replace(/\/+$/, ''))
    if (!id && !onLessonForm && location.pathname.replace(/\/+$/, '') !== '/admin/terms') {
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
      navigate(loginPathWithPortalId('INSTITUTE'), { replace: true })
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
    clearTermsAcceptance()
    await authClient.signOut()
    navigate(loginPathWithPortalId('INSTITUTE'), { replace: true })
  }, [navigate])

  useIdleSession({
    enabled: !!session,
    timeoutMs: IDLE_MS,
    onIdle: onIdleSignOut,
  })

  async function handleDashboardLogout() {
    clearTermsAcceptance()
    await authClient.signOut()
    navigate(loginPathWithPortalId('INSTITUTE'), { replace: true })
  }

  if (sessionPending) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
        Loading dashboard…
      </div>
    )
  }

  if (!session || !isInstituteAdminUser(sessionUser)) {
    if (session && sessionUser) {
      const role = String(sessionUser?.role || '').trim().toLowerCase()
      if (role === 'student') {
        markAccessDenied()
        return <Navigate to="/student/dashboard" replace />
      }
      if (role === 'teacher' || role === 'faculty') {
        return <Navigate to="/teacher/dashboard" replace />
      }
    }
    return <Navigate to={loginPathWithPortalId('INSTITUTE')} replace />
  }

  const pathname = location.pathname.replace(/\/+$/, '') || '/admin'
  const onTermsPage = pathname === '/admin/terms'

  if (onTermsPage) {
    return (
      <Suspense
        fallback={
          <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
            Loading…
          </div>
        }
      >
        <AdminLayout onLogout={handleDashboardLogout}>
          <AdminTermsPage />
        </AdminLayout>
      </Suspense>
    )
  }

  if (!adminTermsChecked) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
        Checking terms acceptance…
      </div>
    )
  }

  if (!adminTermsAccepted && !isTermsAccepted()) {
    return <Navigate to="/admin/terms" replace />
  }

  const onAdminLessonForm = /^\/admin\/subjects\/[^/]+\/lessons/.test(pathname)
  if (onAdminLessonForm) {
    const isEdit = /\/edit$/.test(pathname)
    return (
      <Suspense
        fallback={
          <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
            Loading…
          </div>
        }
      >
        <AdminLayout onLogout={handleDashboardLogout}>
          <AdminLessonFormPage mode={isEdit ? 'edit' : 'add'} />
        </AdminLayout>
      </Suspense>
    )
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
