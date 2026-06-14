import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuditEventIconKey } from '../Frontend/src/lib/auditEventIcons.js'

describe('resolveAuditEventIconKey', () => {
  it('maps LMS session started events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'USER_SESSION_STARTED' }),
      'session_started',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'SESSION_CREATED' }),
      'session_started',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'auth', eventType: 'session_created' }),
      'session_started',
    )
  })

  it('maps sign-out events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'USER_SIGNED_OUT' }),
      'signed_out',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'auth', eventType: 'user_signed_out' }),
      'signed_out',
    )
  })

  it('maps terms accepted', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'TERMS_ACCEPTED' }),
      'terms_accepted',
    )
  })

  it('maps sign-in events for auth and LMS', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'auth', eventType: 'user_signed_in' }),
      'signed_in',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'USER_SIGNED_IN' }),
      'signed_in',
    )
  })

  it('maps quiz, password, and session revoked LMS events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'QUIZ_SUBMITTED' }),
      'quiz_submitted',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'QUIZ_CREATED' }),
      'quiz_created',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'PASSWORD_CHANGED' }),
      'password_changed',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'SESSION_REVOKED' }),
      'session_revoked',
    )
  })

  it('falls back to default for unknown events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'UNKNOWN_EVENT' }),
      'default',
    )
  })

  it('maps subject and institute announcement events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'SUBJECT_UPDATED' }),
      'organization',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'ANNOUNCEMENT_CREATED' }),
      'announcement',
    )
  })

  it('maps roster restore and purge events', () => {
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'STUDENT_RESTORED' }),
      'user_created',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'STUDENT_IMMEDIATELY_PURGED' }),
      'user_blocked',
    )
    assert.equal(
      resolveAuditEventIconKey({ source: 'lms', activityType: 'BACKUP_SCHEDULE_UPDATED' }),
      'backup',
    )
  })
})
