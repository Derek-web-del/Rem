import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cleanAuditDescription, cleanAuditLogRow } from '../server/lib/cleanAuditLogText.js'

describe('cleanAuditLogText', () => {
  it('strips institute admin sign-in noise from description', () => {
    const raw = 'User signed in — Administrator · Sign-in ID: admin'
    assert.equal(cleanAuditDescription(raw), 'User signed in')
  })

  it('cleans nested event payloads', () => {
    const row = cleanAuditLogRow({
      description: 'Administrator · Sign-in ID: admin',
      eventData: { note: 'Administrator · Sign-in ID: admin' },
    })
    assert.equal(row.description, '')
    assert.equal(row.eventData.note, '')
  })

  it('strips faculty code-ID noise from description', () => {
    const raw = 'User signed in — Faculty · Faculty Code ID: faderek'
    assert.equal(cleanAuditDescription(raw), 'User signed in')
  })

  it('strips student code-ID noise from nested payloads', () => {
    const row = cleanAuditLogRow({
      description: 'Student · Student Code ID: stu-001',
      eventData: { note: 'Student · Student Code ID: stu-001' },
    })
    assert.equal(row.description, '')
    assert.equal(row.eventData.note, '')
  })
})
