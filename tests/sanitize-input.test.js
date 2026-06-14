import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isAuditablePath,
  isBase64OrBinaryPayload,
  isNonAuditablePath,
  isSuspicious,
} from '../server/middleware/sanitizeInput.js'
import { resolveArchiveTableSql, assertSqlIdentifier } from '../server/lib/sqlGuards.js'

describe('sanitizeInput isSuspicious', () => {
  it('blocks XSS and path traversal patterns', () => {
    assert.equal(isSuspicious("<script>alert('xss')</script>"), true)
    assert.equal(isSuspicious('javascript:alert(1)'), true)
    assert.equal(isSuspicious('<img onerror=alert(1)>'), true)
    assert.equal(isSuspicious('<iframe src="evil">'), true)
    assert.equal(isSuspicious('../../etc/passwd'), true)
    assert.equal(isSuspicious('..\\windows\\system32'), true)
  })

  it('blocks clear SQL injection attempts', () => {
    assert.equal(isSuspicious("' OR 1=1 --"), true)
    assert.equal(isSuspicious("'; DROP TABLE students; --"), true)
    assert.equal(isSuspicious("' OR '1'='1"), true)
    assert.equal(isSuspicious('UNION SELECT * FROM users'), true)
    assert.equal(isSuspicious("1; DELETE FROM students"), true)
    assert.equal(isSuspicious('INSERT INTO users VALUES (1)'), true)
  })

  it('skips base64 and data URLs', () => {
    const b64 = 'A'.repeat(300)
    assert.equal(isBase64OrBinaryPayload(b64), true)
    assert.equal(isSuspicious(b64), false)
    assert.equal(
      isSuspicious('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD'),
      false,
    )
  })

  it('allows normal LMS text that previously false-positive', () => {
    assert.equal(isSuspicious('John Smith'), false)
    assert.equal(isSuspicious('grade6@school.edu'), false)
    assert.equal(isSuspicious('ENROLL-2024-001'), false)
    assert.equal(isSuspicious("O'Brien"), false)
    assert.equal(isSuspicious("St. John's Section"), false)
    assert.equal(isSuspicious('123 Select Street'), false)
    assert.equal(isSuspicious('Grade 7 — From The Top Section'), false)
    assert.equal(isSuspicious('Where students learn'), false)
    assert.equal(isSuspicious('Union Elementary School'), false)
  })
})

describe('sanitizeInput path rules', () => {
  it('treats /v1/state as non-auditable', () => {
    assert.equal(isNonAuditablePath('/api/v1/state'), true)
    assert.equal(isAuditablePath('/api/v1/state'), false)
  })

  it('treats faculty API as auditable', () => {
    assert.equal(isAuditablePath('/api/v1/faculty/abc-123'), true)
    assert.equal(isNonAuditablePath('/api/v1/faculty/abc-123'), false)
  })

  it('treats audit statistics as non-auditable', () => {
    assert.equal(isNonAuditablePath('/api/monitoring/audit-statistics'), true)
    assert.equal(isAuditablePath('/api/monitoring/audit-statistics'), false)
  })

  it('treats student API routes as auditable', () => {
    assert.equal(isAuditablePath('/api/v1/student/quizzes/abc/submit'), true)
    assert.equal(isNonAuditablePath('/api/v1/student/quizzes/abc/submit'), false)
  })
})

describe('sqlGuards', () => {
  it('resolves only whitelisted archive tables', () => {
    assert.equal(resolveArchiveTableSql('students'), 'public.students')
    assert.equal(resolveArchiveTableSql('faculties'), 'public.faculties')
    assert.equal(resolveArchiveTableSql('users'), null)
    assert.equal(resolveArchiveTableSql("students; DROP"), null)
  })

  it('rejects invalid SQL identifiers', () => {
    assert.throws(() => assertSqlIdentifier('name; DROP'), /Invalid/)
    assert.equal(assertSqlIdentifier('photo_url'), 'photo_url')
  })
})
