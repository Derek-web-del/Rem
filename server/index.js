import {
  LENLEARN_DOTENV_CANDIDATES,
  LENLEARN_DOTENV_LOADED_FROM,
} from './env-bootstrap.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bytes from 'bytes'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { toNodeHandler } from 'better-auth/node'
import { createStateApiRouter } from './api/state.js'
import { createTeacherApiRouter } from './api/teacher.js'
import { createStudyMaterialsV1Router } from './api/studyMaterialsV1.js'
import { createQuizzesV1Router } from './api/quizzesV1.js'
import { createAdminCurriculumGuidesRouter } from './api/adminCurriculumGuides.js'
import { createMonitoringRouter } from './routes/monitoring.js'
import { createBackupRouter } from './routes/backup.js'
import { startBackupScheduler, stopBackupScheduler } from './jobs/backupScheduler.js'
import { ensureBackupSchema, isBackupDbConfigured } from './lib/backupSchema.js'
import { getPgPool } from './pgPool.js'
import { verifySmtpTransporter } from './mail.js'
import sanitizeInput from './middleware/sanitizeInput.js'
import { sendSafeServerError } from './lib/safeApiError.js'

console.log('Current working directory:', process.cwd())
console.log('[env] .env candidates (checked in order):', LENLEARN_DOTENV_CANDIDATES.join(' | '))
console.log('[env] .env loaded from:', LENLEARN_DOTENV_LOADED_FROM)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

function parseMs(raw, fallbackMs) {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallbackMs
}

function rateLimitJsonHandler(_req, res) {
  res
    .status(429)
    .json({ error: 'Too many attempts. Please wait before trying again.' })
}

function makeLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitJsonHandler,
  })
}

/** Faculty / announcement images as base64 exceed body-parser's default ~100kb cap without this. */
const BODY_PARSER_LIMIT = String(process.env.EXPRESS_BODY_LIMIT || '10mb').trim() || '10mb'
const BODY_PARSER_BYTES =
  typeof bytes.parse(BODY_PARSER_LIMIT) === 'number' ? bytes.parse(BODY_PARSER_LIMIT) : 10 * 1024 * 1024

function isRequestAbortedError(err) {
  if (!err) return false
  if (err.type === 'request.aborted') return true
  const nested = err.cause || err.err
  if (nested?.type === 'request.aborted') return true
  return /request aborted|aborted/i.test(String(err.message || ''))
}

/** Catches raw-body / body-parser failures so they never crash the Node process. */
function expressBodyParserErrorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    console.error('[Body-Parser Guard] Request body exceeded limit:', err.message)
    if (!res.headersSent) {
      res.status(413).json({
        success: false,
        error: 'Request body too large. Use a smaller image or raise EXPRESS_BODY_LIMIT.',
      })
    }
    return
  }
  if (isRequestAbortedError(err)) {
    console.error(
      '[Body-Parser Guard] Request payload was aborted by the client or connection timed out.',
    )
    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        error: 'Payload size limit exceeded or connection aborted.',
      })
    }
    return
  }
  next(err)
}

export async function createApp() {
  const app = express()

  // Trust proxy headers for correct req.ip behind reverse proxies (ngrok/CDN),
  // but avoid the permissive `true` setting which express-rate-limit rejects.
  // - Dev/local: only trust loopback proxies (ngrok agent on same machine).
  // - Prod: trust exactly one proxy hop (e.g. CDN/load balancer in front of Node).
  const env = process.env.NODE_ENV || 'development'
  const trustProxy =
    process.env.TRUST_PROXY != null && process.env.TRUST_PROXY !== ''
      ? process.env.TRUST_PROXY
      : env === 'production'
        ? 1
        : 'loopback'
  app.set('trust proxy', trustProxy)

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
        },
      },
      hsts:
        env === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      noSniff: true,
      xssFilter: true,
      frameguard: { action: 'deny' },
    }),
  )

  // Load auth module instance keyed by DATABASE_URL (+ optional AUTH_MODULE_INSTANCE) so tests
  // can swap connection targets in the same Node process without a stale Better Auth handle.
  const authInstanceKey = encodeURIComponent(
    [
      process.env.DATABASE_URL || '',
      process.env.NODE_ENV || '',
      process.env.AUTH_MODULE_INSTANCE || '',
    ].join('|'),
  )
  const { auth, authStartupInfo, findAuthUserIdByEmail } = await import(
    `./auth.js?instance=${authInstanceKey}`,
  )
  app.locals.authStartupInfo = authStartupInfo

