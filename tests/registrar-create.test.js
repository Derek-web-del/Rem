import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createInstituteAuthUserDirect } from '../server/lib/provisionPortalAuthUser.js'

describe('createInstituteAuthUserDirect validation', () => {
  it('returns BAD_REQUEST when required fields are missing', async () => {
    const pool = {
      query: async () => {
        throw new Error('pool should not be called for invalid input')
      },
    }
    const result = await createInstituteAuthUserDirect(pool, {
      email: '',
      name: 'Test',
      username: 'reg-test',
      password: 'Test1234!',
      role: 'registrar',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'BAD_REQUEST')
  })
})

describe('registrar create API auth gate', () => {
  it('POST /api/v1/admin/registrars requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `registrar-create-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const { listenTestServer, teardownTestApp } = await import('./helpers/teardown-test-app.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/registrars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Registrar',
          email: 'registrar-test@example.com',
          username: 'reg-test-user',
          password: 'Test1234!',
        }),
      })
      assert.equal(res.status, 403)
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('GET /api/v1/registrar/profile-photo requires registrar session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `registrar-photo-get-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const { listenTestServer, teardownTestApp } = await import('./helpers/teardown-test-app.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/registrar/profile-photo`)
      assert.equal(res.status, 403)
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/v1/registrar/profile-photo requires registrar session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `registrar-photo-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const { listenTestServer, teardownTestApp } = await import('./helpers/teardown-test-app.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/registrar/profile-photo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileImageDataUrl: tinyPng }),
      })
      assert.equal(res.status, 403)
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
