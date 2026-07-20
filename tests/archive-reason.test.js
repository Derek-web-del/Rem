import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseArchiveReason,
  ARCHIVE_REASON_MIN_LEN,
  ARCHIVE_REASON_MAX_LEN,
  obfuscateArchivedStudentForVault,
  obfuscateArchivedFacultyForVault,
} from '../server/api/state/shared.js'

describe('parseArchiveReason', () => {
  it('rejects missing reason', () => {
    const result = parseArchiveReason({})
    assert.equal(result.ok, false)
    assert.equal(result.code, 'ARCHIVE_REASON_REQUIRED')
  })

  it('rejects reason shorter than minimum', () => {
    const result = parseArchiveReason({ reason: 'short' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'ARCHIVE_REASON_TOO_SHORT')
  })

  it('accepts valid reason', () => {
    const reason = 'Transferred to another school.'
    const result = parseArchiveReason({ reason })
    assert.equal(result.ok, true)
    assert.equal(result.reason, reason)
  })

  it('rejects reason longer than maximum', () => {
    const result = parseArchiveReason({ reason: 'x'.repeat(ARCHIVE_REASON_MAX_LEN + 1) })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'ARCHIVE_REASON_TOO_LONG')
  })

  it('accepts reason at minimum length', () => {
    const reason = 'a'.repeat(ARCHIVE_REASON_MIN_LEN)
    const result = parseArchiveReason({ reason: `  ${reason}  ` })
    assert.equal(result.ok, true)
    assert.equal(result.reason, reason)
  })
})

describe('vault obfuscation includes archive reason', () => {
  it('passes through student archive_reason', () => {
    const row = {
      id: 1,
      first_name: 'Ana',
      last_name: 'Dela Cruz',
      archived_at: '2026-01-01T00:00:00.000Z',
      archive_reason: 'Graduated and left the institution.',
    }
    const out = obfuscateArchivedStudentForVault(row)
    assert.equal(out.archive_reason, row.archive_reason)
    assert.equal(out.archiveReason, row.archive_reason)
  })

  it('passes through faculty archive_reason', () => {
    const row = {
      id: 'fac-1',
      name: 'Mr. Santos',
      archived_at: '2026-01-01T00:00:00.000Z',
      archive_reason: 'Resigned from teaching position.',
    }
    const out = obfuscateArchivedFacultyForVault(row)
    assert.equal(out.archive_reason, row.archive_reason)
    assert.equal(out.archiveReason, row.archive_reason)
  })
})