function parseCorsOrigins() {
  const out = new Set()
  const base = String(process.env.BETTER_AUTH_URL || '').trim()
  if (base) out.add(new URL(base).origin)
  const extra = String(process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const o of extra) out.add(new URL(o).origin)
  // Local dev defaults
  out.add('http://localhost:5173')
  out.add('http://127.0.0.1:5173')
  return [...out]
}

  console.log(
    `[server] express.json / urlencoded body limit: ${BODY_PARSER_LIMIT} (${BODY_PARSER_BYTES} bytes)`,
  )
  app.use(express.json({ limit: BODY_PARSER_BYTES }))
  app.use(express.urlencoded({ limit: BODY_PARSER_BYTES, extended: true }))
  app.use(expressBodyParserErrorHandler)
  app.use(
    '/uploads',
    express.static(path.join(__dirname, '..', 'public', 'uploads'), {
      maxAge: env === 'production' ? '7d' : 0,
    }),
  )
  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      // JWT plugin may set this on session responses; expose if the browser reads it.
      exposedHeaders: ['set-auth-jwt'],
    }),
  )

  app.use('/api', sanitizeInput)

  // Per-IP rate limits (separate instances per endpoint).
  // Defaults match review guidance; tests can override via env.
  const isDev = (process.env.NODE_ENV || 'development') !== 'production'
  const RL_WINDOW_MS = parseMs(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  const apiReadLimiter = makeLimiter({
    windowMs: RL_WINDOW_MS,
    max: Number(process.env.RATE_LIMIT_MAX_GET || (isDev ? 1000 : 100)),
  })
  const apiWriteLimiter = makeLimiter({
    windowMs: RL_WINDOW_MS,
    max: Number(process.env.RATE_LIMIT_MAX_POST || (isDev ? 500 : 50)),
  })
  app.use('/api', (req, res, next) => {
    const path = String(req.originalUrl || req.path || '').split('?')[0]
    if (path.startsWith('/api/auth')) return next()
    const m = String(req.method || 'GET').toUpperCase()
    if (m === 'GET' || m === 'HEAD') return apiReadLimiter(req, res, next)
    if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
      return apiWriteLimiter(req, res, next)
    }
    return next()
  })
  const signInLimiter = makeLimiter({
    windowMs: parseMs(process.env.RATE_LIMIT_WINDOW_MS_SIGNIN, RL_WINDOW_MS),
    max: Number(process.env.RATE_LIMIT_MAX_SIGNIN || 10),
  })
  app.post('/api/auth/sign-in/username', signInLimiter)
  app.post('/api/auth/sign-in/email', signInLimiter)
  app.post('/api/auth/sign-in', signInLimiter)
  app.post(
    '/api/auth/two-factor/send-otp',
    makeLimiter({
      windowMs: parseMs(process.env.RATE_LIMIT_WINDOW_MS_SEND_OTP, RL_WINDOW_MS),
      max: Number(process.env.RATE_LIMIT_MAX_SEND_OTP || 5),
    }),
  )
  app.post(
    '/api/auth/two-factor/verify-otp',
    makeLimiter({
      windowMs: parseMs(process.env.RATE_LIMIT_WINDOW_MS_VERIFY_OTP, RL_WINDOW_MS),
      max: Number(process.env.RATE_LIMIT_MAX_VERIFY_OTP || 10),
    }),
  )
  app.get(
    '/api/auth/token',
    makeLimiter({
      windowMs: parseMs(process.env.RATE_LIMIT_WINDOW_MS_TOKEN, RL_WINDOW_MS),
      max: Number(process.env.RATE_LIMIT_MAX_TOKEN || 30),
    }),
  )

// Hard-disable public self-registration unless explicitly enabled.
// Seeding sets AUTH_DISABLE_SIGNUP=false, so setup scripts can still create users.
app.post('/api/auth/sign-up/email', (req, res, next) => {
  if (process.env.AUTH_DISABLE_SIGNUP !== 'false') {
    return res.status(403).json({
      error: 'SIGNUP_DISABLED',
      message: 'Registration is disabled. Contact an administrator.',
    })
  }
  return next()
})

