import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  loginPathWithPortalId,
  syncLoginPortalSearch,
} from '../Frontend/src/lib/loginRoutes.js'

describe('loginRoutes portal id URLs', () => {
  it('builds faculty login path with id=2', () => {
    assert.equal(loginPathWithPortalId('FACULTY'), '/login/faculty?id=2')
  })

  it('builds institute login path with id=1', () => {
    assert.equal(loginPathWithPortalId('INSTITUTE'), '/login/institute?id=1')
  })

  it('builds student login path with id=3', () => {
    assert.equal(loginPathWithPortalId('STUDENT'), '/login/student?id=3')
  })

  it('adds id when missing on portal login path', () => {
    assert.equal(syncLoginPortalSearch('/login/student', ''), '?id=3')
  })

  it('returns null when id already matches portal', () => {
    assert.equal(syncLoginPortalSearch('/login/student', '?id=3'), null)
    assert.equal(syncLoginPortalSearch('/login/student', 'id=3'), null)
  })

  it('does not add id on role picker path', () => {
    assert.equal(syncLoginPortalSearch('/login', ''), null)
  })

  it('corrects wrong id on portal path', () => {
    assert.equal(syncLoginPortalSearch('/login/faculty', '?id=9'), '?id=2')
  })
})
