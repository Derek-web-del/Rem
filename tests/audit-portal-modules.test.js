import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAuditPortalAffected,
  resolveAuditPortalModule,
  dedupeLoginSessionEvents,
  ADMIN_PORTAL_MODULES,
  TEACHER_PORTAL_MODULES,
  STUDENT_PORTAL_MODULES,
  TERMS_AND_CONDITIONS_MODULE,
} from '../shared/auditPortalModules.js'

describe('auditPortalModules', () => {
  it('maps legacy teacher module names to portal labels', () => {
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { module: 'Subject Modules' } }),
      TEACHER_PORTAL_MODULES.SUBJECTS,
    )
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { module: 'Quizzes' }, userRole: 'teacher' }),
      TEACHER_PORTAL_MODULES.QUIZ_MAKER,
    )
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { module: 'Plagiarism Checker' } }),
      TEACHER_PORTAL_MODULES.AI_CHECKER,
    )
  })

  it('infers Subjects from teacher structured event_type', () => {
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { event_type: 'topic_created' } }),
      TEACHER_PORTAL_MODULES.SUBJECTS,
    )
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { event_type: 'assignment_published' } }),
      TEACHER_PORTAL_MODULES.SUBJECTS,
    )
    assert.equal(
      resolveAuditPortalModule({ detailsObj: { event_type: 'grade_criteria_saved' } }),
      TEACHER_PORTAL_MODULES.GRADES,
    )
  })

  it('maps student submissions and logout from activityType', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'QUIZ_SUBMITTED',
        userRole: 'student',
        detailsObj: { module: STUDENT_PORTAL_MODULES.QUIZZES },
      }),
      STUDENT_PORTAL_MODULES.QUIZZES,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'ASSIGNMENT_SUBMITTED',
        userRole: 'student',
      }),
      STUDENT_PORTAL_MODULES.ASSIGNMENTS,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_SIGNED_OUT',
        userRole: 'teacher',
        detailsObj: { userName: 'Jane Teacher' },
      }),
      TEACHER_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_SIGNED_OUT',
        userRole: 'student',
      }),
      STUDENT_PORTAL_MODULES.DASHBOARD,
    )
  })

  it('maps institute admin curriculum and section events', () => {
    assert.equal(
      resolveAuditPortalModule({ activityType: 'CURRICULUM_UPDATED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.CURRICULUM,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'SECTION_CREATED' }),
      ADMIN_PORTAL_MODULES.SECTION,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'STUDENT_CREATED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.STUDENTS,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'FACULTY_UPDATED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.FACULTIES,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'STUDENT_RESTORED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.ARCHIVE_VAULT,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'BACKUP_CREATED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.DATA_BACKUP,
    )
    assert.equal(
      resolveAuditPortalModule({ activityType: 'AUDIT_LOGS_CLEARED', userRole: 'admin' }),
      ADMIN_PORTAL_MODULES.AUDIT_LOGS,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_SIGNED_OUT',
        userRole: 'admin',
      }),
      ADMIN_PORTAL_MODULES.DASHBOARD,
    )
  })

  it('resolveAuditPortalAffected prefers quiz and assignment titles', () => {
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'QUIZ_SUBMITTED',
        detailsObj: { quizTitle: 'Midterm Exam' },
      }),
      'Midterm Exam',
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'ASSIGNMENT_SUBMITTED',
        detailsObj: { assignmentTitle: 'Essay 1' },
      }),
      'Essay 1',
    )
  })

  it('maps user account changed to Students or Faculties module', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_ACCOUNT_CHANGED',
        detailsObj: { targetRole: 'student', studentRecordId: 42 },
      }),
      ADMIN_PORTAL_MODULES.STUDENTS,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_ACCOUNT_CHANGED',
        detailsObj: { targetRole: 'faculty' },
      }),
      ADMIN_PORTAL_MODULES.FACULTIES,
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'USER_ACCOUNT_CHANGED',
        detailsObj: { targetName: 'John Bantad' },
      }),
      'John Bantad',
    )
  })

  it('maps terms accepted to Terms & Conditions module and affected user', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'TERMS_ACCEPTED',
        detailsObj: { module: 'Dashboard' },
      }),
      TERMS_AND_CONDITIONS_MODULE,
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'TERMS_ACCEPTED',
        detailsObj: { userName: 'Derek John Bantad' },
      }),
      'Derek John Bantad',
    )
  })

  it('maps login events to dashboard module and affected user', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_SIGNED_IN',
        userRole: 'student',
        detailsObj: { userName: 'Derek John Bantad' },
      }),
      STUDENT_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'USER_SIGNED_IN',
        detailsObj: { userName: 'Derek John Bantad', userEmail: 'derek@example.com' },
      }),
      'Derek John Bantad',
    )
  })

  it('maps security auth events to portal dashboard module and affected user', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'LOGIN_FAILED',
        userRole: 'student',
        detailsObj: { portal: 'student', userName: 'Trap Hook', loginId: 'trap.hook' },
      }),
      STUDENT_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'AUTH_LOCKOUT',
        userRole: 'admin',
        detailsObj: { portal: 'admin', userName: 'Admin User' },
      }),
      ADMIN_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'LOGIN_FAILED',
        detailsObj: { userName: 'Trap Hook', loginId: 'trap.hook' },
      }),
      'Trap Hook',
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'AUTH_LOCKOUT',
        detailsObj: { userName: 'Admin User' },
      }),
      'Admin User',
    )
  })

  it('maps session started and revoked to dashboard module by role', () => {
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'USER_SESSION_STARTED',
        userRole: 'student',
        detailsObj: { module: 'Dashboard' },
      }),
      STUDENT_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalModule({
        activityType: 'SESSION_REVOKED',
        userRole: 'admin',
        detailsObj: {},
      }),
      ADMIN_PORTAL_MODULES.DASHBOARD,
    )
    assert.equal(
      resolveAuditPortalAffected({
        activityType: 'USER_SESSION_STARTED',
        detailsObj: { userName: 'Derek John Bantad' },
      }),
      'Derek John Bantad',
    )
  })

  it('dedupeLoginSessionEvents drops session rows when login exists for same user', () => {
    const ts = '2026-06-23T08:00:00.000Z'
    const events = [
      {
        activityType: 'USER_SIGNED_IN',
        userId: 'user-1',
        timestamp: ts,
        detailsObj: { userName: 'Derek John Bantad' },
      },
      {
        activityType: 'USER_SESSION_STARTED',
        userId: 'user-1',
        timestamp: ts,
        detailsObj: { userName: 'Derek John Bantad' },
      },
      {
        activityType: 'USER_SESSION_STARTED',
        userId: 'user-2',
        timestamp: ts,
        detailsObj: { userName: 'Solo Session' },
      },
    ]
    const deduped = dedupeLoginSessionEvents(events)
    assert.equal(deduped.length, 2)
    assert.equal(deduped.some((e) => e.activityType === 'USER_SIGNED_IN'), true)
    assert.equal(deduped.some((e) => e.activityType === 'USER_SESSION_STARTED' && e.userId === 'user-1'), false)
    assert.equal(deduped.some((e) => e.userId === 'user-2'), true)
  })
})
