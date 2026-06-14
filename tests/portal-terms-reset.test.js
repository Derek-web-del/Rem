import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { BETTER_AUTH_RESET_JWKS_FOR_TESTS, BETTER_AUTH_SECRET_FOR_TESTS } from './load-test-env.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const portalDescribe = PG_TEST_URL ? describe : describe.skip

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

async function promoteUserToAdmin(connectionString, email) {
  const pool = new pg.Pool({ connectionString, max: 1 })
  try {
    await pool.query('UPDATE "user" SET role = $1 WHERE LOWER(email) = LOWER($2)', ['admin', email])
  } finally {
    await pool.end()
  }
}

portalDescribe('portal terms reset on logout', () => {
  test('sign-out clears admin terms acceptance for next login', async (t) => {
    const { base } = await startTestServer(t)
    const email = `${uniq('adminterms')}@example.com`
    const password = 'Str0ng#Pass!'

    const signUp = await postJson(`${base}/api/auth/sign-up/email`, {
      email,
      password,
      name: 'Admin Terms',
    })
    assert.ok(signUp.res.status === 200 || signUp.res.status === 201, signUp.text)

    await promoteUserToAdmin(PG_TEST_URL, email)

    const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(signIn.res.status === 200 || signIn.res.status === 201, signIn.text)
    const cookieHeader = cookieHeaderFromSetCookies(signIn.setCookie)
    assert.ok(cookieHeader, 'expected session cookie')

    const accept = await postJson(
      `${base}/api/v1/admin/accept-terms`,
      {},
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(accept.res.status === 200, accept.text)

    const beforeLogout = await get(`${base}/api/v1/admin/terms-status`, {
      headers: { Cookie: cookieHeader },
    })
    assert.equal(beforeLogout.res.status, 200)
    assert.equal(beforeLogout.json?.accepted, true)

    const signOut = await postJson(
      `${base}/api/auth/sign-out`,
      {},
      { headers: { Cookie: cookieHeader } },
    )
    assert.ok(signOut.res.status === 200 || signOut.res.status === 201, signOut.text)

    const pool = new pg.Pool({ connectionString: PG_TEST_URL, max: 1 })
    try {
      const { rows } = await pool.query(
        `SELECT terms_accepted FROM "user" WHERE LOWER(email) = LOWER($1)`,
        [email],
      )
      assert.equal(rows[0]?.terms_accepted, false, 'DB terms_accepted should be false after sign-out')
    } finally {
      await pool.end()
    }

    const signInAgain = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
    assert.ok(signInAgain.res.status === 200 || signInAgain.res.status === 201, signInAgain.text)
    const cookie2 = cookieHeaderFromSetCookies(signInAgain.setCookie)

    const afterLogout = await get(`${base}/api/v1/admin/terms-status`, {
      headers: { Cookie: cookie2 },
    })
    assert.equal(afterLogout.res.status, 200)
    assert.equal(afterLogout.json?.accepted, false, 'terms-status should be false after logout')
  })
})
