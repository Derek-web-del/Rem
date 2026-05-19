import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { auditEventReactKey, dedupeAuditEvents, dedupeById } from '../Frontend/src/lib/dedupeById.js'

describe('dedupeById', () => {
  it('keeps one row per id (last wins)', () => {
    const adminId = '468mQcP1IaIqGZ21cEFIJ5LMx91axEuL'
    const out = dedupeById([
      { id: adminId, name: 'First' },
      { id: '2', name: 'Other' },
      { id: adminId, name: 'Derek John Bantad' },
    ])
    assert.equal(out.length, 2)
    assert.equal(out.find((r) => r.id === adminId)?.name, 'Derek John Bantad')
  })

  it('dedupeAuditEvents drops identical source/id/time rows', () => {
    const id = '468mQcP1IaIqGZ21cEFIJ5LMx91axEuL'
    const row = { source: 'auth', id, time: '2026-01-01T00:00:00Z', eventType: 'user_signed_in' }
    const out = dedupeAuditEvents([row, { ...row }, { ...row, eventType: 'profile_updated' }])
    assert.equal(out.length, 2)
  })

  it('auditEventReactKey is unique per index when id collides', () => {
    const id = '468mQcP1IaIqGZ21cEFIJ5LMx91axEuL'
    const a = { source: 'auth', id, time: 't1', eventType: 'a' }
    const b = { source: 'auth', id, time: 't2', eventType: 'b' }
    assert.notEqual(auditEventReactKey(a, 0), auditEventReactKey(b, 1))
  })
})
