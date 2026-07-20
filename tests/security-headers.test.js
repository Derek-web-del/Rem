import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

describe('security headers (helmet)', () => {
  it('sets X-Frame-Options, X-Content-Type-Options on /api/health', async () => {
    process.env.AUTH_MODULE_INSTANCE = `sec-headers-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      assert.equal(res.status, 200)
      const frame = res.headers.get('x-frame-options')
      const nosniff = res.headers.get('x-content-type-options')
      assert.ok(frame, 'expected X-Frame-Options')
      assert.match(String(frame), /sameorigin/i)
      assert.equal(nosniff, 'nosniff')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
