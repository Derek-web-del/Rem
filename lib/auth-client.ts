/**
 * Reference mirror of `Frontend/src/lib/auth-client.js`.
 */
import { dashClient, sentinelClient } from '@better-auth/infra/client'
import { createAuthClient } from 'better-auth/react'
import { adminClient, jwtClient, twoFactorClient, usernameClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: import.meta.env?.VITE_AUTH_BASE_URL || '',
  fetchOptions: { credentials: 'include' },
  plugins: [
    usernameClient(),
    twoFactorClient(),
    adminClient(),
    jwtClient(),
    dashClient({
      resolveUserId: ({ userId, user, session }) => userId || user?.id || session?.user?.id,
    }),
    sentinelClient(),
  ],
})
