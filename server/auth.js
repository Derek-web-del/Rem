import { LENLEARN_DOTENV_CANDIDATES, LENLEARN_DOTENV_LOADED_FROM } from './env-bootstrap.js'
import { betterAuth } from 'better-auth'
import { dash, sentinel } from '@better-auth/infra'
import { admin, jwt, twoFactor, username } from 'better-auth/plugins'
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import { sendPasswordResetEmail, sendTwoFactorOtpEmail } from './mail.js'
import {
  resolvePortalDisplayNameByEmail,
  syncAuthUserNameFromRoster,
} from './lib/portalDisplayName.js'
import { fetchAuthUserSnapshotForAudit, fetchAuthUsersByIds } from './api/logs.js'
import {
  computeAuthProfileDetailedDiffs,
  isAnyUserUpdatePath,
  isSelfUserUpdatePath,
  resolveProfileUpdateRequest,
} from './lib/profileAudit.js'
import { ensureAuditLogsSchema, insertAuditLogRecord } from './lib/auditLogsLedger.js'
import { customActivityLogger } from './services/CustomActivityLogger.js'
import { recordStudentLoginAudit } from './lib/studentLoginAudit.js'
import {
  LOCKOUT_REASON,
  MAX_LOCKOUT_ATTEMPTS,
  accountTypeFromRole,
  buildLockoutAuditPayload,
  dashboardModuleFromPortal,
  resolveClientIp,
  resolveLoginPortal,
  resolveUserAgent,
} from './lib/loginLockoutAudit.js'
import { clearPortalTermsOnLogout } from './lib/portalTermsReset.js'
import { hashPasswordBcrypt, verifyPasswordCompat } from './password.js'
import { getPgPool, isPgConfigured } from './pgPool.js'
import { toWebOrigin } from './lib/webOrigin.js'
import {
  STRONG_PASSWORD_REGEX,
  sanitizeSelfUpdateBody,
  validatePasswordStrength,
} from './lib/security.js'

function assertStrongPassword(password, label = 'Password') {
  try {
    validatePasswordStrength(password, label)
  } catch (e) {
    throw APIError.from('BAD_REQUEST', {
      code: e?.code || 'WEAK_PASSWORD',
      message: e?.message || `${label} does not meet strength requirements.`,
    })
  }
}

/** Account lockout duration after repeated failed sign-ins (tests override via AUTH_LOCK_MS). */
const LOCK_MS = Number(process.env.AUTH_LOCK_MS || 5 * 60 * 1000)

const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'

const infraApiKey = (process.env.BETTER_AUTH_API_KEY || '').trim()
// Infra endpoints (optional). Use the official env vars supported by @better-auth/infra.
// Defaults (when unset) are handled inside the infra package.
const infraApiUrl = (process.env.BETTER_AUTH_API_URL || '').trim()
const infraKvUrl = (process.env.BETTER_AUTH_KV_URL || '').trim()

// Infra Sentinel security checks call hosted endpoints like `/security/check`.
// If Infra is having issues during local dev, it can spam 500 logs even though your app still works.
// Keep enabled in production by default, but allow an explicit dev toggle.
const infraSecurityEnabled =
  process.env.INFRA_SECURITY_ENABLED != null
    ? String(process.env.INFRA_SECURITY_ENABLED).toLowerCase() === 'true'
    : (process.env.NODE_ENV || 'development') === 'production' && !!infraApiKey

const envSecret = (process.env.BETTER_AUTH_SECRET || '').trim()
const DEV_DEFAULT_SECRET = 'lenlearn-local-dev-only-min-32-char-secret!'
const isTest = process.env.NODE_ENV === 'test'

function assertAuthSecretConfigured() {
  if (envSecret.length < 32) {
    const msg =
      '[auth] BETTER_AUTH_SECRET must be set to a random string of at least 32 characters (see .env.example).'
    if (isProduction) {
      throw new Error(msg)
    }
    if (!isTest && !isDevelopment) {
      throw new Error(msg)
    }
  }
  if (isProduction) {
    if (!envSecret) {
      throw new Error('[auth] BETTER_AUTH_SECRET is required in production.')
    }
    if (!infraApiKey) {
      console.warn(
        '[auth] WARNING: BETTER_AUTH_API_KEY is not set; dash() audit logs and Infra activity tracking are disabled.',
      )
    }
    if (envSecret === DEV_DEFAULT_SECRET) {
      throw new Error(
        '[auth] BETTER_AUTH_SECRET is set to a known dev default. Refusing to start in production.',
      )
    }
  }
}

