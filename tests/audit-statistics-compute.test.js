import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeAuditStatistics } from '../shared/auditStatisticsCompute.js'

describe('computeAuditStatistics', () => {
  it('counts today sign-ins and failed logins from mixed sources', () => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const iso = today.toISOString()

    const stats = computeAuditStatistics([
      { eventType: 'user_signed_in', createdAt: iso },
      { eventType: 'session_created', createdAt: iso },
      { activityType: 'AUTH_LOCKOUT', timestamp: iso },
      { eventType: 'user_created', createdAt: new Date(today.getTime() - 2 * 86400000).toISOString() },
    ])

    assert.equal(stats.totalEventsToday, 3)
    assert.equal(stats.signInsToday, 1)
    assert.equal(stats.failedSignIns, 1)
    assert.equal(stats.accountsCreatedThisWeek, 1)
    assert.ok(stats.signInsByHour.some((h) => h.value === 1))
    assert.ok(stats.topTypes.length > 0)
  })
})
