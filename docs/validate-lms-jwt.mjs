import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Validate a LenLearn JWT using LenLearn's remote JWKS.
 *
 * Claims (LenLearn JWT plugin):
 * - **sub**: subject (user id; primary identifier for authZ)
 * - **id**: duplicate of user id for convenience (stable app claim)
 * - **email**: support/logging correlation in external services
 * - **role**: coarse authorization in external services
 * - **iss/aud**: must match LenLearn origin (prevents token replay across envs)
 * - **iat/exp**: issued-at / expiry
 *
 * @param {object} args
 * @param {string} args.token The JWT string (e.g. from Authorization: Bearer <token>)
 * @param {string} [args.jwksUrl] Full JWKS URL (defaults to LENLEARN_JWKS_URL or localhost dev)
 * @param {string} [args.issuer] Expected issuer. In production, set this to your deployed BETTER_AUTH_URL origin.
 * @param {string|string[]} [args.audience] Expected audience. In production, set this to your deployed BETTER_AUTH_URL origin.
 */
export async function validateLenlearnJwt({
  token,
  jwksUrl = process.env.LENLEARN_JWKS_URL || 'http://localhost:5173/api/auth/jwks',
  issuer,
  audience,
}) {
  if (!token || typeof token !== 'string') {
    throw new Error('validateLenlearnJwt: token is required')
  }

  const expectedOriginRaw =
    (process.env.LENLEARN_EXPECTED_ORIGIN || process.env.BETTER_AUTH_URL || '').trim()
  const expectedOrigin = expectedOriginRaw ? new URL(expectedOriginRaw).origin : ''

  // In production, you should explicitly validate issuer & audience to prevent cross-environment replay.
  const requireIssAud =
    process.env.LENLEARN_REQUIRE_ISS_AUD === '1' || process.env.NODE_ENV === 'production'
  const effectiveIssuer = issuer || expectedOrigin || undefined
  const effectiveAudience = audience || expectedOrigin || undefined
  if (requireIssAud && (!effectiveIssuer || !effectiveAudience)) {
    throw new Error(
      'validateLenlearnJwt: issuer/audience are required (set LENLEARN_EXPECTED_ORIGIN or pass issuer/audience)',
    )
  }

  const JWKS = createRemoteJWKSet(new URL(jwksUrl))

  const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
    ...(effectiveIssuer ? { issuer: effectiveIssuer } : {}),
    ...(effectiveAudience ? { audience: effectiveAudience } : {}),
  })

  return { payload, protectedHeader }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const token = process.argv[2]
  if (!token) {
    console.error('Usage: node docs/validate-lms-jwt.mjs <token>')
    process.exit(2)
  }
  try {
    const { payload, protectedHeader } = await validateLenlearnJwt({ token })
    console.log('protectedHeader:', protectedHeader)
    console.log('payload:', payload)
  } catch (e) {
    console.error('JWT validation failed:', e?.message || e)
    process.exit(1)
  }
}

