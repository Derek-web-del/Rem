import bcrypt from 'bcrypt'
import { verifyPassword as legacyVerifyPassword } from 'better-auth/crypto'

export const BCRYPT_COST = 12

export async function hashPasswordBcrypt(password) {
  return await bcrypt.hash(password, BCRYPT_COST)
}

/**
 * Better Auth expects `verify({ hash, password }) -> boolean`.
 * We accept legacy `salt:hex` hashes from Better Auth (scrypt) so existing dev DBs
 * can still sign in after the switch. (No automatic upgrade is possible here because
 * this verifier does not receive DB context.)
 */
export async function verifyPasswordCompat({ hash, password }) {
  const h = String(hash || '')
  // bcrypt hashes start with $2a$ / $2b$ / $2y$
  if (h.startsWith('$2a$') || h.startsWith('$2b$') || h.startsWith('$2y$')) {
    return await bcrypt.compare(password, h)
  }
  // Legacy Better Auth scrypt format: `${salt}:${hex(key)}`
  if (h.includes(':')) {
    return await legacyVerifyPassword({ hash: h, password })
  }
  return false
}

