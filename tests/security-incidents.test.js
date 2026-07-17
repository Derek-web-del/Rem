import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import '../server/env-bootstrap.js'

// better-auth's `isTest()` is a module-level constant frozen at first import of
// `@better-auth/core/env` — it reads NODE_ENV once and never re-checks. Set it here,
// before ANY test in this file dynamically imports `server/index.js`, so origin/CSRF
// checks are correctly relaxed for every test in this file (matches other test files
// that set NODE_ENV='test' before their first `createApp()` import).
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'
import { createSecurityIncident, listSecurityIncidents } from '../server/lib/securityIncidents.js'
import { saveQuizViolations } from '../server/lib/quizSubmissionsDb.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describeWithPg = PG_TEST_URL ? describe : describe.skip

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getSetCookie(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
  const v = res.headers.get('set-cookie')
  return v ? [v] : []
}

function cookieHeaderFromSetCookies(setCookies) {
  return setCookies
    .map((c) => String(c).split(';')[0])
    .filter(Boolean)
    .join('; ')
}

async function postJson(url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const res = await fetch(url, { method: opts.method || 'POST', headers, body: JSON.stringify(body ?? {}) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text, setCookie: getSetCookie(res) }
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, { method: 'GET', headers: opts.headers || {} })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

async function promoteUserToAdmin(connectionString, email) {
  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await pool.query('UPDATE "user" SET role = $1 WHERE LOWER(email) = LOWER($2)', ['admin', email])
  } finally {
    await pool.end()
  }
}

function insertRowFromParams(params) {
  const [incidentType, severity, sourceEventId, affectedUserId, affectedUserLabel, detectedBy, summary, detailsJson] =
    params
  return {
    id: 1,
    incident_type: incidentType,
    severity,
    status: 'open',
    source_event_id: sourceEventId,
    affected_user_id: affectedUserId,
    affected_user_label: affectedUserLabel,
    detected_by: detectedBy,
    assigned_to: null,
    summary,
    details: JSON.parse(detailsJson || '{}'),
    resolution_notes: null,
    resolved_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function makeMockPool(extraHandlers = {}) {
  const calls = []
  const pool = {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.security_incidents')) {
        return { rows: [insertRowFromParams(params)] }
      }
      for (const [needle, handler] of Object.entries(extraHandlers)) {
        if (sql.includes(needle)) return handler(sql, params)
      }
      return { rows: [] }
    },
  }
  return pool
}

describe('createSecurityIncident', () => {
  it('inserts a row with correct defaults', async () => {
    const pool = makeMockPool()
    const incident = await createSecurityIncident(pool, {
      incidentType: 'auth_brute_force',
      summary: 'Account locked after failed sign-in attempts.',
      affectedUserId: '42',
      affectedUserLabel: 'jane@example.com',
    })

    assert.ok(incident)
    assert.equal(incident.incident_type, 'AUTH_BRUTE_FORCE')
    assert.equal(incident.severity, 'medium')
    assert.equal(incident.status, 'open')
    assert.equal(incident.detected_by, 'system')
    assert.equal(incident.affected_user_id, '42')
    assert.equal(incident.affected_user_label, 'jane@example.com')

    const insertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.security_incidents'))
    assert.ok(insertCall, 'expected an INSERT INTO public.security_incidents call')
  })

  it('falls back to a safe severity for unknown values', async () => {
    const pool = makeMockPool()
    const incident = await createSecurityIncident(pool, {
      incidentType: 'quiz_integrity',
      severity: 'not-a-real-severity',
      summary: 'Test',
    })
    assert.equal(incident.severity, 'medium')
  })

  it('never throws even when the pool query fails', async () => {
    const pool = {
      query: async () => {
        throw new Error('boom')
      },
    }
    const incident = await createSecurityIncident(pool, { incidentType: 'AUTH_BRUTE_FORCE', summary: 'x' })
    assert.equal(incident, null)
  })
})

