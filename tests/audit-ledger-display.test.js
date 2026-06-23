import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapLedgerRowToAuthEvent } from '../server/lib/auditLogsLedger.js'
import {
  isNonProfileLedgerType,
  ledgerTypeToActivityType,
  resolveLedgerDisplayType,
} from '../shared/auditLedgerDisplay.js'
import { getEventLabel } from '../Frontend/src/lib/auditEventDisplay.js'
import { formatAuditModalEventDataJson } from '../Frontend/src/lib/formatAuditModalEventData.js'

describe('auditLedgerDisplay', () => {
  it('maps LOGIN ledger type to sign-in activity and label', () => {
    assert.equal(ledgerTypeToActivityType('LOGIN'), 'USER_SIGNED_IN')
    assert.equal(resolveLedgerDisplayType('LOGIN'), 'Login')
    assert.equal(isNonProfileLedgerType('LOGIN'), true)
    assert.equal(isNonProfileLedgerType('user_account_changed'), false)
  })

  it('mapLedgerRowToAuthEvent does not label LOGIN as profile update', () => {
    const mapped = mapLedgerRowToAuthEvent({
      id: 99,
      type: 'LOGIN',
      created_at: '2026-06-07T09:37:01.000Z',
      payload: {
        userId: 'uid-trap',
        userName: 'Trap Hook',
        userEmail: 'trap@school.edu',
        role: 'student',
        description: 'Student logged in',
      },
    })

    assert.equal(mapped.eventType, 'LOGIN')
    assert.equal(mapped.activityType, 'USER_SIGNED_IN')
    assert.equal(mapped.eventData.displayType, 'Login')
    assert.notEqual(mapped.eventData.displayType, 'Profile Updated (Account)')
    assert.equal(getEventLabel(mapped.eventType, mapped.activityType), 'Login')
  })

  it('formatAuditModalEventDataJson formats LOGIN ledger as sign-in not account changed', () => {
    const json = formatAuditModalEventDataJson(
      {
        source: 'ledger',
        eventType: 'LOGIN',
        activityType: 'USER_SIGNED_IN',
        userId: 'uid-trap',
        detailsObj: {
          type: 'LOGIN',
          displayType: 'Login',
          userName: 'Trap Hook',
          userEmail: 'trap@school.edu',
          description: 'Student logged in',
        },
      },
      'Login',
    )
    const data = JSON.parse(json)
    assert.equal(data.event, 'Login')
    assert.equal(data.user?.name, 'Trap Hook')
    assert.equal(data.actor, undefined)
    assert.equal(data.target, undefined)
    assert.equal(data.changes, undefined)
  })

  it('mapLedgerRowToAuthEvent labels AUTH_LOCKOUT correctly', () => {
    const mapped = mapLedgerRowToAuthEvent({
      id: 100,
      type: 'AUTH_LOCKOUT',
      created_at: '2026-06-07T09:37:01.000Z',
      payload: {
        userId: 'uid-1',
        reason: 'Account Lockout for 5 Attempts failed',
      },
    })
    assert.equal(mapped.activityType, 'AUTH_LOCKOUT')
    assert.equal(mapped.eventData.displayType, 'Account Lockout')
  })
})
