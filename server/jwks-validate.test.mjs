import test from 'node:test'
import assert from 'node:assert/strict'
import { exportJWK, generateKeyPair } from 'jose'
import { assertValidJwksJson } from './jwks-validate.mjs'

test('assertValidJwksJson rejects non-objects', () => {
  assert.throws(() => assertValidJwksJson(null), /JSON object/)
  assert.throws(() => assertValidJwksJson([]), /JSON object/)
})

test('assertValidJwksJson rejects missing keys array', () => {
  assert.throws(() => assertValidJwksJson({}), /keys/)
})

test('assertValidJwksJson accepts JWKS from Ed25519 JWK', async () => {
  const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'unit-test-kid'
  assertValidJwksJson({ keys: [jwk] })
})
