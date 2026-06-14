import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError } from '../lib/apiClient.js'
import { authClient } from '../lib/auth-client.js'
import { clearTermsAcceptance, setTermsAccepted } from '../lib/termsSession.js'
import { fetchStudentTermsStatus } from '../lib/studentPortal.js'
import { fetchFacultyTermsStatus } from '../lib/facultyPortal.js'
import { fetchAdminTermsStatus } from '../lib/adminPortal.js'

const TERMS_RETRY_MAX = 5
const TERMS_RETRY_DELAY_MS = 400

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTermsStatusWithRetry(portal) {
  let lastError = null
  for (let attempt = 0; attempt < TERMS_RETRY_MAX; attempt++) {
    try {
      if (portal === 'student') return await fetchStudentTermsStatus()
      if (portal === 'faculty') return await fetchFacultyTermsStatus()
      if (portal === 'admin') return await fetchAdminTermsStatus()
      return { accepted: false }
    } catch (e) {
      lastError = e
      if (e instanceof ApiError && e.status === 401 && attempt < TERMS_RETRY_MAX - 1) {
        if (import.meta.env.DEV) {
          console.log('[TermsGuard] terms-status 401, retry', attempt + 1, 'portal:', portal)
        }
        await sleep(TERMS_RETRY_DELAY_MS)
        continue
      }
      throw e
    }
  }
  throw lastError
}

function isTermsNotAcceptedError(e) {
  if (!(e instanceof ApiError)) return false
  if (e.status === 403) return true
  return e.code === 'TERMS_NOT_ACCEPTED'
}

/**
 * Blocks portal routes until terms are accepted (DB-backed).
 * @param {{ termsPath: string, portal?: 'student' | 'faculty' | 'admin' }} props
 */
export default function TermsGuard({ termsPath, portal = 'student' }) {
  const location = useLocation()
  const sessionUserId = authClient.useSession().data?.user?.id ?? ''
  const [dbChecked, setDbChecked] = useState(false)
  const [dbAccepted, setDbAccepted] = useState(false)
  const checkedRef = useRef(false)
  const prevSessionUserIdRef = useRef(sessionUserId)

  const pathname = location.pathname.replace(/\/+$/, '') || '/'
  const isOnTermsPage = pathname === termsPath || pathname.includes('/terms')

  useEffect(() => {
    if (prevSessionUserIdRef.current !== sessionUserId) {
      checkedRef.current = false
      setDbChecked(false)
      setDbAccepted(false)
      prevSessionUserIdRef.current = sessionUserId
    }

    if (isOnTermsPage) {
      setDbChecked(true)
      return undefined
    }

    if (checkedRef.current) {
      return undefined
    }

    let cancelled = false

    async function runCheck() {
      try {
        const status = await fetchTermsStatusWithRetry(portal)
        if (cancelled) return
        checkedRef.current = true
        const accepted = status.accepted === true
        setDbAccepted(accepted)
        if (accepted) {
          setTermsAccepted()
        } else {
          clearTermsAcceptance()
        }
        if (import.meta.env.DEV) {
          console.log('[TermsGuard] terms OK portal:', portal, 'accepted:', accepted)
        }
      } catch (e) {
        if (cancelled) return
        checkedRef.current = true
        if (import.meta.env.DEV) {
          console.log('[TermsGuard] terms check failed portal:', portal, e?.message || e)
        }
        if (e instanceof ApiError && (e.status === 401 || isTermsNotAcceptedError(e))) {
          setDbAccepted(false)
        } else {
          console.warn('[TermsGuard] terms-status check failed:', e?.message || e)
          setDbAccepted(false)
        }
        clearTermsAcceptance()
      } finally {
        if (!cancelled) setDbChecked(true)
      }
    }

    void runCheck()
    return () => {
      cancelled = true
    }
  }, [portal, isOnTermsPage, sessionUserId])

  if (isOnTermsPage) {
    return <Outlet />
  }

  if (!dbChecked) {
    return (
      <div className="flex h-svh items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">
        Checking terms acceptance…
      </div>
    )
  }

  if (!dbAccepted) {
    if (import.meta.env.DEV) {
      console.log('[TermsGuard] redirecting to terms:', termsPath)
    }
    return <Navigate to={termsPath} replace />
  }

  return <Outlet />
}