assertAuthSecretConfigured()

const authSecret = envSecret || DEV_DEFAULT_SECRET
if (!envSecret && isDevelopment) {
  // Prominent warning (yellow + bold) in dev.
  console.warn(
    '\x1b[33m\x1b[1m[auth] WARNING:\x1b[0m BETTER_AUTH_SECRET not set; using a dev-only default secret.',
  )
} else if (!envSecret) {
  console.warn('[auth] BETTER_AUTH_SECRET not set; using a dev-only default secret.')
}

/** Browser Origin is scheme+host+port only; env URLs with paths or trailing slashes must match that. */
const baseURL =
  toWebOrigin(process.env.BETTER_AUTH_URL || '') || 'http://localhost:5173'
const extraOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

// In dev, allow any localhost / 127.0.0.1 port (Vite may use 5174+, preview 4173, etc.)
const devOriginPatterns = isProduction
  ? []
  : [
      'http://localhost:*',
      'http://127.0.0.1:*',
      'https://*.ngrok-free.app',
      'https://*.ngrok-free.dev',
      'https://*.ngrok.io',
    ]

const localDevOrigins = isProduction
  ? []
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]

const trustedOrigins = [
  ...new Set([
    baseURL,
    ...localDevOrigins,
    ...extraOrigins.map((o) => toWebOrigin(o)).filter(Boolean),
    ...devOriginPatterns,
  ]),
]

// When the SPA runs on another site than `baseURL` (e.g. http://localhost:5173 + API on https://*.ngrok),
// browsers treat auth as cross-site; session cookies must use SameSite=None + Secure or credentialed
// fetches will not send the cookie and the UI looks "logged out". Enable only with HTTPS on `baseURL`.
const crossOriginSessionCookies =
  String(process.env.BETTER_AUTH_CROSS_ORIGIN_COOKIES || '').toLowerCase() === 'true'

if (!isPgConfigured()) {
  console.error(
    '[auth] DATABASE_URL is not set or empty. Set it in your root `.env` (e.g. postgres://user:pass@localhost:5432/lenlearn_db).',
  )
  console.error('[auth] .env files checked (in order):')
  for (const p of LENLEARN_DOTENV_CANDIDATES) {
    console.error(`  - ${p}`)
  }
  console.error('[auth] dotenv load result:', LENLEARN_DOTENV_LOADED_FROM)
  process.exit(1)
}

const authPgPool = getPgPool()
if (!authPgPool) {
  console.error('[auth] Could not create PostgreSQL pool (DATABASE_URL present but pool creation failed).')
  console.error('[auth] .env files checked (in order):')
  for (const p of LENLEARN_DOTENV_CANDIDATES) {
    console.error(`  - ${p}`)
  }
  console.error('[auth] dotenv load result:', LENLEARN_DOTENV_LOADED_FROM)
  process.exit(1)
}

function redactedDatabaseUrl() {
  try {
    const u = new URL(String(process.env.DATABASE_URL || '').trim())
    const user = u.username ? `${u.username.slice(0, 2)}***` : ''
    const auth = user ? `${user}@` : ''
    return `${u.protocol}//${auth}${u.host}${u.pathname}`
  } catch {
    return '(invalid DATABASE_URL)'
  }
}

async function runStartupDbStep(label, fn, timeoutMs = Number(process.env.AUTH_STARTUP_DB_STEP_TIMEOUT_MS || 12000)) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000
  const started = Date.now()
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `[auth] startup DB step timed out after ${ms}ms: ${label} (database=${redactedDatabaseUrl()})`,
              ),
            ),
          ms,
        ),
      ),
    ])
    console.log(`[auth] startup DB step ok: ${label} (${Date.now() - started}ms)`)
  } catch (e) {
    console.error(`[auth] startup DB step failed: ${label} (${Date.now() - started}ms):`, e?.message || e)
    throw e
  }
}

/**
 * Better Auth `user` additional columns (Postgres). Idempotent if migrate already applied them.
 */
async function ensurePostgresUserFacultyProfileColumns(pool) {
  try {
    await pool.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "facultyQualification" text`)
    await pool.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "facultyContactNumber" text`)
  } catch (e) {
    console.warn('[auth] ensurePostgresUserFacultyProfileColumns:', e?.message || e)
  }
}

