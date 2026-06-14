import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { maskEmail } from '../Frontend/src/lib/maskEmail.js'

describe('maskEmail', () => {
  it('masks local part of school GSuite email', () => {
    assert.equal(maskEmail('teacher@glendaleschool.edu'), 't***@glendaleschool.edu')
  })

  it('masks gmail addresses', () => {
    assert.equal(maskEmail('olympus.grp123@gmail.com'), 'o***@gmail.com')
  })

  it('returns empty for blank input', () => {
    assert.equal(maskEmail(''), '')
  })
})
