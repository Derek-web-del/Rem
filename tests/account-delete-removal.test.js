import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeArchiveRetention } from '../server/api/state/shared.js'

describe('computeArchiveRetention indefinite retention', () => {
  it('never marks purge_eligible even for old archives', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    const result = computeArchiveRetention(old)
    assert.equal(result.purge_eligible, false)
    assert.equal(result.days_until_deletion, null)
    assert.equal(result.auto_delete_at, null)
    assert.equal(result.warning_level, 'normal')
  })

  it('returns stable metadata for invalid dates', () => {
    const result = computeArchiveRetention('not-a-date')
    assert.equal(result.purge_eligible, false)
    assert.equal(result.days_until_deletion, null)
  })
})

describe('immediate-purge disabled contract', () => {
  it('documents expected API response shape', () => {
    const body = {
      success: false,
      error: 'IMMEDIATE_PURGE_DISABLED',
      message: 'Immediate delete from active rosters is disabled. Archive the account instead.',
    }
    assert.equal(body.error, 'IMMEDIATE_PURGE_DISABLED')
    assert.match(body.message, /Archive/i)
  })
})

describe('permanent-purge disabled contract', () => {
  it('documents expected API response shape', () => {
    const body = {
      success: false,
      error: 'PERMANENT_PURGE_DISABLED',
      message: 'Permanent delete from archive is disabled. Records are retained for data privacy.',
    }
    assert.equal(body.error, 'PERMANENT_PURGE_DISABLED')
    assert.match(body.message, /data privacy/i)
  })
})
