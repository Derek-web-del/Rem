import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/index.js'

describe('security headers (helmet)', () => {
  it('sets X-Frame-Options, X-Content-Type-Options on /health', async () => {
    process.env.AUTH_MODULE_INSTANCE = `sec-headers-${Date.now()}`
    const app = await createApp()
    const server = app.listen(0)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      assert.equal(res.status, 200)
      const frame = res.headers.get('x-frame-options')
      const nosniff = res.headers.get('x-content-type-options')
      assert.ok(frame, 'expected X-Frame-Options')
      assert.match(String(frame), /deny/i)
      assert.equal(nosniff, 'nosniff')
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
      try {
        await app.locals.disposeAuthBackend?.()
      } catch {
        /* ignore */
      }
    }
  })
})