await runStartupDbStep('postgres connectivity check', async () => {
  await authPgPool.query('SELECT 1')
})
await runStartupDbStep('ensurePostgresUserFacultyProfileColumns', async () => {
  await ensurePostgresUserFacultyProfileColumns(authPgPool)
})
await runStartupDbStep('ensureAuthUserUsernameEmailWidth', async () => {
  await ensureAuthUserUsernameEmailWidth(authPgPool)
})
await runStartupDbStep('ensureJwksResetIfRequested', async () => {
  await ensureJwksResetIfRequested(authPgPool)
})
await runStartupDbStep('ensureAuditLogsSchema', async () => {
  await ensureAuditLogsSchema(authPgPool)
})

/**
 * Better Auth `username` / `email` length: older migrations may use VARCHAR(50) etc.
 * Long generated emails (e.g. `user1_xxx@example.com`) must fit.
 */
async function ensureAuthUserUsernameEmailWidth(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user'
        AND column_name IN ('username', 'email')
    `)
    for (const row of rows || []) {
      const col = String(row.column_name || '')
      const len = row.character_maximum_length
      if (!col || len == null || len <= 0 || len >= 255) continue
      await pool.query(`ALTER TABLE "user" ALTER COLUMN "${col}" TYPE VARCHAR(255)`)
    }
  } catch (e) {
    console.warn('[auth] ensureAuthUserUsernameEmailWidth:', e?.message || e)
  }
}

/**
 * When `BETTER_AUTH_RESET_JWKS` is truthy, drop stored JWT keys so they are recreated
 * with the current `BETTER_AUTH_SECRET` / private-key storage mode (see JWT plugin `jwks`).
 */
async function ensureJwksResetIfRequested(pool) {
  const raw = String(process.env.BETTER_AUTH_RESET_JWKS || '').trim().toLowerCase()
  if (!raw || raw === '0' || raw === 'false' || raw === 'no') return
  try {
    const { rows } = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'jwks'
      ) AS ok
    `)
    if (!rows?.[0]?.ok) return
    await pool.query('DELETE FROM jwks')
    console.warn('[auth] BETTER_AUTH_RESET_JWKS: cleared JWT JWKS rows (new keys on next token issue).')
  } catch (e) {
    console.warn('[auth] ensureJwksResetIfRequested:', e?.message || e)
  }
}

/**
 * Resolve Better Auth `user.id` by email (PostgreSQL).
 *
 * @param {string} email
 * @returns {Promise<string | null>}
 */
export async function findAuthUserIdByEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return null
  try {
    const { rows } = await authPgPool.query(
      'SELECT id FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [e],
    )
    const row = rows?.[0]
    return row?.id ? String(row.id) : null
  } catch (err) {
    console.warn('[auth] findAuthUserIdByEmail:', err?.message || err)
    return null
  }
}

// Export non-sensitive startup info for server logging.
export const authStartupInfo = {
  baseURL,
  trustedOrigins,
  databaseUrl: redactedDatabaseUrl(),
  crossOriginSessionCookies,
}

/**
 * JWT JWKS private keys in Postgres: encrypted at rest with BETTER_AUTH_SECRET (Better Auth default).
 * Set BETTER_AUTH_JWKS_DISABLE_ENCRYPTION=true only for local migration from legacy plaintext rows;
 * then run `npm run auth:clear-jwks` and remove the flag.
 */
const jwtJwkDisablePrivateKeyEncryption =
  String(process.env.BETTER_AUTH_JWKS_DISABLE_ENCRYPTION || '').toLowerCase() === 'true'

/** Production always verifies OTP before enabling 2FA; test may skip; dev only when env is explicit. */
function resolveTwoFactorSkipVerificationOnEnable() {
  const nodeEnv = process.env.NODE_ENV || 'development'
  if (nodeEnv === 'production') return false
  if (nodeEnv === 'test') return true
  return process.env.AUTH_TWO_FACTOR_SKIP_VERIFY_ON_ENABLE === 'true'
}

