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

function base64UrlDecodeJson(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json)
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

async function postJson(url, body, cookieHeader) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookieHeader) headers.Cookie = cookieHeader
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body ?? {}) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

async function getJson(url, cookieHeader) {
  const headers = {}
  if (cookieHeader) headers.Cookie = cookieHeader
  const res = await fetch(url, { headers })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    void 0
  }
  return { res, json, text }
}

pgTest('JWT token payload is minimal (id/email/role + standard claims only)', async (t) => {
  process.env.NODE_ENV = 'test'
  process.env.BETTER_AUTH_URL = 'http://localhost:5173'
  process.env.AUTH_DISABLE_SIGNUP = 'false'
  process.env.DATABASE_URL = PG_TEST_URL
  process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
  process.env.BETTER_AUTH_RESET_JWKS = BETTER_AUTH_RESET_JWKS_FOR_TESTS
  process.env.RATE_LIMIT_MAX_SIGNIN = '1000'
  process.env.RATE_LIMIT_MAX_TOKEN = '1000'

  runMigrate({
    NODE_ENV: 'test',
    BETTER_AUTH_URL: 'http://localhost:5173',
    BETTER_AUTH_SECRET: BETTER_AUTH_SECRET_FOR_TESTS,
    BETTER_AUTH_RESET_JWKS: BETTER_AUTH_RESET_JWKS_FOR_TESTS,
    AUTH_DISABLE_SIGNUP: 'false',
    DATABASE_URL: PG_TEST_URL,
  })

  process.env.AUTH_MODULE_INSTANCE = String(Date.now())
  const { createApp } = await import('../server/index.js')
  const { validateLenlearnJwt } = await import('../docs/validate-lms-jwt.mjs')

  const app = await createApp()
  const server = await listenTestServer(app)
  t.after(async () => {
    await teardownTestApp(server, app)
  })
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`

  const email = `jwt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'Str0ng#Pass!'

  const signUp = await postJson(`${base}/api/auth/sign-up/email`, { email, password, name: 'JWT User' })
  assert.ok(signUp.res.status === 200 || signUp.res.status === 201, `signup failed: ${signUp.res.status} ${signUp.text}`)

  const signIn = await postJson(`${base}/api/auth/sign-in/email`, { email, password })
  assert.ok(signIn.res.status === 200 || signIn.res.status === 201, `signin failed: ${signIn.res.status} ${signIn.text}`)

  const cookies = getSetCookie(signIn.res)
  assert.ok(cookies.length > 0, 'expected session Set-Cookie from sign-in')
  const cookieHeader = cookieHeaderFromSetCookies(cookies)

  const tokenRes = await getJson(`${base}/api/auth/token`, cookieHeader)
  assert.equal(tokenRes.res.status, 200, `token failed: ${tokenRes.res.status} ${tokenRes.text}`)
  const token = tokenRes.json?.token
  assert.equal(typeof token, 'string')
  const [h, p, s] = token.split('.')
  assert.ok(h && p && s, 'token must be a JWT (3 parts)')

  const payload = base64UrlDecodeJson(p)
  const keys = Object.keys(payload).sort()
  const expected = ['aud', 'email', 'exp', 'iat', 'id', 'iss', 'role', 'sub'].sort()
  assert.deepEqual(keys, expected)

  const jwksUrl = `${base}/api/auth/jwks`
  const ok = await validateLenlearnJwt({
    token,
    jwksUrl,
    issuer: 'http://localhost:5173',
    audience: 'http://localhost:5173',
  })
  assert.equal(ok.payload.sub, payload.sub)

  await assert.rejects(
    () =>
      validateLenlearnJwt({
        token,
        jwksUrl,
        issuer: 'https://wrong.example.com',
        audience: 'http://localhost:5173',
      }),
    /JWT validation failed|unexpected "iss"|issuer/i,
  )

  await assert.rejects(
    () =>
      validateLenlearnJwt({
        token,
        jwksUrl,
        issuer: 'http://localhost:5173',
        audience: 'https://wrong.example.com',
      }),
    /JWT validation failed|audience|unexpected "aud"/i,
  )
})
