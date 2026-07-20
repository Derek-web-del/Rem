import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateProfileImageDataUrl } from '../server/lib/security.js'

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('validateProfileImageDataUrl', () => {
  it('returns null for empty input', () => {
    assert.equal(validateProfileImageDataUrl(''), null)
    assert.equal(validateProfileImageDataUrl(null), null)
  })

  it('accepts a small PNG data URL', () => {
    assert.equal(validateProfileImageDataUrl(tinyPng), tinyPng)
  })

  it('rejects non-image data URLs', () => {
    assert.throws(
      () => validateProfileImageDataUrl('data:text/plain;base64,abc'),
      (err) => err.code === 'INVALID_IMAGE',
    )
  })

  it('rejects oversize images', () => {
    const hugeBase64 = 'A'.repeat(3 * 1024 * 1024)
    assert.throws(
      () => validateProfileImageDataUrl(`data:image/png;base64,${hugeBase64}`),
      (err) => err.code === 'IMAGE_TOO_LARGE',
    )
  })
})
