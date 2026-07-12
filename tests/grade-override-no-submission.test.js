import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapScoredWorkItem } from '../server/lib/gradesDb.js'
import { applySubmissionScoreOverride } from '../server/lib/submissionScoreUpdate.js'

describe('mapScoredWorkItem admin unsubmitted locked items', () => {
  const pastDeadline = new Date(Date.now() - 60_000).toISOString()
  const futureDeadline = new Date(Date.now() + 60_000).toISOString()

  const assignmentItem = {
    id: 12,
    type: 'assignment',
    title: 'Essay 1',
    max_points: 100,
    grade_component_id: 2,
    deadline: pastDeadline,
  }

  it('returns null for missing score when includeUnsubmittedLocked is false', () => {
    const mapped = mapScoredWorkItem(assignmentItem, { has_score: false, submission_id: null, max_points: 100 })
    assert.equal(mapped, null)
  })

  it('returns 0/max placeholder after deadline when includeUnsubmittedLocked is true', () => {
    const mapped = mapScoredWorkItem(
      assignmentItem,
      { has_score: false, submission_id: null, max_points: 100 },
      { includeUnsubmittedLocked: true },
    )
    assert.ok(mapped)
    assert.equal(mapped.score, 0)
    assert.equal(mapped.max_score, 100)
    assert.equal(mapped.percent, 0)
    assert.equal(mapped.submission_id, null)
    assert.equal(mapped.entity_id, 12)
    assert.equal(mapped.entity_type, 'assignment')
    assert.equal(mapped.is_locked, true)
    assert.equal(mapped.has_score, false)
    assert.equal(mapped.is_no_submission, true)
  })

  it('does not include unsubmitted items before deadline even for admin view', () => {
    const mapped = mapScoredWorkItem(
      { ...assignmentItem, deadline: futureDeadline },
      { has_score: false, submission_id: null, max_points: 100 },
      { includeUnsubmittedLocked: true },
    )
    assert.equal(mapped, null)
  })

  it('still maps scored submissions normally', () => {
    const mapped = mapScoredWorkItem(
      assignmentItem,
      { has_score: true, score: 85, submission_id: 55, max_points: 100 },
      { includeUnsubmittedLocked: true },
    )
    assert.equal(mapped.score, 85)
    assert.equal(mapped.submission_id, 55)
    assert.equal(mapped.is_no_submission, false)
  })

  it('shows 0/max for seeded submission row without score after deadline', () => {
    const mapped = mapScoredWorkItem(
      assignmentItem,
      { has_score: false, submission_id: 99, max_points: 100 },
      { includeUnsubmittedLocked: true },
    )
    assert.equal(mapped.score, 0)
    assert.equal(mapped.submission_id, 99)
    assert.equal(mapped.is_no_submission, false)
  })
})

describe('applySubmissionScoreOverride without submission row', () => {
  const pastDeadline = new Date(Date.now() - 60_000)

  function mockPool() {
    let insertCalled = false
    return {
      pool: {
        query: async (sql, params) => {
          const text = String(sql)
          if (text.includes('CREATE TABLE')) return { rows: [] }
          if (text.includes('FROM assignments a') && text.includes('LEFT JOIN assignment_submissions')) {
            return {
              rows: [
                {
                  id: 12,
                  title: 'Essay 1',
                  max_score: 100,
                  deadline: pastDeadline,
                  faculty_id: 'teacher-1',
                  submission_id: null,
                  old_score: null,
                },
              ],
            }
          }
          if (text.includes('FROM students WHERE id = $1')) {
            return { rows: [{ id: 7, first_name: 'Ana', last_name: 'Cruz' }] }
          }
          if (text.includes('INSERT INTO assignment_submissions')) {
            insertCalled = true
            assert.equal(params[0], 12)
            assert.equal(params[1], 7)
            assert.equal(params[3], 42)
            return { rows: [{ id: 501, assignment_id: 12, student_id: 7, score: 42, status: 'graded' }] }
          }
          return { rows: [] }
        },
      },
      insertCalled: () => insertCalled,
    }
  }

  it('upserts assignment submission when only entity_id is provided', async () => {
    const { pool, insertCalled } = mockPool()
    const result = await applySubmissionScoreOverride(
      pool,
      'assignment',
      { submissionId: null, entityId: 12, studentId: 7 },
      42,
    )
    assert.ok(result)
    assert.equal(result.new_score, 42)
    assert.equal(result.entity_id, 12)
    assert.equal(result.submission.id, 501)
    assert.equal(insertCalled(), true)
  })

  it('rejects override before deadline when using entity_id', async () => {
    const future = new Date(Date.now() + 60_000)
    const pool = {
      query: async (sql) => {
        const text = String(sql)
        if (text.includes('CREATE TABLE')) return { rows: [] }
        if (text.includes('FROM assignments a') && text.includes('LEFT JOIN assignment_submissions')) {
          return {
            rows: [
              {
                id: 12,
                title: 'Essay 1',
                max_score: 100,
                deadline: future,
                faculty_id: 'teacher-1',
                submission_id: null,
                old_score: null,
              },
            ],
          }
        }
        return { rows: [] }
      },
    }
    const result = await applySubmissionScoreOverride(
      pool,
      'assignment',
      { submissionId: null, entityId: 12, studentId: 7 },
      42,
    )
    assert.equal(result.error, 'NOT_LOCKED')
  })
})
