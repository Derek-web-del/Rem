import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  homePathForRole,
  loginPathForPortal,
  portalMatchesUserRole,
  portalMismatchMessage,
  resolveAuthRoleForPortal,
} from '../Frontend/src/lib/roleAccess.js'

describe('roleAccess portal RBAC', () => {
  test('portalMatchesUserRole enforces portal–role pairing', () => {
    assert.equal(portalMatchesUserRole('INSTITUTE', 'admin'), true)
    assert.equal(portalMatchesUserRole('INSTITUTE', 'student'), false)
    assert.equal(portalMatchesUserRole('FACULTY', 'teacher'), true)
    assert.equal(portalMatchesUserRole('FACULTY', 'faculty'), true)
    assert.equal(portalMatchesUserRole('FACULTY', 'student'), false)
    assert.equal(portalMatchesUserRole('STUDENT', 'student'), true)
    assert.equal(portalMatchesUserRole('STUDENT', 'admin'), false)
    assert.equal(portalMatchesUserRole(null, 'student'), false)
  })

  test('resolveAuthRoleForPortal treats institute admin email on Institute tile', () => {
    const user = { role: 'user', email: 'admin@school.edu' }
    assert.equal(resolveAuthRoleForPortal(user, 'INSTITUTE', 'admin@school.edu'), 'admin')
    assert.equal(resolveAuthRoleForPortal(user, 'STUDENT', 'admin@school.edu'), 'user')
  })

  test('loginPathForPortal and homePathForRole', () => {
    assert.equal(loginPathForPortal('STUDENT'), '/login/student')
    assert.equal(homePathForRole('student'), '/student/dashboard')
    assert.equal(homePathForRole('admin'), '/admin/institute_dashboard')
  })

  test('portalMismatchMessage guides user to correct portal', () => {
    assert.match(portalMismatchMessage('INSTITUTE', 'student'), /Student/i)
    assert.match(portalMismatchMessage('STUDENT', 'admin'), /Institute/i)
  })
})
