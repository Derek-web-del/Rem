import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSubmissionStatusBadge,
  isGradedStatusTone,
} from '../Frontend/src/lib/gradeStatus.js'

describe('resolveSubmissionStatusBadge', () => {
  it('maps graded scores to passed, at_risk, and failed tones', () => {
    assert.deepEqual(resolveSubmissionStatusBadge({ status: 'graded', score: 80 }, 100), {
      label: 'Score: 80/100',
      tone: 'passed',
    })
    assert.deepEqual(resolveSubmissionStatusBadge({ status: 'graded', score: 70 }, 100), {
      label: 'Score: 70/100',
      tone: 'at_risk',
    })
    assert.deepEqual(resolveSubmissionStatusBadge({ status: 'graded', score: 50 }, 100), {
      label: 'Score: 50/100',
      tone: 'failed',
    })
  })

  it('maps pending and not submitted states', () => {
    assert.deepEqual(
      resolveSubmissionStatusBadge({ status: 'submitted', submitted_at: '2026-01-01' }, 100),
      { label: 'Pending', tone: 'pending' },
    )
    assert.deepEqual(resolveSubmissionStatusBadge({ status: 'not_submitted' }, 100), {
      label: 'Not Submitted',
      tone: 'neutral',
    })
  })

  it('maps expired submissions to failed', () => {
    assert.deepEqual(resolveSubmissionStatusBadge({ status: 'expired', score: 0 }, 100), {
      label: 'Score: 0/100',
      tone: 'failed',
    })
  })

  it('isGradedStatusTone identifies grade tones', () => {
    assert.equal(isGradedStatusTone('passed'), true)
    assert.equal(isGradedStatusTone('at_risk'), true)
    assert.equal(isGradedStatusTone('failed'), true)
    assert.equal(isGradedStatusTone('pending'), false)
  })
})