describe('listSecurityIncidents filters', () => {
  it('applies status and severity filters to the SQL', async () => {
    const pool = makeMockPool()
    await listSecurityIncidents(pool, { status: 'resolved', severity: 'high' })
    const listCall = pool.calls.find((c) => c.sql.includes('SELECT * FROM public.security_incidents'))
    assert.ok(listCall)
    assert.ok(listCall.sql.includes('AND status = $1'))
    assert.ok(listCall.sql.includes('AND severity = $2'))
    assert.deepEqual(listCall.params, ['resolved', 'high'])
  })

  it('ignores invalid status/severity values', async () => {
    const pool = makeMockPool()
    await listSecurityIncidents(pool, { status: 'bogus', severity: 'extreme' })
    const listCall = pool.calls.find((c) => c.sql.includes('SELECT * FROM public.security_incidents'))
    assert.ok(listCall)
    assert.equal(listCall.params.length, 0)
  })
})

function makeSubmissionPool(id) {
  return makeMockPool({
    'SELECT * FROM quiz_submissions WHERE quiz_id': (sql, params) => ({
      rows: [
        {
          id,
          quiz_id: params[0],
          student_id: params[1],
          status: 'in_progress',
          score: null,
          total_points: null,
          time_spent_seconds: 0,
          started_at: new Date(),
          submitted_at: null,
          attempt_number: 1,
          late_submission_until: null,
          violations: '[]',
        },
      ],
    }),
  })
}

describe('quiz integrity violation threshold', () => {
  it('creates a QUIZ_INTEGRITY incident once violations reach the threshold', async () => {
    const pool = makeSubmissionPool(10)

    const result = await saveQuizViolations(pool, '5', '7', [
      { type: 'tab_switch', question_number: 1 },
      { type: 'tab_switch', question_number: 2 },
      { type: 'fullscreen_exit', question_number: 3 },
    ])
    assert.equal(result.violation_count, 3)

    // createSecurityIncident is fired without awaiting inside saveQuizViolations; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 20))

    const insertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.security_incidents'))
    assert.ok(insertCall, 'expected a security incident to be created')
    assert.equal(insertCall.params[0], 'QUIZ_INTEGRITY')
    assert.equal(insertCall.params[1], 'medium')
  })

  it('does not create an incident below the threshold', async () => {
    const pool = makeSubmissionPool(11)

    const result = await saveQuizViolations(pool, '5', '7', [{ type: 'tab_switch', question_number: 1 }])
    assert.equal(result.violation_count, 1)

    await new Promise((resolve) => setTimeout(resolve, 20))

    const insertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.security_incidents'))
    assert.equal(insertCall, undefined)
  })

  it('raises severity to high once the count reaches 6', async () => {
    const pool = makeSubmissionPool(12)

    const result = await saveQuizViolations(
      pool,
      '5',
      '7',
      Array.from({ length: 6 }, (_, i) => ({ type: 'tab_switch', question_number: i + 1 })),
    )
    assert.equal(result.violation_count, 6)

    await new Promise((resolve) => setTimeout(resolve, 20))

    const insertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.security_incidents'))
    assert.ok(insertCall)
    assert.equal(insertCall.params[1], 'high')
  })
})