// Guardrail: if someone configures an auth base URL that already includes `/api/auth`,
// some clients end up calling `/api/auth/api/auth/...`. Redirect to the correct path.
app.all('/api/auth/api/auth/*', (req, res) => {
  const fixed = req.originalUrl.replace('/api/auth/api/auth/', '/api/auth/')
  res.redirect(307, fixed)
})

app.all('/api/auth/*', toNodeHandler(auth))

  /** Institute admin: reliable email → auth user id (same DB as Better Auth; avoids empty `list-users` on SQLite). */
  app.post('/api/lms/admin/auth-user-id-by-email', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers })
      const role = String(session?.user?.role || '').trim().toLowerCase()
      if (!session?.user?.id || role !== 'admin') {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Institute admin session required.' })
        return
      }
      const email = String(req.body?.email || '').trim().toLowerCase()
      if (!email) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'email is required.' })
        return
      }
      const userId = await findAuthUserIdByEmail(email)
      res.json({ userId: userId || null })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/lms/admin/auth-user-id-by-email')
    }
  })

  // Debug: call Better Auth Infra directly using current session userId.
  // This helps diagnose "Failed to fetch user audit logs (HTTP 500)" by returning the Infra response body.
  app.get('/api/debug/infra-user-events', async (req, res) => {
    try {
      const apiKey = String(process.env.BETTER_AUTH_API_KEY || '').trim()
      const apiUrl = String(process.env.BETTER_AUTH_API_URL || 'https://dash.better-auth.com').trim()
      if (!apiKey) {
        res.status(500).json({ error: 'MISSING_BETTER_AUTH_API_KEY' })
        return
      }

      const session = await auth.api.getSession({ headers: req.headers })
      const userId = session?.user?.id || session?.data?.user?.id
      if (!userId) {
        res.status(401).json({ error: 'NO_SESSION' })
        return
      }

      const url = new URL('/events/user', apiUrl)
      url.searchParams.set('userId', String(userId))
      url.searchParams.set('limit', '5')
      url.searchParams.set('offset', '0')

      const r = await fetch(url, {
        headers: {
          'x-api-key': apiKey,
          'user-agent': req.headers['user-agent'] || 'lenlearn-auth-server',
        },
      })
      const text = await r.text()
      res.status(r.status).type('application/json').send(text)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/debug/infra-user-events')
    }
  })

  const stateApi = await createStateApiRouter(express, { auth })
  app.use('/api', stateApi.router)
  app.use('/api', createTeacherApiRouter(express, auth))
  app.use('/api', createStudyMaterialsV1Router(express, auth))
  app.use('/api', createQuizzesV1Router(express, auth))
  app.use('/api', createAdminCurriculumGuidesRouter(express, auth))

  // Audit logs (LMS rows + target user JOIN)
  const { createLogsApiRouter } = await import('./api/logs.js')
  app.use('/api', createLogsApiRouter(express, auth))

  // Monitoring APIs (LMS + Better Auth dash audit logs)
  app.use('/api', createMonitoringRouter(express, auth))

  // Data backup & restore (admin only) — schema once at startup (avoids concurrent CREATE races)
  if (isBackupDbConfigured()) {
    await ensureBackupSchema(getPgPool())
  }
  try {
    const { isPgConfigured } = await import('./pgPool.js')
    if (isPgConfigured()) {
      const { ensureFacultyStudyMaterialsSchema } = await import('./lib/facultyStudyMaterialsDb.js')
      await ensureFacultyStudyMaterialsSchema(getPgPool())
      const { ensureQuizzesSchema } = await import('./lib/quizzesDb.js')
      await ensureQuizzesSchema(getPgPool())
    }
  } catch (e) {
    console.warn('[startup] study_materials schema bootstrap skipped:', e?.message || e)
  }
  app.use('/api/backup', createBackupRouter(express, auth))
  startBackupScheduler()
  const { closePgPool } = await import('./pgPool.js')
  app.locals.disposeAuthBackend = async () => {
    stopBackupScheduler()
    try {
      await stateApi.close?.()
    } catch {}
    try {
      await closePgPool()
    } catch {}
  }

  // Root route so http://localhost:3001/ is not a 404.
  app.get('/', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'lenlearn-auth-server',
      endpoints: {
        health: '/health',
        auth: '/api/auth/*',
        state: '/api/v1/state',
        monitoring: '/api/monitoring/*',
        backup: '/api/backup/*',
      },
    })
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use((err, req, res, next) => {
    if (isRequestAbortedError(err)) {
      console.error(
        '[Body-Parser Guard] Request payload was aborted by the client or connection timed out.',
      )
      if (!res.headersSent) {
        res.status(400).json({
          success: false,
          error: 'Payload size limit exceeded or connection aborted.',
        })
      }
      return
    }
    if (err?.type === 'entity.too.large') {
      console.error('[Body-Parser Guard] Request body exceeded limit:', err.message)
      if (!res.headersSent) {
        res.status(413).json({
          success: false,
          error: 'Request body too large. Use a smaller image or raise EXPRESS_BODY_LIMIT.',
        })
      }
      return
    }
    console.error('[Server Error]:', err?.stack || err)
    if (res.headersSent) {
      next(err)
      return
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    })
  })

  return app
}

