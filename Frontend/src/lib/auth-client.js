import { dashClient, sentinelClient } from '@better-auth/infra/client'
import { createAuthClient } from 'better-auth/react'
import {
  adminClient,
  jwtClient,
  twoFactorClient,
  usernameClient,
} from 'better-auth/client/plugins'

/**
 * Canonical auth for LenLearn: Better Auth httpOnly session cookies (not Bearer JWT on internal APIs).
 * See docs/AUTH.md. JWT via authClient.token() is auxiliary only (jwt-bearer.js).
 *
 * Infra `sentinelClient` runs fingerprint + optional KV identify before **every** auth fetch
 * (including `/two-factor/verify-otp`), which can add seconds on slow networks and makes OTP feel stuck.
 * Enable explicitly in dev with `VITE_BETTER_AUTH_INFRA_CLIENT=1` if you need Sentinel challenges locally.
 */
const enableInfraAuthPlugins =
  String(import.meta.env.VITE_BETTER_AUTH_INFRA_CLIENT || '').trim() === '1'

export const authClient = createAuthClient({
  // In dev, Vite proxies /api/auth to the local auth server, so empty baseURL works.
  // When the API is on another origin (e.g. ngrok), set `VITE_AUTH_BASE_URL` to that origin;
  // LMS state (`/api/v1/state`) uses the same value unless `VITE_LMS_API_BASE_URL` overrides it.
  baseURL: import.meta.env.VITE_AUTH_BASE_URL || '',
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    usernameClient(),
    twoFactorClient(),
    adminClient(),
    jwtClient(),
    dashClient({
      resolveUserId: ({ userId, user, session }) =>
        userId || user?.id || session?.user?.id,
    }),
    ...(enableInfraAuthPlugins ? [sentinelClient()] : []),
  ],
})

export const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

export function passwordPolicyHint() {
  return 'At least 8 characters with uppercase, lowercase, a number, and a symbol.'
}
