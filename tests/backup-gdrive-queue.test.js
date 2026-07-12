import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDriveUploadEligibility } from '../server/lib/backupService.js'

describe('Google Drive background upload', () => {
  test('evaluateDriveUploadEligibility skips when actor id missing', async () => {
    const result = await evaluateDriveUploadEligibility({ id: '', name: 'Admin' })
    assert.equal(result.skipped, true)
    assert.equal(result.eligible, false)
  })
})