export const auth = betterAuth({
  baseURL,
  /** Session cookies, symmetric token crypto, and plugin field encryption derive from this secret. */
  secret: authSecret,
  database: authPgPool,
  trustedOrigins,
  experimental: {
    joins: true,
  },
  advanced: {
    ipAddress: {
      // Helps Better Auth + infra plugins identify the real client IP behind proxies/CDNs.
      // Order matters: prefer platform-specific header first, then fall back.
      ipAddressHeaders: [
        'cf-connecting-ip', // Cloudflare
        'x-vercel-forwarded-for', // Vercel
        'x-real-ip', // Nginx/Ingress
        'x-forwarded-for', // Generic proxy chain
      ],
    },
    defaultCookieAttributes: {
      httpOnly: true,
      path: '/',
      sameSite: crossOriginSessionCookies ? 'none' : 'lax',
      secure: isProduction || crossOriginSessionCookies,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    disableSignUp: process.env.AUTH_DISABLE_SIGNUP !== 'false',
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      const rosterName = await resolvePortalDisplayNameByEmail(user.email)
      const greetingName = rosterName || user.name || user.email
      if (rosterName) {
        await syncAuthUserNameFromRoster(user.id, rosterName, user.name)
      }
      await sendPasswordResetEmail({
        to: user.email,
        name: greetingName,
        resetUrl: url,
      })
      const headers = request?.headers
      const source =
        (typeof headers?.get === 'function' ? headers.get('x-lenlearn-reset-source') : headers?.['x-lenlearn-reset-source']) ||
        'self'
      const initiatedByAdminId =
        (typeof headers?.get === 'function'
          ? headers.get('x-lenlearn-reset-initiated-by')
          : headers?.['x-lenlearn-reset-initiated-by']) || null
      const ipAddress = resolveClientIp({ headers: request?.headers, request })
      try {
        if (String(source || 'self').trim() !== 'admin') {
          await customActivityLogger.logPasswordResetRequested(user.id, {
            email: String(user.email || '').trim().toLowerCase(),
            source: 'self',
            ipAddress,
          })
        }
      } catch {
        /* ignore — admin-initiated resets are logged from adminPasswordResetV1 */
      }
    },
    onPasswordReset: async ({ user }, request) => {
      const ipAddress = resolveClientIp({ headers: request?.headers, request })
      try {
        await customActivityLogger.logPasswordResetCompleted(user.id, {
          email: String(user.email || '').trim().toLowerCase(),
          source: 'self',
          ipAddress,
        })
      } catch {
        /* ignore */
      }
    },
    password: {
      hash: async (password) => hashPasswordBcrypt(password),
      verify: async ({ hash, password }) => verifyPasswordCompat({ hash, password }),
    },
  },
  user: {
    additionalFields: {
      failedLoginAttempts: {
        type: 'number',
        required: false,
        defaultValue: 0,
        input: false,
      },
      lockedUntil: {
        type: 'date',
        required: false,
        input: false,
      },
      /** Synced from institute faculty record so teacher dashboard can show them without LMS JSON. */
      facultyQualification: {
        type: 'string',
        required: false,
        defaultValue: '',
        input: false,
      },
      facultyContactNumber: {
        type: 'string',
        required: false,
        defaultValue: '',
        input: false,
      },
      /** @better-auth/infra dash() activity tracking (updated every updateInterval while session is active). */
      lastActiveAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const p = ctx.path

      if (p === '/sign-up/email' && ctx.body?.password) {
        assertStrongPassword(ctx.body.password)
      }
      if (p === '/change-password' && ctx.body?.newPassword) {
        assertStrongPassword(ctx.body.newPassword, 'New password')
      }
      if (p === '/reset-password' && ctx.body?.newPassword) {
        assertStrongPassword(ctx.body.newPassword, 'New password')
      }

      const pathNorm = String(p || '').replace(/\\/g, '/')
      if (isSelfUserUpdatePath(pathNorm) && ctx.body) {
        sanitizeSelfUpdateBody(ctx.body)
      }

      if (pathNorm.endsWith('/sign-out')) {
        try {
          const sessionCookieToken = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          )
          if (sessionCookieToken) {
            const found = await ctx.context.internalAdapter.findSession(sessionCookieToken)
            const user = found?.user ?? null
            if (user?.id) {
              ctx.context._logoutUser = user
            } else if (found?.session?.userId) {
              const row = await ctx.context.internalAdapter.findUserById(String(found.session.userId))
              const resolved = row?.user ?? row
              if (resolved?.id) ctx.context._logoutUser = resolved
            }
          }
        } catch {
          /* session lookup optional */
        }
      }

      if (isAnyUserUpdatePath(pathNorm) && ctx.body) {
        const sessionUserId = ctx.context.session?.user?.id
        const { targetId, patch } = resolveProfileUpdateRequest(pathNorm, ctx.body, sessionUserId)
        if (targetId && patch && Object.keys(patch).length) {
          try {
            let beforeUser = null
            const found = await ctx.context.internalAdapter.findUserById(String(targetId))
            beforeUser = found?.user ?? found ?? null
            if (!beforeUser) {
              beforeUser = await fetchAuthUserSnapshotForAudit(targetId)
            }
            if (beforeUser) {
              ctx.context._profileAuditBefore = {
                targetId: String(targetId),
                user: beforeUser,
                patch,
              }
            }
          } catch {
            /* snapshot optional; after hook may still diff against patch */
          }
        }
      }

      if (p !== '/sign-in/email' && p !== '/sign-in/username') return

      const body = ctx.body
      if (!body) return

      let user = null
      if (p === '/sign-in/email' && body.email) {
        const row = await ctx.context.internalAdapter.findUserByEmail(body.email)
        user = row?.user ?? row
      }
      if (p === '/sign-in/username' && body.username) {
        const normalized = String(body.username).toLowerCase()
        user = await ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'username', value: normalized }],
        })
      }

      if (user?.lockedUntil) {
        const until = new Date(user.lockedUntil).getTime()
        if (until > Date.now()) {
          const identifier =
            p === '/sign-in/username'
              ? String(body.username || '').trim()
              : String(body.email || '').trim().toLowerCase()
          const portal = resolveLoginPortal(ctx)
          const lockPayload = buildLockoutAuditPayload({
            user,
            identifier,
            attempts: Number(user.failedLoginAttempts || MAX_LOCKOUT_ATTEMPTS),
            lockedUntil: new Date(until).toISOString(),
            portal,
            ipAddress: resolveClientIp(ctx),
            userAgent: resolveUserAgent(ctx),
            cooldownMs: LOCK_MS,
            reason: 'Sign-in blocked: account is in lockout cooldown after 5 failed attempts',
          })
          try {
            await customActivityLogger.logLockedAccountSignInAttempt(
              user.id,
              lockPayload,
              {
                userEmail: lockPayload.userEmail || undefined,
                userRole: lockPayload.userRole || undefined,
              },
            )
          } catch {
            /* ignore */
          }
          throw APIError.from('UNAUTHORIZED', {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
          })
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned
      const p = ctx.path
      const pathNorm = String(p || '').replace(/\\/g, '/')

      if (!isAPIError(returned)) {
        // Self-service profile updates only. Admin roster edits are audited once via
        // PUT /v1/faculty and PUT /v1/students (avoid duplicate with ensureFacultyAuthUser sync).
        if (isSelfUserUpdatePath(pathNorm)) {
          const session = ctx.context.session
          const actorId = session?.user?.id ? String(session.user.id) : ''
          if (actorId) {
            const snap = ctx.context._profileAuditBefore
            const { targetId, patch, source } = resolveProfileUpdateRequest(
              pathNorm,
              ctx.body,
              actorId,
            )
            const resolvedTargetId = snap?.targetId || targetId
            const patchForDiff = snap?.patch || patch
            let beforeUser = snap?.user || null
            if (!beforeUser && patchForDiff) {
              beforeUser = (await fetchAuthUserSnapshotForAudit(resolvedTargetId)) || null
            }
            const detailedDiffs =
              beforeUser && patchForDiff ? computeAuthProfileDetailedDiffs(beforeUser, patchForDiff) : {}
            const updatedFieldKeys = Object.keys(detailedDiffs)
            if (resolvedTargetId && updatedFieldKeys.length) {
              try {
                const usersById = await fetchAuthUsersByIds([resolvedTargetId, actorId])
                const targetProfile = usersById.get(resolvedTargetId)
                const actorProfile = usersById.get(actorId)
                const returnedUser = returned?.user ?? returned?.data?.user ?? null
                await customActivityLogger.logUserAccountChanged(String(resolvedTargetId), {
                  actorUserId: actorId,
                  actorName:
                    actorProfile?.name ||
                    session.user?.name ||
                    '',
                  actorEmail:
                    actorProfile?.email ||
                    session.user?.email ||
                    '',
                  actorRole: String(actorProfile?.role || session.user?.role || 'user'),
                  triggerContext: 'user',
                  userName:
                    targetProfile?.name ||
                    (typeof returnedUser?.name === 'string' ? returnedUser.name : '') ||
                    '',
                  userEmail:
                    targetProfile?.email ||
                    (typeof returnedUser?.email === 'string' ? returnedUser.email : '') ||
                    '',
                  updatedFields: updatedFieldKeys,
                  detailedDiffs,
                  source: 'user',
                })
              } catch (err) {
                console.warn('[auth] user_account_changed audit log failed:', err?.message || err)
              }
            }
          }
        }

        if (pathNorm.includes('/admin/set-user-password') && ctx.body?.userId) {
          const session = ctx.context.session
          const actorId = session?.user?.id ? String(session.user.id) : ''
          const targetId = String(ctx.body.userId).trim()
          if (actorId && targetId) {
            try {
              const usersById = await fetchAuthUsersByIds([targetId, actorId])
              const targetProfile = usersById.get(targetId)
              const actorProfile = usersById.get(actorId)
              await customActivityLogger.logUserAccountChanged(targetId, {
                actorUserId: actorId,
                actorName: actorProfile?.name || session.user?.name || '',
                actorEmail: actorProfile?.email || session.user?.email || '',
                actorRole: 'admin',
                triggerContext: 'admin',
                userName: targetProfile?.name || '',
                userEmail: targetProfile?.email || '',
                updatedFields: ['password'],
                detailedDiffs: { password: { old: '[redacted]', new: '[changed]' } },
                source: 'admin',
              })
              await customActivityLogger.logPasswordChanged(actorId, {
                targetUserId: targetId,
                source: 'admin',
              })
            } catch (err) {
              console.warn('[auth] password audit log failed:', err?.message || err)
            }
          }
        }

        if (pathNorm.includes('/change-password') && !isAPIError(returned)) {
          const session = ctx.context.session
          const actorId = session?.user?.id ? String(session.user.id) : ''
          if (actorId) {
            try {
              await customActivityLogger.logPasswordChanged(actorId, {
                targetUserId: actorId,
                source: 'self',
              })
            } catch {
              /* ignore */
            }
          }
        }
      }

      if (p === '/sign-in/email' || p === '/sign-in/username') {
        if (!isAPIError(returned) && returned?.user?.id) {
          await ctx.context.internalAdapter.updateUser(returned.user.id, {
            failedLoginAttempts: 0,
            lockedUntil: null,
          })

          const identifier =
            p === '/sign-in/username'
              ? String(ctx.body?.username || '').trim()
              : String(ctx.body?.email || '').trim().toLowerCase()
          try {
            await customActivityLogger.logUserSignedIn(
              String(returned.user.id),
              {
                identifier,
                userName: String(returned.user?.name || '').trim(),
                userEmail: String(returned.user?.email || '').trim().toLowerCase(),
                method: p === '/sign-in/username' ? 'username' : 'email',
                userRole: String(returned.user?.role || '').trim(),
                username: String(returned.user?.username || '').trim(),
                sessionId: String(returned.session?.id || returned.sessionId || ''),
                userAgent: String(ctx.headers?.get?.('user-agent') || '').trim(),
              },
              {
                userEmail: String(returned.user?.email || '').trim().toLowerCase(),
                userRole: String(returned.user?.role || '').trim() || undefined,
              },
            )
            await customActivityLogger.logUserSessionStarted(String(returned.user.id), {
              sessionId: String(returned.session?.id || returned.sessionId || ''),
              userName: String(returned.user?.name || '').trim(),
              userEmail: String(returned.user?.email || '').trim().toLowerCase(),
              userRole: String(returned.user?.role || '').trim(),
              method: p === '/sign-in/username' ? 'username' : 'email',
              userAgent: String(ctx.headers?.get?.('user-agent') || '').trim(),
            })
            await recordStudentLoginAudit(returned.user, '')
          } catch {
            /* ignore log failures */
          }
        }
      }

      if (pathNorm.endsWith('/sign-out') && !isAPIError(returned)) {
        const logoutUser = ctx.context._logoutUser || ctx.context.session?.user
        const uid = logoutUser?.id ? String(logoutUser.id) : ''
        if (uid) {
          const ip =
            ctx.headers?.get?.('x-forwarded-for')?.split?.(',')?.[0]?.trim() ||
            ctx.headers?.get?.('x-real-ip') ||
            ''
          try {
            await customActivityLogger.logUserSignedOut(uid, {
              userName: String(logoutUser?.name || '').trim(),
              userEmail: String(logoutUser?.email || '').trim().toLowerCase(),
              userRole: String(logoutUser?.role || '').trim(),
              ipAddress: ip,
              userAgent: String(ctx.headers?.get?.('user-agent') || '').slice(0, 512),
            })
          } catch {
            /* ignore */
          }
          try {
            await clearPortalTermsOnLogout(authPgPool, logoutUser)
          } catch {
            /* ignore */
          }
        }
      }

      if (pathNorm.includes('/sign-up/email') && !isAPIError(returned) && returned?.user?.id) {
        try {
          await customActivityLogger.logUserCreated(String(returned.user.id), {
            targetUserId: String(returned.user.id),
            targetEmail: String(returned.user.email || '').trim().toLowerCase(),
            targetName: String(returned.user.name || '').trim(),
            targetRole: String(returned.user.role || 'user').trim(),
            source: 'sign-up',
          })
        } catch {
          /* ignore */
        }
      }

      if (!isAPIError(returned)) return

      const errCode = returned.body?.code ?? returned.code
      if (
        errCode !== 'INVALID_EMAIL_OR_PASSWORD' &&
        errCode !== 'INVALID_USERNAME_OR_PASSWORD'
      ) {
        return
      }

      if (p !== '/sign-in/email' && p !== '/sign-in/username') return
      const body = ctx.body
      if (!body) return

      let user = null
      if (p === '/sign-in/email' && body.email) {
        const row = await ctx.context.internalAdapter.findUserByEmail(body.email)
        user = row?.user ?? row
      } else if (p === '/sign-in/username' && body.username) {
        const normalized = String(body.username).toLowerCase()
        user = await ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'username', value: normalized }],
        })
      }

      if (!user?.id) {
        const identifier =
          p === '/sign-in/username'
            ? String(body.username || '').trim()
            : String(body.email || '').trim().toLowerCase()
        const portal = resolveLoginPortal(ctx)
        try {
          await customActivityLogger.logLoginFailed({
            identifier,
            ipAddress: resolveClientIp(ctx),
            userAgent: resolveUserAgent(ctx),
            portal,
            suspiciousLoginDetected: true,
            reason: 'Invalid credentials',
          })
        } catch {
          /* ignore */
        }
        return
      }

      const prev = Number(user.failedLoginAttempts || 0)
      const next = prev + 1
      const patch = { failedLoginAttempts: next }
      if (next >= MAX_LOCKOUT_ATTEMPTS) {
        const until = new Date(Date.now() + LOCK_MS)
        patch.lockedUntil = until
        try {
          console.warn(
            `[auth] Account locked for ${LOCK_MS}ms (failed attempts: ${next}) userId=${user.id} until=${until.toISOString()}`,
          )
        } catch {}

        // Emit a Monitoring Records event once, at the moment the threshold is crossed.
        // This makes lockouts visible even if Infra audit logs are delayed/unavailable.
        if (prev < MAX_LOCKOUT_ATTEMPTS) {
          const identifier =
            p === '/sign-in/username'
              ? String(body.username || '').trim()
              : String(body.email || '').trim().toLowerCase()
          const portal = resolveLoginPortal(ctx)
          const lockPayload = buildLockoutAuditPayload({
            user,
            identifier,
            attempts: next,
            maxAttempts: MAX_LOCKOUT_ATTEMPTS,
            lockedUntil: until.toISOString(),
            portal,
            ipAddress: resolveClientIp(ctx),
            userAgent: resolveUserAgent(ctx),
            cooldownMs: LOCK_MS,
            reason: LOCKOUT_REASON,
          })
          const lockModule = dashboardModuleFromPortal(lockPayload.portal, lockPayload.userRole)
          try {
            await customActivityLogger.logAuthLockout(
              user.id,
              lockPayload,
              {
                userEmail: lockPayload.userEmail || undefined,
                userRole: lockPayload.userRole || undefined,
              },
            )
            await insertAuditLogRecord(
              'AUTH_LOCKOUT',
              {
                ...lockPayload,
                userId: String(user.id),
                displayType: 'Account Lockout',
                action: 'auth_lockout',
                module: lockModule,
              },
              {
                module: lockModule,
                action: 'auth_lockout',
                performed_by: String(user.id),
                performed_by_name: lockPayload.userName || lockPayload.userEmail || '',
                target_label: lockPayload.target_label || lockPayload.userName || lockPayload.loginId || null,
              },
            )
          } catch {}
        }
      }
      await ctx.context.internalAdapter.updateUser(user.id, patch)

      const identifier =
        p === '/sign-in/username'
          ? String(body.username || '').trim()
          : String(body.email || '').trim().toLowerCase()
      const portal = resolveLoginPortal(ctx)
      const userRole = String(user.role || '').trim()
      try {
        await customActivityLogger.logLoginFailed({
          identifier,
          targetUserId: String(user.id),
          username: String(user.username || '').trim(),
          userName: String(user.name || '').trim(),
          userEmail: String(user.email || '').trim().toLowerCase(),
          userRole,
          portal,
          accountType: accountTypeFromRole(userRole),
          attempts: next,
          ipAddress: resolveClientIp(ctx),
          userAgent: resolveUserAgent(ctx),
          suspiciousLoginDetected: true,
          reason:
            next >= MAX_LOCKOUT_ATTEMPTS
              ? LOCKOUT_REASON
              : `Failed sign-in (${next}/${MAX_LOCKOUT_ATTEMPTS} attempts)`,
        })
      } catch {
        /* ignore */
      }
    }),
  },
  plugins: [
    username({ maxUsernameLength: 255 }),
    admin({ defaultRole: 'user' }),
    jwt({
      jwks: {
        // false = encrypt private keys in `jwks` using BETTER_AUTH_SECRET (required in production).
        disablePrivateKeyEncryption: jwtJwkDisablePrivateKeyEncryption,
      },
      jwt: {
        /**
         * External services should not depend on internal user fields.
         * Keep the JWT payload minimal and stable.
         */
        definePayload: async (session) => {
          const u = session?.user || {}
          const id = typeof u.id === 'string' ? u.id : ''
          const email = typeof u.email === 'string' ? u.email : ''
          const role = typeof u.role === 'string' && u.role ? u.role : 'user'
          return { id, email, role }
        },
      },
    }),
    twoFactor({
      // Better Auth's 2FA "enable" endpoint defaults to requiring a TOTP verification
      // step before `user.twoFactorEnabled` flips true. LenLearn uses email-OTP 2FA,
      // so we enable immediately in test/dev when configured (not in production).
      skipVerificationOnEnable: resolveTwoFactorSkipVerificationOnEnable(),
      backupCodeOptions: {
        storeBackupCodes: 'encrypted',
      },
      otpOptions: {
        // Encrypted at rest in `twoFactor` using BETTER_AUTH_SECRET (not reversible hashes).
        storeOTP: 'encrypted',
        // Real SMTP via `server/mail.js` (Gmail `service: 'gmail'` or host/port). Not skipped in development when SMTP_USER + SMTP_PASS are set; optional console fallback only if AUTH_SMTP_DEV_FALLBACK=1 after a send error.
        sendOTP: async ({ user, otp }) => {
          try {
            await sendTwoFactorOtpEmail(user.email, otp)
          } catch (e) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'OTP_SEND_FAILED',
              message: String(e?.message || e || 'Could not send verification code.'),
            })
          }
        },
        period: 5,
      },
    }),
    // Sentinel: abuse + security protection (credential stuffing, suspicious IPs, velocity, etc.)
    // Use challenge-first defaults to avoid blocking legitimate users during testing.
    ...(infraSecurityEnabled
      ? [
          sentinel({
            apiKey: infraApiKey || undefined,
            apiUrl: infraApiUrl || undefined,
            kvUrl: infraKvUrl || undefined,
            security: {
              credentialStuffing: {
                enabled: true,
                thresholds: { challenge: 3, block: 8 },
                windowSeconds: 3600,
                cooldownSeconds: 900,
              },
              suspiciousIpBlocking: { action: 'challenge' },
              botBlocking: { action: 'challenge' },
              velocity: {
                enabled: true,
                thresholds: { challenge: 15, block: 40 },
                windowSeconds: 3600,
                action: 'challenge',
                maxSignupsPerVisitor: 5,
                maxPasswordResetsPerIp: 10,
                maxSignInsPerIp: 60,
              },
              compromisedPassword: { enabled: true, action: 'challenge', minBreachCount: 1 },
              emailNormalization: { enabled: true },
              // Avoid false positives in school labs / shared IPs; enable later if you want.
              impossibleTravel: { enabled: false, action: 'challenge' },
              geoBlocking: undefined,
            },
          }),
        ]
      : []),
    ...(infraApiKey
      ? [
          dash({
            apiKey: process.env.BETTER_AUTH_API_KEY,
            ...(infraApiUrl ? { apiUrl: infraApiUrl } : {}),
            ...(infraKvUrl ? { kvUrl: infraKvUrl } : {}),
            activityTracking: {
              // Requires BETTER_AUTH_API_KEY. In development, also set BETTER_AUTH_DASH_ACTIVITY=true.
              enabled:
                isProduction ||
                String(process.env.BETTER_AUTH_DASH_ACTIVITY || '').toLowerCase() === 'true',
              updateInterval: Number(process.env.BETTER_AUTH_ACTIVITY_INTERVAL_MS || 300000),
            },
          }),
        ]
      : []),
  ],
})
