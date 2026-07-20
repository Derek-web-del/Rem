import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import '../server/env-bootstrap.js'

// See security-incidents.test.js for why NODE_ENV must be set before the first
// dynamic import of server/index.js in this file.
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'
import { isValidSchoolYear, getSchoolYear, setSchoolYear } from '../server/lib/institutionSettingsDb.js'

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

function makeMockPool(extraHandlers = {}) {
  const calls = []
  const pool = {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      if (sql.includes('CREATE TABLE') || sql.includes('INSERT INTO public.institute_settings (id, school_year) VALUES ($1, NULL)')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT school_year FROM public.institute_settings')) {
        return { rows: [{ school_year: extraHandlers.schoolYear ?? null }] }
      }
      if (sql.includes('INSERT INTO public.institute_settings (id, school_year, updated_at, updated_by)')) {
        return { rows: [{ school_year: params[1] }] }
      }
      return { rows: [] }
    },
  }
  return pool
}

describe('isValidSchoolYear', () => {
  it('accepts YYYY-YYYY format, tolerating surrounding whitespace', () => {
    assert.equal(isValidSchoolYear('2025-2026'), true)
    assert.equal(isValidSchoolYear(' 2025-2026 '), true)
  })

  it('rejects missing, malformed, or partial values', () => {
    assert.equal(isValidSchoolYear(''), false)
    assert.equal(isValidSchoolYear(null), false)
    assert.equal(isValidSchoolYear('2025'), false)
    assert.equal(isValidSchoolYear('2025/2026'), false)
    assert.equal(isValidSchoolYear('25-26'), false)
  })
})

describe('getSchoolYear / setSchoolYear (mock pool)', () => {
  it('returns null when unset', async () => {
    const pool = makeMockPool({ schoolYear: null })
    const value = await getSchoolYear(pool)
    assert.equal(value, null)
  })

  it('returns the stored value', async () => {
    const pool = makeMockPool({ schoolYear: '2024-2025' })
    const value = await getSchoolYear(pool)
    assert.equal(value, '2024-2025')
  })

  it('rejects an invalid format without writing', async () => {
    const pool = makeMockPool()
    await assert.rejects(() => setSchoolYear(pool, 'not-a-year'), (e) => e.code === 'INVALID_SCHOOL_YEAR')
    const upsertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.institute_settings (id, school_year, updated_at, updated_by)'))
    assert.equal(upsertCall, undefined)
  })

  it('persists a valid value and returns it', async () => {
    const pool = makeMockPool()
    const value = await setSchoolYear(pool, '2025-2026', 'admin-user-1')
    assert.equal(value, '2025-2026')
    const upsertCall = pool.calls.find((c) => c.sql.includes('INSERT INTO public.institute_settings (id, school_year, updated_at, updated_by)'))
    assert.ok(upsertCall)
    assert.deepEqual(upsertCall.params, ['default', '2025-2026', 'admin-user-1'])
  })
})

describe('school year API auth', () => {
  it('GET /api/v1/school-year requires a session (401 when signed out)', async () => {
    process.env.AUTH_MODULE_INSTANCE = `school-year-get-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/school-year`)
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PUT /api/v1/school-year requires an admin session (403 when signed out)', async () => {
    process.env.AUTH_MODULE_INSTANCE = `school-year-put-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/school-year`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolYear: '2025-2026' }),
      })
      assert.equal(res.status, 403)
      const json = await res.json()
      assert.equal(json.error, 'FORBIDDEN')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describeWithPg('school year API as authenticated admin', () => {
  it('rejects invalid input, saves a valid value, and the value round-trips over GET', async () => {
    Object.assign(process.env, {
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
      BETTER_AUTH_SECRET:
        (process.env.BETTER_AUTH_SECRET || '').trim() || 'test-secret-abcdefghijklmnopqrstuvwxyz012345',
      AUTH_DISABLE_SIGNUP: 'false',
      AUTH_MODULE_INSTANCE: `school-year-admin-${Date.now()}`,
      RATE_LIMIT_MAX_SIGNIN: '1000',
    })
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`
    try {
      const adminEmail = `${uniq('schoolyearadmin')}@example.com`
      const password = 'Str0ng#Pass!'
      const signUp = await postJson(`${base}/api/auth/sign-up/email`, {
        email: adminEmail,
        password,
        name: 'School Year Admin',
      })
      assert.ok(signUp.res.status === 200 || signUp.res.status === 201, signUp.text)
      await promoteUserToAdmin(PG_TEST_URL, adminEmail)

      const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email: adminEmail, password })
      assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
      const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)

      const acceptTerms = await postJson(`${base}/api/v1/admin/accept-terms`, {}, { headers: { Cookie: cookieHeader } })
      assert.ok(acceptTerms.res.status === 200, acceptTerms.text)

      // Invalid format is rejected with 400, not silently coerced or a 500 crash.
      const badPut = await postJson(
        `${base}/api/v1/school-year`,
        { schoolYear: 'not-a-year' },
        { method: 'PUT', headers: { Cookie: cookieHeader } },
      )
      assert.equal(badPut.res.status, 400)
      assert.equal(badPut.json?.error, 'INVALID_SCHOOL_YEAR')

      // Valid update succeeds.
      const goodPut = await postJson(
        `${base}/api/v1/school-year`,
        { schoolYear: '2025-2026' },
        { method: 'PUT', headers: { Cookie: cookieHeader } },
      )
      assert.equal(goodPut.res.status, 200)
      assert.equal(goodPut.json?.schoolYear, '2025-2026')

      // GET (as the same admin session) reflects the persisted value.
      const get = await getJson(`${base}/api/v1/school-year`, { headers: { Cookie: cookieHeader } })
      assert.equal(get.res.status, 200)
      assert.equal(get.json?.schoolYear, '2025-2026')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('school year router without PostgreSQL', () => {
  it('returns DATABASE_NOT_CONFIGURED when PostgreSQL is unavailable', async (t) => {
    const { isPgConfigured } = await import('../server/pgPool.js')
    if (isPgConfigured()) {
      t.skip('PostgreSQL is configured in this environment')
      return
    }
    const { createSchoolYearRouter } = await import('../server/api/schoolYearV1.js')
    const express = (await import('express')).default
    const app = express()
    app.use('/api', createSchoolYearRouter(express, {}))
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/school-year`)
      assert.equal(res.status, 503)
      const json = await res.json()
      assert.equal(json.error, 'DATABASE_NOT_CONFIGURED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})
