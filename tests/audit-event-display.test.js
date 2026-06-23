import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDescription,
  getEventLabel,
  isSessionAuditEvent,
  resolveSessionDetailFields,
} from '../Frontend/src/lib/auditEventDisplay.js'

describe('auditEventDisplay', () => {
  it('getEventLabel maps session and auth event types', () => {
    assert.equal(getEventLabel('session_created', ''), 'Login')
    assert.equal(getEventLabel('', 'USER_SESSION_STARTED'), 'Login')
    assert.equal(getEventLabel('', 'SESSION_CREATED'), 'Login')
    assert.equal(getEventLabel('', 'USER_SIGNED_IN'), 'Login')
    assert.equal(getEventLabel('user_signed_in', ''), 'Login')
    assert.equal(getEventLabel('user_sign_in_failed', ''), 'Login failed')
    assert.equal(getEventLabel('', 'AUTH_LOCKOUT'), 'Account Lockout')
    assert.equal(getEventLabel('auth_lockout', ''), 'Account Lockout')
  })

  it('getEventLabel maps subject and announcement institute events', () => {
    assert.equal(getEventLabel('', 'SUBJECT_CREATED'), 'Subject created')
    assert.equal(getEventLabel('', 'SUBJECT_UPDATED'), 'Subject updated')
    assert.equal(getEventLabel('', 'SUBJECT_DELETED'), 'Subject deleted')
    assert.equal(getEventLabel('', 'ANNOUNCEMENT_CREATED'), 'Announcement created')
    assert.equal(getEventLabel('', 'ANNOUNCEMENT_UPDATED'), 'Announcement updated')
    assert.equal(getEventLabel('', 'ANNOUNCEMENT_DELETED'), 'Announcement deleted')
  })

  it('getEventLabel maps student archive as archived not deleted', () => {
    assert.equal(getEventLabel('', 'STUDENT_DELETED'), 'Student archived')
    assert.equal(getEventLabel('', 'FACULTY_DELETED'), 'Faculty archived')
    assert.equal(getEventLabel('', 'STUDENT_RESTORED'), 'Student restored')
    assert.equal(getEventLabel('', 'BACKUP_SCHEDULE_UPDATED'), 'Backup schedule updated')
  })

  it('formatDescription builds session subtitle from metadata', () => {
    const text = formatDescription('session_created', '', {
      name: 'Jerry Bantad',
      role: 'teacher',
      login_method: 'username',
    })
    assert.equal(text, 'Jerry Bantad started a Faculty session via username')
  })

  it('isSessionAuditEvent detects LMS and auth session rows', () => {
    assert.equal(
      isSessionAuditEvent({ activityType: 'USER_SESSION_STARTED', detailsObj: {} }),
      true,
    )
    assert.equal(isSessionAuditEvent({ eventType: 'session_created', detailsObj: {} }), true)
    assert.equal(isSessionAuditEvent({ activityType: 'QUIZ_SUBMITTED', detailsObj: {} }), false)
  })

  it('resolveSessionDetailFields extracts modal fields without IP', () => {
    const fields = resolveSessionDetailFields({
      activityType: 'USER_SESSION_STARTED',
      detailsObj: {
        name: 'Jerry Bantad',
        userEmail: 'adolfo.jbukele@gmail.com',
        role: 'teacher',
        login_method: 'username',
        user_agent: 'Mozilla/5.0',
        signed_in_at: '2026-06-05T12:00:00.000Z',
      },
    })
    assert.equal(fields.name, 'Jerry Bantad')
    assert.equal(fields.email, 'adolfo.jbukele@gmail.com')
    assert.equal(fields.roleLabel, 'Faculty')
    assert.equal(fields.loginMethod, 'username')
    assert.equal(fields.userAgent, 'Mozilla/5.0')
    assert.equal(fields.signedInAt, '2026-06-05T12:00:00.000Z')
    assert.equal(fields.ipAddress, undefined)
  })
})
