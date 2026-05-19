import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatAuditModalEventDataJson } from '../Frontend/src/lib/formatAuditModalEventData.js'

describe('formatAuditModalEventDataJson', () => {
  it('formats user_account_changed without duplicate payload fields', () => {
    const json = formatAuditModalEventDataJson(
      {
        eventType: 'user_account_changed',
        actorName: 'Admin User',
        actorEmail: 'admin@test.com',
        detailsObj: {
          payload: {
            userId: 'uid-target',
            actorUserId: 'uid-admin',
            targetUserId: 'uid-target',
            updatedFields: ['First name'],
            changed_fields: ['First name'],
          },
          performed_by: { name: 'Admin User', email: 'admin@test.com' },
          target_user: { name: 'Jamie Jones', email: 'jamie@test.com', role: 'student' },
          detailedDiffs: { 'First name': { old: 'Jumpy', new: 'Jamie' } },
        },
      },
      'Profile Updated (Account)',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Profile Updated (Account)')
    assert.equal(data.actor.name, 'Admin User')
    assert.equal(data.target.role, 'student')
    assert.deepEqual(data.changes['First name'], { old: 'Jumpy', new: 'Jamie' })
    assert.equal(data.userId, undefined)
    assert.equal(data.payload, undefined)
    assert.equal(data.updatedFields, undefined)
  })

  it('formats session_created with user and login context', () => {
    const json = formatAuditModalEventDataJson(
      {
        eventType: 'session_created',
        detailsObj: {
          userId: 'abc',
          userName: 'Derek',
          userEmail: 'd@test.com',
          loginMethod: 'email',
          triggerContext: 'user',
          sessionId: 'sess-1',
        },
      },
      'New session created',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'New session created')
    assert.equal(data.user.name, 'Derek')
    assert.equal(data.loginMethod, 'email')
    assert.equal(data.context, 'user')
    assert.equal(data.sessionId, undefined)
  })
})
