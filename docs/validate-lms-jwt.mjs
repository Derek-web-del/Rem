import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwksCache = new Map()

function getJwks(jwksUrl) {
  const url = String(jwksUrl || process.env.LENLEARN_JWKS_URL || '').trim()
  if (!url) {
    throw new Error('JWT validation failed: jwksUrl is required.')
  }
  if (!jwksCache.has(url)) {
    jwksCache.set(url, createRemoteJWKSet(new URL(url)))
  }
  return jwksCache.get(url)
}

/**
 * Verify a LenLearn Better Auth JWT against the app JWKS endpoint.
 * @param {{ token: string, jwksUrl?: string, issuer?: string, audience?: string }} opts
 */
export async function validateLenlearnJwt(opts = {}) {
  const token = String(opts.token || '').trim()
  if (!token) {
    throw new Error('JWT validation failed: token is required.')
  }

  const jwksUrl = opts.jwksUrl || process.env.LENLEARN_JWKS_URL
  const issuer = opts.issuer ?? process.env.LENLEARN_EXPECTED_ORIGIN ?? undefined
  const audience = opts.audience ?? process.env.LENLEARN_EXPECTED_ORIGIN ?? undefined
  const requireIssAud =
    opts.requireIssAud === true ||
    String(process.env.LENLEARN_REQUIRE_ISS_AUD || '').trim() === '1'

  const verifyOpts = {}
  if (issuer || requireIssAud) verifyOpts.issuer = issuer
  if (audience || requireIssAud) verifyOpts.audience = audience

  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), verifyOpts)
    return { payload }
  } catch (err) {
    const msg = err?.message ? String(err.message) : String(err)
    throw new Error(`JWT validation failed: ${msg}`)
  }
}
