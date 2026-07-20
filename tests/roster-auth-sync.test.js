import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RosterAuthSyncError,
  rosterAuthSyncErrorResponse,
  syncRosterPortalAuthUser,
} from '../server/lib/syncRosterPortalAuthUser.js'

describe('syncRosterPortalAuthUser', () => {
  it('requires email and login ID', async () => {
    await assert.rejects(
      () => syncRosterPortalAuthUser(null, null, { email: '', username: '', role: 'student' }),
      (err) => err instanceof RosterAuthSyncError && err.code === 'BAD_REQUEST',
    )
  })

  it('rejects invalid login ID format', async () => {
    await assert.rejects(
      () =>
        syncRosterPortalAuthUser(null, null, {
          email: 's@test.edu',
          username: 'bad id',
          password: 'Test1234!',
          role: 'student',
        }),
      (err) => err instanceof RosterAuthSyncError && err.code === 'INVALID_USERNAME',
    )
  })

  it('requires password when creating a new auth user', async () => {
    const pool = { query: async () => ({ rows: [] }) }
    await assert.rejects(
      () =>
        syncRosterPortalAuthUser({ api: {} }, pool, {
          email: 'new@test.edu',
          username: 'new.student',
          role: 'student',
        }),
      (err) => err instanceof RosterAuthSyncError && err.code === 'BAD_REQUEST',
    )
  })

  it('maps RosterAuthSyncError to client-safe response', () => {
    const err = new RosterAuthSyncError('Nope', 'WEAK_PASSWORD')
    const mapped = rosterAuthSyncErrorResponse(err)
    assert.equal(mapped?.status, 400)
    assert.equal(mapped?.body?.error, 'WEAK_PASSWORD')
    assert.equal(mapped?.body?.message, 'Nope')
  })
})

describe('registrar roster login routing', () => {
  it('homePathForRole routes student and teacher portals', async () => {
    const { homePathForRole } = await import('../Frontend/src/lib/roleAccess.js')
    assert.equal(homePathForRole('student'), '/student/dashboard')
    assert.equal(homePathForRole('teacher'), '/teacher/dashboard')
    assert.equal(homePathForRole('faculty'), '/teacher/dashboard')
  })
})
