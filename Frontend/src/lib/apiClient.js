import { authClient } from './auth-client.js'
import { markAccessDenied, normalizeRole, redirectPathForWrongRole } from './roleAccess.js'
import { apiUrl } from './lmsStateStorage.js'

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string }} [opts]
   */
  constructor(message, { status = 0, code } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function redirectToLogin() {
  if (typeof window === 'undefined') return
  const path = window.location.pathname || ''
  if (path.startsWith('/login')) return
  window.location.assign('/login')
}

function portalAreaFromPathname(pathname) {
  const path = String(pathname || '')
  if (path.startsWith('/student')) return 'student'
  if (path.startsWith('/teacher')) return 'teacher'
  if (path.startsWith('/admin')) return 'admin'
  return 'admin'
}

async function redirectForForbidden() {
  if (typeof window === 'undefined') return
  let role = ''
  try {
    const sessionRes = await authClient.getSession()
    role = normalizeRole(sessionRes?.data?.user?.role)
  } catch {
    /* ignore */
  }
  const area = portalAreaFromPathname(window.location.pathname)
  const dest = redirectPathForWrongRole(role, area) || '/login'
  if (area === 'student' && role !== 'student' && role !== 'admin') {
    markAccessDenied()
  }
  if (dest && !window.location.pathname.startsWith(dest)) {
    window.location.assign(dest)
  }
}

/**
 * @param {string} path
 * @param {RequestInit & { softAuth?: boolean }} [options]
 *   softAuth — on 401/403, throw without signOut/redirect (for post-OTP terms bootstrap)
 */
export default async function apiFetch(path, options = {}) {
  const { softAuth = false, ...fetchOptions } = options
  const url = path.startsWith('http') ? path : apiUrl(path)
  const res = await fetch(url, {
    ...fetchOptions,
    credentials: 'include',
    headers: {
      ...(fetchOptions.headers || {}),
    },
  })

  if (res.status === 401) {
    if (!softAuth) {
      try {
        await authClient.signOut()
      } catch {
        /* ignore */
      }
      redirectToLogin()
    }
    throw new ApiError('Session expired. Please sign in again.', { status: 401, code: 'UNAUTHORIZED' })
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}))
    if (!softAuth) {
      await redirectForForbidden()
    }
    throw new ApiError(
      String(data?.message || data?.error || 'Access denied.'),
      { status: 403, code: data?.error },
    )
  }

  if (res.status === 503) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('lenlearn:postgres-offline'))
    }
    const data = await res.json().catch(() => ({}))
    throw new ApiError(
      String(data?.message || data?.error || 'System is currently offline. Please try again.'),
      { status: 503, code: data?.error },
    )
  }

  if (!res.ok) {
    if (res.status < 500 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('lenlearn:postgres-online'))
    }
    const data = await res.json().catch(() => ({}))
    throw new ApiError(
      String(data?.message || data?.error || `Request failed (${res.status}).`),
      { status: res.status, code: data?.error },
    )
  }

  return res
}

export { apiFetch }