export async function startServer() {
  const port = Number(process.env.PORT || process.env.AUTH_SERVER_PORT || 3001)
  console.log(
    `[auth] Server bind: port=${port} (env PORT=${process.env.PORT || ''} AUTH_SERVER_PORT=${process.env.AUTH_SERVER_PORT || ''}; default 3001 for Vite proxy)`,
  )
  const app = await createApp()
  const server = app.listen(port, () => {
    console.log(`Better Auth server listening on http://localhost:${port}`)
  })

  server.on('clientError', (err, socket) => {
    if (isRequestAbortedError(err) || err?.code === 'ECONNABORTED') {
      console.error('[Body-Parser Guard] clientError (connection aborted):', err.message)
      if (!socket.destroyed) socket.destroy()
      return
    }
    console.error('[server] clientError:', err?.message || err)
    if (!socket.destroyed) socket.destroy()
  })
  // SMTP verification is informative; do not block HTTP readiness on remote SMTP latency.
  void verifySmtpTransporter().catch((err) => {
    console.error('[smtp] verify failed during async startup:', err?.message || err)
  })

  // Non-sensitive startup diagnostics (helps catch env/config mistakes).
  const info = app.locals.authStartupInfo || {}
  // eslint-disable-next-line no-shadow
  const env = process.env.NODE_ENV || 'development'
  const smtpConfigured = !!((process.env.SMTP_USER || '').trim() && (process.env.SMTP_PASS || '').trim())
  const baseURL = info.baseURL
  const trustedOrigins = info.trustedOrigins || []
  const databaseUrl = info.databaseUrl || ''
  const crossOriginCookies = !!info.crossOriginSessionCookies

  console.log(`[auth] NODE_ENV=${env}`)
  console.log(`[auth] baseURL=${baseURL}`)
  console.log(`[auth] database=${databaseUrl}`)
  console.log(`[auth] crossOriginSessionCookies (SameSite=None; Secure)=${crossOriginCookies ? 'yes' : 'no'}`)
  console.log(`[auth] SMTP configured=${smtpConfigured ? 'yes' : 'no'}`)
  console.log(`[auth] trustedOrigins (${trustedOrigins.length}):`)
  for (const o of trustedOrigins) console.log(`  - ${o}`)

  if (baseURL && !trustedOrigins.includes(baseURL)) {
    console.warn(
      `[auth] WARNING: baseURL origin is not present in trustedOrigins. This is likely misconfiguration.`,
    )
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[auth] Port ${port} is already in use.\n` +
          `  • Run "npm run dev" (it picks a free port automatically), or\n` +
          `  • Set AUTH_SERVER_PORT to another port in .env and update Vite proxy to match.`,
      )
      process.exit(1)
    }
    throw err
  })

  return server
}

// Start server when executed directly.
// Do not compare import.meta.url to new URL(argv[1], 'file:') — on Windows argv[1]
// uses backslashes and URL resolution differs, so isMain was false and the process
// exited immediately with code 0 (dev.mjs: "exited before ready").
function isRunAsCliEntry() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    const here = path.resolve(fileURLToPath(import.meta.url))
    const there = path.resolve(entry)
    return path.normalize(here) === path.normalize(there)
  } catch {
    return false
  }
}

if (isRunAsCliEntry()) {
  await startServer()
}
