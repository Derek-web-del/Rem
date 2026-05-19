import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  coerceAuditTimestamp,
  coerceAuditTimestampMs,
  formatAuditTime,
  pickAuditEventDate,
} from '../shared/auditTime.js'

describe('auditTime', () => {
  it('parses ISO strings and Date instances', () => {
    const iso = '2026-05-19T10:30:00.000Z'
    assert.equal(coerceAuditTimestamp(iso)?.toISOString(), iso)
    assert.equal(coerceAuditTimestamp(new Date(iso))?.toISOString(), iso)
  })

  it('parses unix seconds and milliseconds', () => {
    const ms = 1_700_000_000_000
    assert.equal(coerceAuditTimestampMs(ms), ms)
    assert.equal(coerceAuditTimestampMs(1_700_000_000), 1_700_000_000_000)
  })

  it('parses Firestore-style timestamps', () => {
    const d = coerceAuditTimestamp({
      toDate() {
        return new Date('2026-05-19T10:30:00.000Z')
      },
    })
    assert.equal(d?.toISOString(), '2026-05-19T10:30:00.000Z')
  })

  it('parses seconds/nanoseconds objects', () => {
    const d = coerceAuditTimestamp({ seconds: 1_700_000_000, nanoseconds: 500_000_000 })
    assert.equal(d?.getUTCFullYear(), 2023)
  })

  it('prefers createdAt over invalid time object', () => {
    const event = {
      time: { bogus: true },
      createdAt: '2026-05-19T10:30:00.000Z',
    }
    assert.equal(pickAuditEventDate(event)?.toISOString(), '2026-05-19T10:30:00.000Z')
  })

  it('formats human-readable strings', () => {
    const out = formatAuditTime('2026-05-19T10:30:00.000Z')
    assert.notEqual(out, '[object Object]')
    assert.notEqual(out, 'Invalid date')
  })
})
