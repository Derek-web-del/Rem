import { verifyPasswordCompat } from '../password.js'

const failureBuckets = new Map()
const MAX_FAILURES = 3
const WINDOW_MS = 15 * 60 * 1000

function pruneBucket(bucket) {
  const now = Date.now()
  bucket.attempts = bucket.attempts.filter((ts) => now - ts < WINDOW_MS)
}

function recordFailure(userId) {
  const key = String(userId || '').trim()
  if (!key) return { blocked: false, remaining: MAX_FAILURES }
  let bucket = failureBuckets.get(key)
  if (!bucket) {
    bucket = { attempts: [] }
    failureBuckets.set(key, bucket)
  }
  pruneBucket(bucket)
  bucket.attempts.push(Date.now())
  const count = bucket.attempts.length
  return {
    blocked: count >= MAX_FAILURES,
    remaining: Math.max(0, MAX_FAILURES - count),
    failures: count,
  }
}

function clearFailures(userId) {
  failureBuckets.delete(String(userId || '').trim())
}

export function getRestorePasswordFailureState(userId) {
  const key = String(userId || '').trim()
  const bucket = failureBuckets.get(key)
  if (!bucket) return { blocked: false, failures: 0, remaining: MAX_FAILURES }
  pruneBucket(bucket)
  const count = bucket.attempts.length
  return {
    blocked: count >= MAX_FAILURES,
    failures: count,
    remaining: Math.max(0, MAX_FAILURES - count),
  }
}

/**
 * Verify the signed-in admin's password against the account table.
 * @returns {Promise<{ ok: true } | { ok: false, code: string, message: string, blocked?: boolean }>}
 */
export async function verifyAdminPassword(pool, userId, password) {
  const uid = String(userId || '').trim()
  const pwd = String(password || '')
  if (!uid) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Admin session required.' }
  }
  if (!pwd) {
    return { ok: false, code: 'PASSWORD_REQUIRED', message: 'Password is required to restore.' }
  }

  const state = getRestorePasswordFailureState(uid)
  if (state.blocked) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many failed password attempts. Try again in 15 minutes.',
      blocked: true,
    }
  }

  const { rows } = await pool.query(
    `SELECT a.password
     FROM account a
     INNER JOIN "user" u ON u.id = a."userId"
     WHERE a."userId" = $1 AND a."providerId" = 'credential'
     LIMIT 1`,
    [uid],
  )
  const hash = rows[0]?.password
  if (!hash) {
    return {
      ok: false,
      code: 'PASSWORD_NOT_AVAILABLE',
      message: 'Password confirmation is not available for this account.',
    }
  }

  const valid = await verifyPasswordCompat({ hash, password: pwd })
  if (!valid) {
    const failure = recordFailure(uid)
    return {
      ok: false,
      code: 'INVALID_PASSWORD',
      message: failure.blocked
        ? 'Too many failed password attempts. Try again in 15 minutes.'
        : `Incorrect password. ${failure.remaining} attempt(s) remaining.`,
      blocked: failure.blocked,
    }
  }

  clearFailures(uid)
  return { ok: true }
}
