/**
 * Load repo `.env` before tests build `process.env` for migrate + auth server.
 * Ensures `BETTER_AUTH_SECRET` matches local `.env` when set (per project convention).
 */
import '../server/env-bootstrap.js'

/** Prefer `BETTER_AUTH_SECRET` from `.env`; else deterministic default for CI. */
export const BETTER_AUTH_SECRET_FOR_TESTS =
  (process.env.BETTER_AUTH_SECRET || '').trim() ||
  'test-secret-abcdefghijklmnopqrstuvwxyz012345'

/**
 * Ask `server/auth.js` to clear JWT JWKS rows before Better Auth starts so signing
 * never hits "Failed to decrypt private key" from keys encrypted under another secret.
 */
export const BETTER_AUTH_RESET_JWKS_FOR_TESTS = '1'
