/**
 * Reference mirror of `server/auth.js` (canonical Better Auth server config).
 * LenLearn runs auth from the Node server, not from this file directly.
 */
import { dash, sentinel } from '@better-auth/infra'
import { betterAuth } from 'better-auth'
import { admin, jwt, twoFactor, username } from 'better-auth/plugins'

export const auth = betterAuth({
  // database, secret, trustedOrigins — see server/auth.js
  plugins: [
    username(),
    admin({ defaultRole: 'user' }),
    jwt(),
    twoFactor(),
    sentinel({
      /* security options — see server/auth.js */
    }),
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY,
      activityTracking: {
        enabled: !!process.env.BETTER_AUTH_API_KEY,
      },
    }),
  ],
})
