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
      'Session started',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Session started')
    assert.equal(data.user.name, 'Derek')
    assert.equal(data.loginMethod, 'email')
    assert.equal(data.context, 'user')
    assert.equal(data.sessionId, undefined)
    assert.equal(data.ipAddress, undefined)
  })

  it('formats TERMS_ACCEPTED with portal and user', () => {
    const json = formatAuditModalEventDataJson(
      {
        activityType: 'TERMS_ACCEPTED',
        detailsObj: {
          type: 'terms_accepted',
          eventType: 'terms_accepted',
          userName: 'Trap Hook',
          userEmail: 'trap@school.edu',
          portal: 'student',
          acceptedAt: '2026-06-07T09:37:05.000Z',
          description: 'Trap Hook has accepted the Terms & Conditions',
        },
      },
      'Terms & Conditions Accepted',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Terms & Conditions Accepted')
    assert.equal(data.user.name, 'Trap Hook')
    assert.equal(data.portal, 'Student portal')
  })

  it('formats AUTH_LOCKOUT with userId username portal and reason', () => {
    const json = formatAuditModalEventDataJson(
      {
        activityType: 'AUTH_LOCKOUT',
        userId: 'uid-faculty-1',
        detailsObj: {
          type: 'auth_lockout',
          targetUserId: 'uid-faculty-1',
          username: 'faculty.code',
          loginId: 'faculty.code',
          accountType: 'Faculty',
          portal: 'faculty',
          portalLabel: 'Faculty portal',
          attempts: 5,
          maxAttempts: 5,
          lockedUntil: '2026-06-07T12:05:00.000Z',
          reason: 'Account Lockout for 5 Attempts failed',
          suspiciousLoginDetected: true,
        },
      },
      'Account Lockout',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Account Lockout')
    assert.equal(data.suspiciousLoginDetected, true)
    assert.equal(data.account.userId, 'uid-faculty-1')
    assert.equal(data.account.username, 'faculty.code')
    assert.equal(data.account.loginId, 'faculty.code')
    assert.equal(data.account.type, 'Faculty')
    assert.equal(data.portal, 'Faculty portal')
    assert.equal(data.attempts, 5)
    assert.equal(data.reason, 'Account Lockout for 5 Attempts failed')
  })

  it('formats USER_SESSION_STARTED with device and no IP', () => {
    const json = formatAuditModalEventDataJson(
      {
        activityType: 'USER_SESSION_STARTED',
        detailsObj: {
          userName: 'Jerry Bantad',
          userEmail: 'adolfo.jbukele@gmail.com',
          login_method: 'username',
          user_agent: 'Mozilla/5.0 Test',
          signed_in_at: '2026-06-05T12:00:00.000Z',
        },
      },
      'Session started',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Session started')
    assert.equal(data.user.name, 'Jerry Bantad')
    assert.equal(data.loginMethod, 'username')
    assert.equal(data.device, 'Mozilla/5.0 Test')
    assert.equal(data.ipAddress, undefined)
  })

  it('formats SUBJECT_UPDATED with Old/New changes', () => {
    const json = formatAuditModalEventDataJson(
      {
        activityType: 'SUBJECT_UPDATED',
        actorName: 'Admin User',
        actorEmail: 'admin@test.com',
        detailsObj: {
          recordType: 'subject',
          recordId: '5',
          subjectCode: 'ENG1',
          subjectName: 'English I',
          gradeLevel: 'Grade 7',
          detailedDiffs: { 'Subject name': { old: 'English 1', new: 'English I' } },
          description: 'Subject updated: English I (Grade 7)',
        },
      },
      'Subject updated',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Subject updated')
    assert.equal(data.record.subjectCode, 'ENG1')
    assert.deepEqual(data.changes['Subject name'], { old: 'English 1', new: 'English I' })
  })

  it('formats ANNOUNCEMENT_DELETED with deleted snapshot', () => {
    const json = formatAuditModalEventDataJson(
      {
        activityType: 'ANNOUNCEMENT_DELETED',
        actorName: 'Admin User',
        detailsObj: {
          recordType: 'announcement',
          recordId: '3',
          title: 'Buwan ng Wika',
          deletedSnapshot: { id: '3', title: 'Buwan ng Wika', type: 'Event' },
          description: 'Announcement deleted: Buwan ng Wika',
        },
      },
      'Announcement deleted',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Announcement deleted')
    assert.equal(data.record.title, 'Buwan ng Wika')
    assert.equal(data.deleted.title, 'Buwan ng Wika')
  })
})
