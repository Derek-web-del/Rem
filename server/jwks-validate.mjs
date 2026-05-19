import { createLocalJWKSet } from 'jose'

/**
 * Throws if the body is not a usable JWKS document (RFC 7517-style JSON).
 * Uses jose to validate structure the same way verifiers do.
 *
 * @param {unknown} body Parsed JSON from GET /api/auth/jwks
 */
export function assertValidJwksJson(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('JWKS: response must be a JSON object')
  }
  const keys = /** @type {{ keys?: unknown }} */ (body).keys
  if (!Array.isArray(keys)) {
    throw new Error('JWKS: missing "keys" array')
  }
  createLocalJWKSet(/** @type {import('jose').JSONWebKeySet} */ (body))
}
