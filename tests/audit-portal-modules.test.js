import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAuditPortalAffected,
  resolveAuditPortalModule,
  ADMIN_PORTAL_MODULES,
  TEACHER_PORTAL_MODULES,
  STUDENT_PORTAL_MODULES,
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
})
