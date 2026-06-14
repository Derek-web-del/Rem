import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function isPastDeadline(deadlineIso) {
  if (!deadlineIso) return false
  const d = new Date(deadlineIso)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

describe('quiz teacher score deadline lock (client)', () => {
  it('isPastDeadline blocks edit after quiz deadline', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const past = new Date(Date.now() - 60_000).toISOString()
    assert.equal(isPastDeadline(future), false)
    assert.equal(isPastDeadline(past), true)
  })

  it('isPastDeadline treats missing deadline as unlocked', () => {
    assert.equal(isPastDeadline(null), false)
    assert.equal(isPastDeadline(undefined), false)
  })
})
