import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getEventLabel } from '../Frontend/src/lib/auditEventDisplay.js'
import { resolveAuditEventIconKey } from '../Frontend/src/lib/auditEventIcons.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

describe('admin audit gap event labels', () => {
  it('maps roster archive restore and purge events', () => {
    assert.equal(getEventLabel('', 'STUDENT_CREATED'), 'Student created')
    assert.equal(getEventLabel('', 'STUDENT_DELETED'), 'Student archived')
    assert.equal(getEventLabel('', 'STUDENT_RESTORED'), 'Student restored')
    assert.equal(getEventLabel('', 'STUDENT_PERMANENTLY_PURGED'), 'Student permanently purged')
    assert.equal(getEventLabel('', 'STUDENT_IMMEDIATELY_PURGED'), 'Student immediately purged')
    assert.equal(getEventLabel('', 'FACULTY_CREATED'), 'Faculty created')
    assert.equal(getEventLabel('', 'FACULTY_DELETED'), 'Faculty archived')
    assert.equal(getEventLabel('', 'FACULTY_RESTORED'), 'Faculty restored')
    assert.equal(getEventLabel('', 'FACULTY_PERMANENTLY_PURGED'), 'Faculty permanently purged')
    assert.equal(getEventLabel('', 'FACULTY_IMMEDIATELY_PURGED'), 'Faculty immediately purged')
  })

  it('maps backup and audit clear events', () => {
    assert.equal(getEventLabel('', 'BACKUP_SCHEDULE_UPDATED'), 'Backup schedule updated')
    assert.equal(getEventLabel('', 'BACKUP_CREATED'), 'Backup created')
    assert.equal(getEventLabel('', 'AUDIT_LOGS_CLEARED'), 'Audit logs cleared')
    assert.equal(getEventLabel('', 'SECTION_ARCHIVED'), 'Section archived')
  })
})

describe('admin audit gap event icons', () => {
  it('maps restore and purge roster events', () => {
    assert.equal(resolveAuditEventIconKey({ activityType: 'STUDENT_RESTORED' }), 'user_created')
    assert.equal(resolveAuditEventIconKey({ activityType: 'FACULTY_RESTORED' }), 'user_created')
    assert.equal(resolveAuditEventIconKey({ activityType: 'STUDENT_DELETED' }), 'user_blocked')
    assert.equal(resolveAuditEventIconKey({ activityType: 'STUDENT_PERMANENTLY_PURGED' }), 'user_blocked')
    assert.equal(resolveAuditEventIconKey({ activityType: 'STUDENT_IMMEDIATELY_PURGED' }), 'user_blocked')
    assert.equal(resolveAuditEventIconKey({ activityType: 'BACKUP_SCHEDULE_UPDATED' }), 'backup')
  })
})

describe('curriculum API admin gate', () => {
  it('POST /api/v1/curriculum requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `audit-gap-cur-post-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/curriculum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Guide',
          description: 'Desc',
          grade_level: '7',
        }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PUT /api/v1/curriculum/:id requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `audit-gap-cur-put-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/curriculum/1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Guide',
          description: 'Desc',
          grade_level: '7',
        }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/v1/sections/:id requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `audit-gap-sec-patch-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/sections/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_name: 'Section A', grade_level: 'Grade 7' }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('section curriculum audit helpers', () => {
  it('computeSectionDetailedDiffs detects name change for SECTION_UPDATED payload', async () => {
    const { computeSectionDetailedDiffs } = await import('../server/lib/sectionAudit.js')
    const diffs = computeSectionDetailedDiffs(
      { id: '1', postgresSectionId: 1, name: 'Old Name', grade: 'Grade 7' },
      { id: '1', postgresSectionId: 1, name: 'New Name', grade: 'Grade 7' },
    )
    assert.ok(diffs['Section name'])
    assert.equal(diffs['Section name'].old, 'Old Name')
    assert.equal(diffs['Section name'].new, 'New Name')
  })
})
