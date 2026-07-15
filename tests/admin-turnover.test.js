import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

describe('admin turnover API', () => {
  it('GET /api/v1/admin/turnover/candidates requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `turnover-candidates-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/turnover/candidates`)
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('POST /api/v1/admin/turnover/transfer requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `turnover-transfer-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/turnover/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: '999', demoteSelf: false }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('admin turnover router without PostgreSQL', () => {
  it('returns DATABASE_NOT_CONFIGURED when PostgreSQL is unavailable', async (t) => {
    const { isPgConfigured } = await import('../server/pgPool.js')
    if (isPgConfigured()) {
      t.skip('PostgreSQL is configured in this environment')
      return
    }
    const { createAdminTurnoverRouter } = await import('../server/api/adminTurnoverV1.js')
    const express = (await import('express')).default
    const app = express()
    app.use('/api', createAdminTurnoverRouter(express, {}))
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/turnover/candidates`)
      assert.equal(res.status, 503)
      const json = await res.json()
      assert.equal(json.error, 'DATABASE_NOT_CONFIGURED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
