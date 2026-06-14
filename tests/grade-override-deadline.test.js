import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDeadlinePassed, isSubmissionOpen } from '../server/lib/studentWorkPortal.js'

describe('grade override deadline guard', () => {
  it('isDeadlinePassed is false before deadline and true after', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const past = new Date(Date.now() - 60_000).toISOString()
    assert.equal(isDeadlinePassed(future), false)
    assert.equal(isSubmissionOpen(future), true)
    assert.equal(isDeadlinePassed(past), true)
    assert.equal(isSubmissionOpen(past), false)
  })

  it('missing deadline never locks scores', () => {
    assert.equal(isDeadlinePassed(null), false)
    assert.equal(isDeadlinePassed(''), false)
    assert.equal(isSubmissionOpen(null), true)
  })
})
