import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { blockTeacherCurriculumStructureWrite } from '../server/api/adminSubjectCurriculum.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

describe('admin subject curriculum API auth', () => {
  it('POST /api/admin/subjects/:id/topics requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `admin-topic-post-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/subjects/1/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Quarter 1' }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('GET /api/admin/subjects/:id/topics requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `admin-topic-get-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/subjects/1/topics`)
      assert.equal(res.status, 403)
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('teacher curriculum structure write guard', () => {
  it('blockTeacherCurriculumStructureWrite returns 403 with institute admin message', () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        this.body = payload
        return this
      },
    }
    blockTeacherCurriculumStructureWrite({}, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.error, 'FORBIDDEN')
    assert.match(res.body.message, /institute admin/i)
  })

  it('POST /api/teacher/subjects/:id/topics returns 401 without faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `teacher-topic-block-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Blocked topic' }),
      })
      assert.equal(res.status, 401)
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('POST /api/teacher/subjects/:id/modules returns 401 without faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `teacher-module-block-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Module 1' }),
      })
      assert.equal(res.status, 401)
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
