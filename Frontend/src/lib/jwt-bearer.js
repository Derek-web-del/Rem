// TODO: migrate to apiFetch from ./apiClient.js
import { authClient } from './auth-client.js'

/**
 * Fetches a JWT for the current session (Better Auth JWT plugin GET /api/auth/token).
 * Requires an active session cookie (same as other authClient calls).
 *
 * @returns {Promise<string>}
 */
export async function getSessionJwtToken() {
  const result = await authClient.token()
  if (result.error) {
    const msg =
      result.error?.message ||
      result.error?.statusText ||
      `HTTP ${result.error?.status ?? '?'}`
    throw new Error(`authClient.token() failed: ${msg}`)
  }
  const token = result.data?.token
  if (typeof token !== 'string' || !token) {
    throw new Error('authClient.token() returned no token')
  }
  return token
}

/**
 * Example: call an external API with Authorization: Bearer <JWT from session>.
 *
 * @param {string} externalUrl Absolute URL (different origin is fine; only the Bearer header is sent).
 * @param {RequestInit} [init] Passed to fetch (headers are merged; Authorization is set last).
 * @returns {Promise<Response>}
 */
export async function fetchExternalWithSessionBearer(externalUrl, init = {}) {
  const token = await getSessionJwtToken()
  const headers = new Headers(init.headers ?? undefined)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(externalUrl, { ...init, headers })
}
