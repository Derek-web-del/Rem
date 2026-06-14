import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getQuizAttemptPolicy, isQuizDeadlineOpen } from '../server/lib/quizSubmissionsDb.js'

describe('getQuizAttemptPolicy', () => {
  it('blocks retake when max attempts is 1 and quiz is completed', () => {
    const policy = getQuizAttemptPolicy({ max_attempts: 1 }, { status: 'completed', attempt_number: 1 })
    assert.equal(policy.max_attempts, 1)
    assert.equal(policy.attempts_used, 1)
    assert.equal(policy.attempts_remaining, 0)
    assert.equal(policy.can_retake, false)
    assert.equal(policy.can_start, false)
  })

  it('allows two retakes when max attempts is 3 and one attempt is completed', () => {
    const policy = getQuizAttemptPolicy({ max_attempts: 3 }, { status: 'completed', attempt_number: 1 })
    assert.equal(policy.attempts_remaining, 2)
    assert.equal(policy.can_retake, true)
    assert.equal(policy.can_start, true)
  })

  it('blocks retake after third attempt when max is 3', () => {
    const policy = getQuizAttemptPolicy({ max_attempts: 3 }, { status: 'completed', attempt_number: 3 })
    assert.equal(policy.attempts_remaining, 0)
    assert.equal(policy.can_retake, false)
  })

  it('allows start when no submission exists', () => {
    const policy = getQuizAttemptPolicy({ max_attempts: 2 }, null)
    assert.equal(policy.attempts_used, 0)
    assert.equal(policy.can_start, true)
    assert.equal(policy.can_retake, false)
  })
})

describe('isQuizDeadlineOpen', () => {
  it('returns true when deadline is null', () => {
    assert.equal(isQuizDeadlineOpen(null), true)
    assert.equal(isQuizDeadlineOpen(''), true)
  })

  it('returns false when deadline is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    assert.equal(isQuizDeadlineOpen(past), false)
  })

  it('returns true when deadline is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    assert.equal(isQuizDeadlineOpen(future), true)
  })
})
