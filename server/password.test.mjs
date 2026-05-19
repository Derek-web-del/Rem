import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPasswordBcrypt, verifyPasswordCompat } from './password.js'

test('bcrypt: correct password verifies', async () => {
  const hash = await hashPasswordBcrypt('P@ssw0rd!')
  const ok = await verifyPasswordCompat({ hash, password: 'P@ssw0rd!' })
  assert.equal(ok, true)
})

test('bcrypt: wrong password fails', async () => {
  const hash = await hashPasswordBcrypt('P@ssw0rd!')
  const ok = await verifyPasswordCompat({ hash, password: 'wrong-password' })
  assert.equal(ok, false)
})

test('bcrypt: same password produces different hashes (unique salts)', async () => {
  const h1 = await hashPasswordBcrypt('SamePassword#1')
  const h2 = await hashPasswordBcrypt('SamePassword#1')
  assert.notEqual(h1, h2)
  assert.equal(await verifyPasswordCompat({ hash: h1, password: 'SamePassword#1' }), true)
  assert.equal(await verifyPasswordCompat({ hash: h2, password: 'SamePassword#1' }), true)
})

