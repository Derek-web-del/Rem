import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSubmissionOpenForStudent,
  isWorkLockedForStudent,
  buildTeacherSubmissionScoreMeta,
} from '../server/lib/studentWorkPortal.js'
import { mapScoredWorkItem } from '../server/lib/gradesDb.js'
import { isQuizOpenForStudent } from '../server/lib/quizSubmissionsDb.js'
import { grantSubmissionExtension } from '../server/lib/submissionExtensionDb.js'

describe('late submission helpers', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  const future = new Date(Date.now() + 60_000).toISOString()
  const later = new Date(Date.now() + 120_000).toISOString()

  it('isSubmissionOpenForStudent honors active extension after deadline', () => {
    assert.equal(isSubmissionOpenForStudent(past, future), true)
    assert.equal(isSubmissionOpenForStudent(past, past), false)
    assert.equal(isSubmissionOpenForStudent(future, null), true)
  })

  it('isWorkLockedForStudent unlocks only during active extension after deadline', () => {
    assert.equal(isWorkLockedForStudent(past, future), false)
    assert.equal(isWorkLockedForStudent(past, past), true)
    assert.equal(isWorkLockedForStudent(future, null), false)
  })

  it('buildTeacherSubmissionScoreMeta marks editable only during active extension', () => {
    const active = buildTeacherSubmissionScoreMeta(past, { late_submission_until: future })
    assert.equal(active.score_editable, true)
    assert.equal(active.has_late_extension, true)

    const expired = buildTeacherSubmissionScoreMeta(past, {
      late_submission_until: past,
      submitted_at: past,
    })
    assert.equal(expired.score_editable, false)
    assert.equal(expired.score_locked, true)
  })

  it('isQuizOpenForStudent matches assignment helper semantics', () => {
    assert.equal(isQuizOpenForStudent(past, future), true)
    assert.equal(isQuizOpenForStudent(past, null), false)
  })
})

describe('mapScoredWorkItem with late extension', () => {
  const pastDeadline = new Date(Date.now() - 60_000).toISOString()
  const futureUntil = new Date(Date.now() + 60_000).toISOString()

  it('is not locked when late extension is active', () => {
    const mapped = mapScoredWorkItem(
      {
        id: 1,
        type: 'assignment',
        title: 'Essay',
        max_points: 100,
        deadline: pastDeadline,
      },
      {
        has_score: false,
        submission_id: 10,
        max_points: 100,
        late_submission_until: futureUntil,
      },
      { includeUnsubmittedLocked: true },
    )
    assert.ok(mapped)
    assert.equal(mapped.is_locked, false)
    assert.equal(mapped.has_late_extension, true)
  })

  it('is locked again after extension expires even if student submitted during window', () => {
    const mapped = mapScoredWorkItem(
      {
        id: 1,
        type: 'assignment',
        title: 'Essay',
        max_points: 100,
        deadline: pastDeadline,
      },
      {
        has_score: true,
        score: 80,
        submission_id: 10,
        max_points: 100,
        late_submission_until: pastDeadline,
        submitted_at: pastDeadline,
      },
      { includeUnsubmittedLocked: true },
    )
    assert.ok(mapped)
    assert.equal(mapped.is_locked, true)
  })
})

describe('grantSubmissionExtension', () => {
  const pastDeadline = new Date(Date.now() - 60_000)
  const futureUntil = new Date(Date.now() + 24 * 60 * 60 * 1000)

  it('resets expired submission without file', async () => {
    let updateSql = ''
    const pool = {
      query: async (sql, params) => {
        const text = String(sql)
        if (text.includes('CREATE TABLE') || text.includes('ALTER TABLE')) return { rows: [] }
        if (text.includes('FROM assignments WHERE id')) {
          return { rows: [{ id: 5, title: 'HW 1', deadline: pastDeadline }] }
        }
        if (text.includes('assignment_submissions WHERE assignment_id')) {
          return {
            rows: [
              {
                id: 99,
                assignment_id: 5,
                student_id: 7,
                status: 'expired',
                score: 0,
                file_path: null,
              },
            ],
          }
        }
        if (text.includes('FROM students WHERE id')) {
          return { rows: [{ id: 7, first_name: 'Ana', last_name: 'Cruz' }] }
        }
        if (text.includes('UPDATE assignment_submissions')) {
          updateSql = text
          assert.equal(params[4], true)
          return {
            rows: [
              {
                id: 99,
                assignment_id: 5,
                student_id: 7,
                status: 'not_submitted',
                score: null,
                late_submission_until: params[0],
              },
            ],
          }
        }
        return { rows: [] }
      },
    }

    const result = await grantSubmissionExtension(pool, {
      entityType: 'assignment',
      entityId: 5,
      studentId: 7,
      until: futureUntil.toISOString(),
      reason: 'Medical excuse documented',
      grantedBy: 'admin-1',
    })

    assert.equal(result.reset_expired, true)
    assert.ok(updateSql.includes('status = CASE WHEN $5 THEN'))
  })

  it('rejects extension before original deadline passes', async () => {
    const futureDeadline = new Date(Date.now() + 60_000)
    const pool = {
      query: async (sql) => {
        const text = String(sql)
        if (text.includes('CREATE TABLE') || text.includes('ALTER TABLE')) return { rows: [] }
        if (text.includes('FROM assignments WHERE id')) {
          return { rows: [{ id: 5, title: 'HW 1', deadline: futureDeadline }] }
        }
        return { rows: [] }
      },
    }

    const result = await grantSubmissionExtension(pool, {
      entityType: 'assignment',
      entityId: 5,
      studentId: 7,
      until: futureUntil.toISOString(),
      reason: 'Medical excuse documented',
      grantedBy: 'admin-1',
    })

    assert.equal(result.error, 'NOT_LOCKED')
  })
})