describe('security incidents API', () => {
  it('GET /api/v1/admin/security-incidents requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `security-incidents-list-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/security-incidents`)
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/v1/admin/security-incidents/:id requires admin session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `security-incidents-patch-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/security-incidents/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describeWithPg('security incidents API as authenticated admin', () => {
  it('lists, filters, and triages a real incident end-to-end; rejects malformed input', async (t) => {
    Object.assign(process.env, {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
      BETTER_AUTH_SECRET:
        (process.env.BETTER_AUTH_SECRET || '').trim() || 'test-secret-abcdefghijklmnopqrstuvwxyz012345',
      AUTH_DISABLE_SIGNUP: 'false',
      AUTH_MODULE_INSTANCE: `security-incidents-admin-${Date.now()}`,
      RATE_LIMIT_MAX_SIGNIN: '1000',
    })
    const { createApp } = await import('../server/index.js')
    const { getPgPool } = await import('../server/pgPool.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`
    let incidentId = null
    try {
      const adminEmail = `${uniq('incidentadmin')}@example.com`
      const password = 'Str0ng#Pass!'
      const signUp = await postJson(`${base}/api/auth/sign-up/email`, {
        email: adminEmail,
        password,
        name: 'Incident Admin',
      })
      assert.ok(signUp.res.status === 200 || signUp.res.status === 201, signUp.text)
      await promoteUserToAdmin(PG_TEST_URL, adminEmail)

      const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email: adminEmail, password })
      assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
      const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)

      const acceptTerms = await postJson(`${base}/api/v1/admin/accept-terms`, {}, { headers: { Cookie: cookieHeader } })
      assert.ok(acceptTerms.res.status === 200, acceptTerms.text)

      // Seed a real incident directly through the library (simulates a detection hook firing).
      const seeded = await createSecurityIncident(getPgPool(), {
        incidentType: 'AUTH_BRUTE_FORCE',
        summary: 'End-to-end test incident',
        affectedUserLabel: adminEmail,
      })
      assert.ok(seeded, 'expected the seeded incident to be created')
      incidentId = seeded.id

      // GET requires admin session and returns the seeded row.
      const list = await getJson(`${base}/api/v1/admin/security-incidents?status=open`, {
        headers: { Cookie: cookieHeader },
      })
      assert.equal(list.res.status, 200)
      assert.ok(list.json?.ok)
      assert.ok(list.json.incidents.some((i) => i.id === incidentId))

      // Malformed id → 400, not a 500 crash.
      const badId = await postJson(
        `${base}/api/v1/admin/security-incidents/not-a-number`,
        { status: 'resolved' },
        { method: 'PATCH', headers: { Cookie: cookieHeader } },
      )
      assert.equal(badId.res.status, 400)
      assert.equal(badId.json?.error, 'BAD_REQUEST')

      // Unknown id (valid format, no row) → 404, not a 500 crash.
      const missing = await postJson(
        `${base}/api/v1/admin/security-incidents/999999999`,
        { status: 'resolved' },
        { method: 'PATCH', headers: { Cookie: cookieHeader } },
      )
      assert.equal(missing.res.status, 404)

      // Invalid status value → 400 with a helpful message, not silently coerced.
      const badStatus = await postJson(
        `${base}/api/v1/admin/security-incidents/${incidentId}`,
        { status: 'hacked' },
        { method: 'PATCH', headers: { Cookie: cookieHeader } },
      )
      assert.equal(badStatus.res.status, 400)
      assert.equal(badStatus.json?.error, 'BAD_REQUEST')

      // Valid update succeeds and persists.
      const goodUpdate = await postJson(
        `${base}/api/v1/admin/security-incidents/${incidentId}`,
        { status: 'resolved', assignedTo: 'Admin QA', resolutionNotes: 'Confirmed false positive.' },
        { method: 'PATCH', headers: { Cookie: cookieHeader } },
      )
      assert.equal(goodUpdate.res.status, 200)
      assert.equal(goodUpdate.json?.incident?.status, 'resolved')
      assert.equal(goodUpdate.json?.incident?.assigned_to, 'Admin QA')
      assert.ok(goodUpdate.json?.incident?.resolved_at)

      // Unauthenticated requests remain blocked.
      const unauth = await getJson(`${base}/api/v1/admin/security-incidents`)
      assert.equal(unauth.res.status, 403)
    } finally {
      if (incidentId) {
        try {
          await getPgPool().query('DELETE FROM public.security_incidents WHERE id = $1', [incidentId])
        } catch {
          /* best effort cleanup */
        }
      }
      await teardownTestApp(server, app)
    }
  })
})

describe('security incidents router without PostgreSQL', () => {
  it('returns DATABASE_NOT_CONFIGURED when PostgreSQL is unavailable', async (t) => {
    const { isPgConfigured } = await import('../server/pgPool.js')
    if (isPgConfigured()) {
      t.skip('PostgreSQL is configured in this environment')
      return
    }
    const { createSecurityIncidentsRouter } = await import('../server/api/securityIncidentsV1.js')
    const express = (await import('express')).default
    const app = express()
    app.use('/api', createSecurityIncidentsRouter(express, {}))
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/admin/security-incidents`)
      assert.equal(res.status, 503)
      const json = await res.json()
      assert.equal(json.error, 'DATABASE_NOT_CONFIGURED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
