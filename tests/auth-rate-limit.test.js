import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  BETTER_AUTH_RESET_JWKS_FOR_TESTS,
  BETTER_AUTH_SECRET_FOR_TESTS,
} from './load-test-env.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const pgTest = PG_TEST_URL ? test : test.skip

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

async function startApp(t, extraEnv = {}) {
  const env = {
    NODE_ENV: 'test',
    BETTER_AUTH_URL: 'http://localhost:5173',
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_FOR_TESTS,
    BETTER_AUTH_RESET_JWKS: BETTER_AUTH_RESET_JWKS_FOR_TESTS,
    AUTH_DISABLE_SIGNUP: 'false',
    DATABASE_URL: PG_TEST_URL,
    ...extraEnv,
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
  return `http://127.0.0.1:${port}`
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

async function getJson(url) {
  const res = await fetch(url)
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

pgTest('rate limits: sign-in username 11th returns 429 + headers', async (t) => {
  const base = await startApp(t, {
    AUTH_LOCK_MS: '1500',
    RATE_LIMIT_WINDOW_MS_SIGNIN: '60000',
    RATE_LIMIT_MAX_SIGNIN: '10',
  })

  for (let i = 0; i < 10; i++) {
    const { res } = await postJson(`${base}/api/auth/sign-in/username`, {
      username: 'nope',
      password: 'wrong',
    })
    assert.notEqual(res.status, 429)
  }
  const eleventh = await postJson(`${base}/api/auth/sign-in/username`, {
    username: 'nope',
    password: 'wrong',
  })
  assert.equal(eleventh.res.status, 429)
  assert.equal(eleventh.json?.error, 'Too many attempts. Please wait before trying again.')
  const limitHdr =
    eleventh.res.headers.get('ratelimit-limit') ||
    eleventh.res.headers.get('x-ratelimit-limit')
  const remainHdr =
    eleventh.res.headers.get('ratelimit-remaining') ||
    eleventh.res.headers.get('x-ratelimit-remaining')
  assert.ok(limitHdr, 'expected RateLimit-Limit or X-RateLimit-Limit header')
  assert.ok(remainHdr, 'expected RateLimit-Remaining or X-RateLimit-Remaining header')
})

pgTest('rate limits: OTP send 6th returns 429', async (t) => {
  const base = await startApp(t, {
    AUTH_LOCK_MS: '1500',
    RATE_LIMIT_WINDOW_MS_SEND_OTP: '300',
    RATE_LIMIT_MAX_SEND_OTP: '5',
  })

  for (let i = 0; i < 5; i++) {
    const { res } = await postJson(`${base}/api/auth/two-factor/send-otp`, {})
    assert.notEqual(res.status, 429)
  }
  const sixth = await postJson(`${base}/api/auth/two-factor/send-otp`, {})
  assert.equal(sixth.res.status, 429)
  assert.equal(sixth.json?.error, 'Too many attempts. Please wait before trying again.')
})

pgTest('rate limits reset after window passes', async (t) => {
  const base = await startApp(t, {
    AUTH_LOCK_MS: '1500',
    RATE_LIMIT_WINDOW_MS_SIGNIN: '500',
    RATE_LIMIT_MAX_SIGNIN: '5',
  })

  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      postJson(`${base}/api/auth/sign-in/username`, { username: 'nope', password: 'wrong' }),
    ),
  )
  assert.ok(attempts.some((a) => a.res.status === 429), 'expected at least one 429 within the window')

  await sleep(650)
  const afterWait = await postJson(`${base}/api/auth/sign-in/username`, { username: 'nope', password: 'wrong' })
  assert.notEqual(afterWait.res.status, 429, afterWait.text)
})

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

pgTest('account lockout still works (5 failed → locked) and expires', async (t) => {
  const base = await startApp(t, {
    AUTH_LOCK_MS: '800',
    RATE_LIMIT_MAX_SIGNIN: '1000',
    RATE_LIMIT_WINDOW_MS_SIGNIN: '5000',
  })

  const email = `${uniq('lockout')}@example.com`
  const goodPassword = 'Str0ng#Pass!'

  const signUp = await postJson(`${base}/api/auth/sign-up/email`, {
    email,
    password: goodPassword,
    name: 'Lockout User',
  })
  assert.ok(signUp.res.status === 200 || signUp.res.status === 201, `signup status ${signUp.res.status} ${signUp.text}`)

  for (let i = 0; i < 5; i++) {
    const attempt = await postJson(`${base}/api/auth/sign-in/email`, { email, password: 'wrong-password' })
    assert.notEqual(attempt.res.status, 429)
  }

  const locked = await postJson(`${base}/api/auth/sign-in/email`, { email, password: goodPassword })
  assert.equal(locked.res.status, 401)
  assert.ok(
    JSON.stringify(locked.json || locked.text).includes('INVALID_EMAIL_OR_PASSWORD'),
    `expected INVALID_EMAIL_OR_PASSWORD, got ${locked.text}`,
  )

  await sleep(900)
  const ok = await postJson(`${base}/api/auth/sign-in/email`, { email, password: goodPassword })
  assert.ok(ok.res.status === 200 || ok.res.status === 201, `expected success after lockout expires, got ${ok.res.status} ${ok.text}`)

  const tokenRes = await getJson(`${base}/api/auth/token`)
  assert.notEqual(tokenRes.res.status, 404)
})
