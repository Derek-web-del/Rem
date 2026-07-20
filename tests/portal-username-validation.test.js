import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validatePortalUsername } from '../server/lib/security.js'
import { clientErrorFromException } from '../server/lib/safeApiError.js'

describe('validatePortalUsername', () => {
  it('accepts valid login IDs', () => {
    assert.equal(validatePortalUsername('registrar.office'), 'registrar.office')
    assert.equal(validatePortalUsername('Reg_01'), 'reg_01')
  })

  it('rejects email-style login IDs', () => {
    assert.throws(
      () => validatePortalUsername('registrar@school.edu'),
      (e) => e.code === 'INVALID_USERNAME',
    )
  })

  it('rejects hyphens and spaces', () => {
    assert.throws(() => validatePortalUsername('reg-01'), (e) => e.code === 'INVALID_USERNAME')
    assert.throws(() => validatePortalUsername('reg office'), (e) => e.code === 'INVALID_USERNAME')
  })

  it('rejects too-short login IDs', () => {
    assert.throws(() => validatePortalUsername('ab'), (e) => e.code === 'INVALID_USERNAME')
  })
})

describe('clientErrorFromException', () => {
  it('maps Better Auth INVALID_USERNAME to a clear 400 message', () => {
    const mapped = clientErrorFromException({
      body: { code: 'INVALID_USERNAME', message: 'Username is invalid' },
    })
    assert.equal(mapped?.status, 400)
    assert.equal(mapped?.error, 'INVALID_USERNAME')
    assert.match(mapped?.message || '', /Login ID/i)
  })
})
