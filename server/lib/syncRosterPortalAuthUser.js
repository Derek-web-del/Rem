import { findAuthUserIdByEmail, findAuthUserIdByUsername } from '../api/logs.js'
import { validatePasswordStrength, validatePortalUsername } from './security.js'
import { provisionPortalAuthUser } from './provisionPortalAuthUser.js'

export class RosterAuthSyncError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'AUTH_SYNC_FAILED') {
    super(message)
    this.name = 'RosterAuthSyncError'
    this.code = code
  }
}

/**
 * Create or update a student/teacher Better Auth user for registrar roster saves.
 * Uses direct DB provisioning (no Better Auth admin API).
 * @returns {Promise<{ authUserId: string }>}
 */
export async function syncRosterPortalAuthUser(auth, pool, opts) {
  const email = String(opts.email || '').trim().toLowerCase()
  const name = String(opts.name || '').trim() || email
  const username = String(opts.username || '').trim().toLowerCase()
  const password = String(opts.password || '').trim()
  const role = opts.role === 'teacher' ? 'teacher' : 'student'

  if (!email || !username) {
    throw new RosterAuthSyncError('Email and login ID are required.', 'BAD_REQUEST')
  }

  try {
    validatePortalUsername(username, 'Login ID')
  } catch (e) {
    throw new RosterAuthSyncError(e.message, e.code || 'INVALID_USERNAME')
  }

  let existingAuthUserId = String(opts.existingAuthUserId || '').trim()
  if (!existingAuthUserId) existingAuthUserId = (await findAuthUserIdByEmail(email)) || ''
  if (!existingAuthUserId && username) {
    existingAuthUserId = (await findAuthUserIdByUsername(username)) || ''
  }

  const isCreate = !existingAuthUserId
  if (isCreate && !password) {
    throw new RosterAuthSyncError(
      role === 'teacher'
        ? 'Faculty password is required to create a new login.'
        : 'Student password is required to create a new login.',
      'BAD_REQUEST',
    )
  }

  if (password) {
    try {
      validatePasswordStrength(password, 'Password')
    } catch (e) {
      throw new RosterAuthSyncError(e.message, e.code || 'WEAK_PASSWORD')
    }
  }

  const authUserId = await provisionPortalAuthUser(auth, pool, {
    email,
    name,
    password: password || undefined,
    username,
    role,
    existingAuthUserId: existingAuthUserId || undefined,
  })

  if (!authUserId) {
    throw new RosterAuthSyncError(
      'Could not create or update the login account.',
      'AUTH_USER_SYNC_FAILED',
    )
  }

  return { authUserId }
}

/** @param {unknown} err */
export function rosterAuthSyncErrorResponse(err) {
  if (err instanceof RosterAuthSyncError) {
    return { status: 400, body: { error: err.code, message: err.message } }
  }
  return null
}
