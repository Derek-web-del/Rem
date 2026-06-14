import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { getLastResetUrl, resetResetUrls } from '../server/test-reset.mjs'
import {
  BETTER_AUTH_RESET_JWKS_FOR_TESTS,
  BETTER_AUTH_SECRET_FOR_TESTS,
} from './load-test-env.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const resetDescribe = PG_TEST_URL ? describe : describe.skip

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function runMigrate(env) {
  const cmd = process.platform === 'win32' ? 'cmd.exe' : npmCmd()
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run -s migrate']
      : ['run', '-s', 'migrate']
  execFileSync(cmd, args, {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })
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
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body ?? {}) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text, setCookie: getSetCookie(res) }
}

async function get(url, opts = {}) {
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

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function extractTokenFromResetUrl(url) {
  try {
    const u = new URL(url)
    const fromQuery = String(u.searchParams.get('token') || '').trim()
    if (fromQuery) return fromQuery
    const parts = u.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex((p) => p === 'reset-password')
    if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim()
  } catch {
    void 0
  }
  return ''
}

async function startTestServer(t) {
  const env = {
    NODE_ENV: 'test',
    BETTER_AUTH_URL: 'http://localhost:5173',
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_FOR_TESTS,
    BETTER_AUTH_RESET_JWKS: BETTER_AUTH_RESET_JWKS_FOR_TESTS,
    AUTH_DISABLE_SIGNUP: 'false',
    DATABASE_URL: PG_TEST_URL,
    AUTH_TEST_CAPTURE_RESET: '1',
    AUTH_LOCK_MS: '1200',
    RATE_LIMIT_MAX_SIGNIN: '1000',
    RATE_LIMIT_MAX_SEND_OTP: '1000',
    RATE_LIMIT_MAX_VERIFY_OTP: '1000',
    RATE_LIMIT_MAX_TOKEN: '1000',
    RATE_LIMIT_MAX_PASSWORD_RESET: '3',
    RATE_LIMIT_WINDOW_MS_PASSWORD_RESET: String(60 * 60 * 1000),
  }

  runMigrate(env)
  Object.assign(process.env, env)
  process.env.AUTH_MODULE_INSTANCE = String(Date.now())
  const { createApp } = await import('../server/index.js')
  const app = await createApp()
  const server = await listenTestServer(app)
  t.after(async () => {
    await teardownTestApp(server, app)
  })
  const port = server.address().port
  return { base: `http://127.0.0.1:${port}` }
}

async function promoteUserToAdmin(connectionString, email) {
  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await pool.query('UPDATE "user" SET role = $1 WHERE LOWER(email) = LOWER($2)', ['admin', email])
  } finally {
    await pool.end()
  }
}

