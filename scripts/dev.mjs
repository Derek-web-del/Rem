/**
 * Starts the auth API and Vite together, using the first free port from 3001
 * so EADDRINUSE does not crash the dev stack.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { findFreePort } from './find-free-port.mjs'

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

if (!String(process.env.DATABASE_URL || '').trim()) {
  console.warn(
    '[dev] DATABASE_URL is not set. The auth server will exit immediately until you add a PostgreSQL URL to .env (see .env.example).',
  )
} else {
  console.log('[dev] DATABASE_URL is set (PostgreSQL for auth + institute state).')
}

const authPort = await findFreePort(Number(process.env.AUTH_SERVER_PORT || 3001))
const vitePreferredPort = Number(process.env.VITE_DEV_SERVER_PORT || 5173)
const vitePort = await findFreePort(vitePreferredPort)

if (vitePort !== vitePreferredPort) {
  console.warn(
    `[dev] Port ${vitePreferredPort} is in use; Vite will use ${vitePort} instead. ` +
      `Open http://localhost:${vitePort}/ (auth cookies/CORS use this origin for this run).`,
  )
}

const viteOrigin = `http://localhost:${vitePort}`
const viteOrigin127 = `http://127.0.0.1:${vitePort}`
const trustedOrigins = [
  ...new Set(
    String(process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .concat([viteOrigin, viteOrigin127]),
  ),
]

const env = {
  ...process.env,
  // Keep server/index.js bind logic aligned with readiness polling.
  PORT: String(authPort),
  AUTH_SERVER_PORT: String(authPort),
  VITE_PROXY_AUTH_PORT: String(authPort),
  VITE_DEV_SERVER_PORT: String(vitePort),
  // Match the actual Vite origin so session cookies / CORS align when port != 5173.
  BETTER_AUTH_URL: viteOrigin,
  BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins.join(','),
}

console.log(`[dev] Auth API will use port ${authPort} (proxy /api/auth → http://127.0.0.1:${authPort})`)
console.log(`[dev] Vite dev server will use port ${vitePort} (${viteOrigin})`)

const authChild = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
  cwd: root,
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

const authLogTail = []
const AUTH_LOG_TAIL_MAX = 250

function appendAuthTail(prefix, chunk) {
  const text = String(chunk || '')
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue
    authLogTail.push(`${prefix}${line}`)
    if (authLogTail.length > AUTH_LOG_TAIL_MAX) authLogTail.shift()
  }
}

authChild.stdout?.setEncoding('utf8')
authChild.stderr?.setEncoding('utf8')
authChild.stdout?.on('data', (chunk) => {
  process.stdout.write(chunk)
  appendAuthTail('', chunk)
})
authChild.stderr?.on('data', (chunk) => {
  process.stderr.write(chunk)
  appendAuthTail('[stderr] ', chunk)
})

function waitForAuthReady() {
  const url = `http://127.0.0.1:${authPort}/health`
  const deadline = Date.now() + 30_000
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((r) => {
          if (r.ok) resolve()
          else if (Date.now() > deadline) {
            reject(
              new Error(
                `Auth server did not become ready in time (health URL: ${url}).\n` +
                  `Recent auth logs:\n${authLogTail.slice(-30).join('\n') || '(no auth output captured)'}`,
              ),
            )
          }
          else setTimeout(tick, 150)
        })
        .catch((err) => {
          if (Date.now() > deadline) {
            reject(
              new Error(
                `Auth server did not become ready in time (health URL: ${url}, last poll error: ${String(
                  err?.message || err || 'unknown',
                )}).\n` +
                  `Recent auth logs:\n${authLogTail.slice(-30).join('\n') || '(no auth output captured)'}`,
              ),
            )
          } else {
            setTimeout(tick, 150)
          }
        })
    }
    tick()
  })
}

await Promise.race([
  waitForAuthReady(),
  new Promise((_, reject) => {
    authChild.once('exit', (code) => {
      reject(new Error(`Auth server exited before ready (code ${code})`))
    })
  }),
])

const viteChild = spawn(process.execPath, [viteBin], {
  cwd: root,
  env,
  stdio: 'inherit',
})

function shutdown(code = 0) {
  authChild.kill('SIGTERM')
  viteChild.kill('SIGTERM')
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

authChild.on('exit', (code, signal) => {
  if (signal === 'SIGTERM') return
  console.error(`[dev] Auth server exited (${code ?? signal})`)
  viteChild.kill('SIGTERM')
  process.exit(code ?? 1)
})

viteChild.on('exit', (code, signal) => {
  if (signal === 'SIGTERM') return
  console.error(`[dev] Vite exited (${code ?? signal})`)
  authChild.kill('SIGTERM')
  process.exit(code ?? 1)
})
