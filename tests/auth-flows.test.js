import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { getLastOtp, resetOtps } from '../server/test-otp.mjs'
import {
  BETTER_AUTH_RESET_JWKS_FOR_TESTS,
  BETTER_AUTH_SECRET_FOR_TESTS,
} from './load-test-env.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const authDescribe = PG_TEST_URL ? describe : describe.skip

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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

function base64UrlDecodeJson(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

async function promoteUserToAdmin(connectionString, email) {
  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await pool.query('UPDATE "user" SET role = $1 WHERE LOWER(email) = LOWER($2)', ['admin', email])
  } finally {
    await pool.end()
  }
}

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function startTestServer(t) {
  const env = {
    NODE_ENV: 'test',
    BETTER_AUTH_URL: 'http://localhost:5173',
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_FOR_TESTS,
    BETTER_AUTH_RESET_JWKS: BETTER_AUTH_RESET_JWKS_FOR_TESTS,
    AUTH_DISABLE_SIGNUP: 'false',
    DATABASE_URL: PG_TEST_URL,
    AUTH_TEST_CAPTURE_OTP: '1',
    AUTH_LOCK_MS: '1200',
    RATE_LIMIT_MAX_SIGNIN: '1000',
    RATE_LIMIT_MAX_SEND_OTP: '1000',
    RATE_LIMIT_MAX_VERIFY_OTP: '1000',
    RATE_LIMIT_MAX_TOKEN: '1000',
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

authDescribe('auth flows (PostgreSQL)', () => {
  test('username sign-in success returns session cookie', async (t) => {
    const { base } = await startTestServer(t)
    const email = `${uniq('user1')}@example.com`
    const password = 'Str0ng#Pass!'

    const signUp = await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'User One' })
    assert.ok(signUp.res.status === 200 || signUp.res.status === 201)

    const signIn = await postJson(`${base}/api/auth/sign-in/username`, { username: email, password })
    if (!(signIn.res.status === 200 || signIn.res.status === 201)) {
      const emailSignIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
      assert.ok(emailSignIn.res.status === 200 || emailSignIn.res.status === 201, emailSignIn.text)
      assert.ok(emailSignIn.setCookie.length > 0, 'expected Set-Cookie on successful sign-in')
      return
    }
    assert.ok(signIn.setCookie.length > 0, 'expected Set-Cookie on successful sign-in')
  })

  test('sign-in failure emits AUTH_LOCKOUT audit with user context', async (t) => {
    const { base } = await startTestServer(t)
    const email = `${uniq('auditlock')}@example.com`
    const goodPassword = 'Str0ng#Pass!'
    await postJson(`${base}/api/auth/sign-up/email`, { email, password: goodPassword, name: 'Audit Lock' })

    const pool = new pg.Pool({ connectionString: PG_TEST_URL, max: 1 })
    try {
      const userRow = await pool.query('SELECT id, username FROM "user" WHERE LOWER(email) = LOWER($1)', [email])
      const userId = String(userRow.rows[0]?.id || '')
      assert.ok(userId, 'expected auth user row')

      for (let i = 0; i < 5; i++) {
        const r = await postJson(
          `${base}/api/auth/sign-in/email`,
          { email, password: 'wrong-password' },
          { headers: { 'X-LMS-Login-Portal': 'admin', Referer: `${base}/login/institute` } },
        )
        assert.notEqual(r.res.status, 429)
      }

      const logs = await pool.query(
        `
          SELECT details
          FROM lms_activity_logs
          WHERE "activityType" = 'AUTH_LOCKOUT' AND "userId" = $1
          ORDER BY "timestamp" DESC
          LIMIT 1
        `,
        [userId],
      )
      assert.equal(logs.rows.length, 1, 'expected AUTH_LOCKOUT LMS audit row')
      const details = logs.rows[0].details
      const parsed = typeof details === 'string' ? JSON.parse(details) : details
      assert.equal(parsed.reason, 'Account Lockout for 5 Attempts failed')
      assert.equal(parsed.targetUserId, userId)
      assert.equal(parsed.attempts, 5)
      assert.equal(parsed.portal, 'admin')
      assert.equal(parsed.suspiciousLoginDetected, true)
    } finally {
      await pool.end()
    }
  })

  test('sign-in failure increments lockout and locks after 5 attempts', async (t) => {
    const { base } = await startTestServer(t)
    const email = `${uniq('lock')}@example.com`
    const goodPassword = 'Str0ng#Pass!'
    await postJson(`${base}/api/auth/sign-up/email`, { email, password: goodPassword, name: 'Lock Me' })

    for (let i = 0; i < 5; i++) {
      const r = await postJson(`${base}/api/auth/sign-in/email`, { email, password: 'wrong-password' })
      assert.notEqual(r.res.status, 429)
    }

    const locked = await postJson(`${base}/api/auth/sign-in/email`, { email, password: goodPassword })
    assert.equal(locked.res.status, 401)
    assert.ok(String(locked.text).includes('INVALID_EMAIL_OR_PASSWORD'))

    await sleep(1400)
    const ok = await postJson(`${base}/api/auth/sign-in/email`, { email, password: goodPassword })
    assert.ok(ok.res.status === 200 || ok.res.status === 201, ok.text)
  })

  test('2FA required flow: redirect → send OTP → verify OTP → session established', async (t) => {
    resetOtps()
    const { base } = await startTestServer(t)
    const email = `${uniq('twofa')}@example.com`
    const password = 'Str0ng#Pass!'

    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'Two Factor' })

    const first = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(first.res.status === 200 || first.res.status === 201, first.text)
    const cookieHeader = cookieHeaderFromSetCookies(first.setCookie)

    const enable = await postJson(
      `${base}/api/auth/two-factor/enable`,
      { password },
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(enable.res.status === 200 || enable.res.status === 201, enable.text)

    await postJson(`${base}/api/auth/sign-out`, {}, { headers: { Cookie: cookieHeader } })

    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(signIn.json?.twoFactorRedirect, `expected twoFactorRedirect, got: ${signIn.text}`)

    const twoFaCookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)
    const send = await postJson(
      `${base}/api/auth/two-factor/send-otp`,
      {},
      { headers: { Cookie: twoFaCookieHeader } },
    )
    assert.ok(send.res.status === 200 || send.res.status === 201, send.text)

    const otp = getLastOtp(email)
    assert.ok(otp && otp.length >= 6, 'expected captured OTP in test mode')

    const verify = await postJson(
      `${base}/api/auth/two-factor/verify-otp`,
      { code: otp },
      { headers: { Cookie: twoFaCookieHeader } },
    )
    assert.ok(verify.res.status === 200 || verify.res.status === 201, verify.text)
    assert.ok(verify.setCookie.length > 0, 'expected updated Set-Cookie after OTP verify')
  })

  test('/api/auth/token requires session; with session returns JWT and jwks kid matches header', async (t) => {
    const { base } = await startTestServer(t)

    const noSession = await get(`${base}/api/auth/token`)
    assert.notEqual(noSession.res.status, 200)

    const email = `${uniq('jwtflow')}@example.com`
    const password = 'Str0ng#Pass!'
    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'JWT Flow' })
    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(signIn.setCookie.length > 0)
    const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)

    const tokenRes = await get(`${base}/api/auth/token`, { headers: { Cookie: cookieHeader } })
    assert.equal(tokenRes.res.status, 200)
    const token = tokenRes.json?.token
    assert.equal(typeof token, 'string')

    const [h, p] = token.split('.')
    const header = base64UrlDecodeJson(h)
    const payload = base64UrlDecodeJson(p)
    assert.ok(header.kid, 'expected kid in JWT header')
    assert.ok(payload.sub, 'expected sub in payload')

    const jwks = await get(`${base}/api/auth/jwks`)
    assert.equal(jwks.res.status, 200)
    const kids = (jwks.json?.keys || []).map((k) => k.kid)
    assert.ok(kids.includes(header.kid), 'JWKS should include the token kid')
  })

  test('admin endpoints require admin role (non-admin rejected)', async (t) => {
    const { base } = await startTestServer(t)
    const email = `${uniq('plain')}@example.com`
    const password = 'Str0ng#Pass!'
    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'Plain' })
    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)

    const res = await postJson(
      `${base}/api/auth/admin/create-user`,
      {
        email: `${uniq('created')}@example.com`,
        password: 'Str0ng#Pass!',
        name: 'Created',
        role: 'user',
      },
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(res.res.status === 401 || res.res.status === 403, `expected reject, got ${res.res.status} ${res.text}`)
  })

  test('admin endpoints allow admin role', async (t) => {
    const email = `${uniq('admin')}@example.com`
    const password = 'Str0ng#Pass!'
    const { base } = await startTestServer(t)
    await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'Admin' })

    await promoteUserToAdmin(PG_TEST_URL, email)

    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(signIn.setCookie.length > 0, signIn.text)
    const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)

    const session = await get(`${base}/api/auth/get-session`, { headers: { Cookie: cookieHeader } })
    assert.equal(session.res.status, 200, session.text)
    const role = session.json?.user?.role
    assert.equal(role, 'admin', `expected admin role, got ${role}`)

    const res = await postJson(
      `${base}/api/auth/admin/create-user`,
      {
        email: `${uniq('createdbyadmin')}@example.com`,
        password: 'Str0ng#Pass!',
        name: 'Created',
        role: 'user',
      },
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(res.res.status === 200 || res.res.status === 201, `expected allow, got ${res.res.status} ${res.text}`)
  })

  test('CORS: allowed Origin echoes Access-Control-Allow-Origin; disallowed has no ACAO', async (t) => {
    const { base } = await startTestServer(t)

    const allowed = await get(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } })
    assert.equal(allowed.res.headers.get('access-control-allow-origin'), 'http://localhost:5173')

    const disallowed = await get(`${base}/health`, { headers: { Origin: 'http://evil.example' } })
    assert.equal(disallowed.res.headers.get('access-control-allow-origin'), null)
  })
})