resetDescribe('password reset flows (PostgreSQL)', () => {
  test('request reset for known user → reset with strong password succeeds', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('resetok')}@example.com`
    const oldPassword = 'Str0ng#Pass!'
    const newPassword = 'NewStr0ng#9!'

    await postJson(`${base}/api/auth/sign-up/email`, { email, password: oldPassword, name: 'Reset OK' })

    const request = await postJson(`${base}/api/auth/request-password-reset`, {
      email,
      redirectTo: '/reset-password',
    })
    assert.ok(request.res.status === 200 || request.res.status === 201, request.text)

    const resetUrl = getLastResetUrl(email)
    assert.ok(resetUrl, 'expected captured reset URL in test mode')
    const token = extractTokenFromResetUrl(resetUrl)
    assert.ok(token, 'expected token in reset URL')

    const reset = await postJson(`${base}/api/auth/reset-password`, {
      token,
      newPassword,
    })
    assert.ok(reset.res.status === 200 || reset.res.status === 201, reset.text)

    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password: newPassword })
    assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
  })

  test('reset with weak password is rejected', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('resetweak')}@example.com`
    const password = 'Str0ng#Pass!'

    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'Reset Weak' })
    await postJson(`${base}/api/auth/request-password-reset`, { email, redirectTo: '/reset-password' })
    const token = extractTokenFromResetUrl(getLastResetUrl(email))
    assert.ok(token)

    const reset = await postJson(`${base}/api/auth/reset-password`, { token, newPassword: 'weak' })
    assert.notEqual(reset.res.status, 200)
    assert.notEqual(reset.res.status, 201)
  })

  test('unknown email request still returns success (no leak)', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('unknown')}@example.com`

    const request = await postJson(`${base}/api/auth/request-password-reset`, {
      email,
      redirectTo: '/reset-password',
    })
    assert.ok(request.res.status === 200 || request.res.status === 201, request.text)
    assert.equal(getLastResetUrl(email), null)
  })

  test('4th reset request in window returns 429', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('ratelimit')}@example.com`
    const password = 'Str0ng#Pass!'
    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'Rate Limit' })

    for (let i = 0; i < 3; i++) {
      const r = await postJson(`${base}/api/auth/request-password-reset`, {
        email,
        redirectTo: '/reset-password',
      })
      assert.ok(r.res.status === 200 || r.res.status === 201, `attempt ${i + 1}: ${r.text}`)
    }

    const blocked = await postJson(`${base}/api/auth/request-password-reset`, {
      email,
      redirectTo: '/reset-password',
    })
    assert.equal(blocked.res.status, 429)
    assert.ok(String(blocked.text).toLowerCase().includes('too many password reset'))
  })

  test('audit ledger contains password_reset_requested and password_reset_completed', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('auditreset')}@example.com`
    const oldPassword = 'Str0ng#Pass!'
    const newPassword = 'AuditStr0ng#9!'

    await postJson(`${base}/api/auth/sign-up/email`, { email, password: oldPassword, name: 'Audit Reset' })

    const pool = new pg.Pool({ connectionString: PG_TEST_URL, max: 1 })
    try {
      const userRow = await pool.query('SELECT id FROM "user" WHERE LOWER(email) = LOWER($1)', [email])
      const userId = String(userRow.rows[0]?.id || '')
      assert.ok(userId)

      await postJson(`${base}/api/auth/request-password-reset`, { email, redirectTo: '/reset-password' })
      const token = extractTokenFromResetUrl(getLastResetUrl(email))
      assert.ok(token)
      await postJson(`${base}/api/auth/reset-password`, { token, newPassword })

      const requested = await pool.query(
        `
          SELECT details
          FROM lms_activity_logs
          WHERE "activityType" = 'PASSWORD_RESET_REQUESTED' AND "userId" = $1
          ORDER BY "timestamp" DESC
          LIMIT 1
        `,
        [userId],
      )
      assert.equal(requested.rows.length, 1)
      const reqDetails =
        typeof requested.rows[0].details === 'string'
          ? JSON.parse(requested.rows[0].details)
          : requested.rows[0].details
      assert.equal(reqDetails.eventType, 'password_reset_requested')

      const completed = await pool.query(
        `
          SELECT details
          FROM lms_activity_logs
          WHERE "activityType" = 'PASSWORD_RESET_COMPLETED' AND "userId" = $1
          ORDER BY "timestamp" DESC
          LIMIT 1
        `,
        [userId],
      )
      assert.equal(completed.rows.length, 1)
      const doneDetails =
        typeof completed.rows[0].details === 'string'
          ? JSON.parse(completed.rows[0].details)
          : completed.rows[0].details
      assert.equal(doneDetails.eventType, 'password_reset_completed')
    } finally {
      await pool.end()
    }
  })

  test('admin send-password-reset returns ok with masked email', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const adminEmail = `${uniq('adminreset')}@example.com`
    const targetEmail = `${uniq('targetreset')}@example.com`
    const password = 'Str0ng#Pass!'

    await postJson(`${base}/api/auth/sign-up/email`, {
      email: adminEmail,
      password,
      name: 'Admin Reset',
    })
    await promoteUserToAdmin(PG_TEST_URL, adminEmail)

    const adminSignIn = await postJson(`${base}/api/auth/sign-in/email`, { email: adminEmail, password })
    assert.ok(adminSignIn.res.status === 200 || adminSignIn.res.status === 201, adminSignIn.text)
    const cookieHeader = cookieHeaderFromSetCookies(adminSignIn.setCookie)

    const acceptTerms = await postJson(
      `${base}/api/v1/admin/accept-terms`,
      {},
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(acceptTerms.res.status === 200, acceptTerms.text)

    await postJson(`${base}/api/auth/sign-up/email`, {
      email: targetEmail,
      password,
      name: 'Target Reset',
    })

    const adminSend = await postJson(
      `${base}/api/v1/admin/send-password-reset`,
      { email: targetEmail },
      { headers: { Cookie: cookieHeader } },
    )
    assert.equal(adminSend.res.status, 200)
    assert.equal(adminSend.json?.ok, true)
    assert.ok(String(adminSend.json?.maskedEmail || '').includes('***'))
    assert.ok(getLastResetUrl(targetEmail))
  })

  test('reset password revokes existing session for that user', async (t) => {
    resetResetUrls()
    const { base } = await startTestServer(t)
    const email = `${uniq('revokesess')}@example.com`
    const oldPassword = 'Str0ng#Pass!'
    const newPassword = 'NewStr0ng#9!'

    await postJson(`${base}/api/auth/sign-up/email`, { email, password: oldPassword, name: 'Revoke Session' })

    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password: oldPassword })
    assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
    const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)
    assert.ok(cookieHeader, 'expected session cookie after sign-in')

    const before = await get(`${base}/api/auth/get-session`, { headers: { Cookie: cookieHeader } })
    assert.equal(before.res.status, 200, before.text)
    assert.ok(before.json?.session?.id || before.json?.user?.id, 'expected active session before reset')

    await postJson(`${base}/api/auth/request-password-reset`, { email, redirectTo: '/reset-password' })
    const token = extractTokenFromResetUrl(getLastResetUrl(email))
    assert.ok(token)

    const reset = await postJson(`${base}/api/auth/reset-password`, { token, newPassword })
    assert.ok(reset.res.status === 200 || reset.res.status === 201, reset.text)

    const after = await get(`${base}/api/auth/get-session`, { headers: { Cookie: cookieHeader } })
    assert.equal(after.res.status, 200, after.text)
    assert.ok(
      !after.json?.session?.id && !after.json?.user?.id,
      'session should be cleared after password reset',
    )
  })
})
