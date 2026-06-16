import crypto from 'node:crypto'

import { sendSafeServerError } from '../lib/safeApiError.js'

import { logBackupAudit } from '../lib/backupService.js'

import { ensureBackupSchema } from '../lib/backupSchema.js'

import { getPgPool } from '../pgPool.js'

import {

  consumeOAuthPendingState,

  deleteTokensForUser,

  exchangeCodeForTokens,

  fetchGoogleAccountEmail,

  getGoogleClientIdSuffix,

  getGoogleConsentUrl,

  getMissingDriveScopes,

  getTokenStatusForUser,

  isGoogleDriveConfigured,

  logGoogleRedirectUriOnce,

  resolveGoogleRedirectUri,

  saveOAuthPendingState,

  saveTokensForUser,

} from '../lib/googleDriveUpload.js'

import { toWebOrigin } from '../lib/webOrigin.js'



const OAUTH_STATE_COOKIE = 'lenlearn_gdrive_oauth_state'

const OAUTH_USER_COOKIE = 'lenlearn_gdrive_oauth_user'



function actorFromSession(session) {

  const user = session?.user || session?.data?.user || {}

  return {

    id: String(user.id || '').trim(),

    name: String(user.name || 'Administrator').trim(),

    email: String(user.email || '').trim(),

  }

}



function successRedirectUrl() {

  const custom = String(process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT || '').trim()

  if (custom) return custom

  const origin =
    toWebOrigin(process.env.BETTER_AUTH_URL || '') || 'http://localhost:5173'

  return `${origin}/admin/backup`

}



function parseCookies(req) {

  const raw = String(req.headers?.cookie || '')

  const out = {}

  for (const part of raw.split(';')) {

    const idx = part.indexOf('=')

    if (idx < 0) continue

    const k = part.slice(0, idx).trim()

    const v = part.slice(idx + 1).trim()

    if (k) out[k] = decodeURIComponent(v)

  }

  return out

}



function setCookie(res, name, value, maxAgeSec = 600) {

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''

  res.setHeader(

    'Set-Cookie',

    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`,

  )

}



function clearCookie(res, name) {

  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)

}



async function requireAdmin(req, res, auth) {

  const session = await auth.api.getSession({ headers: req.headers })

  const role = String(session?.user?.role || session?.data?.user?.role || '').trim().toLowerCase()

  if (!session?.user?.id || role !== 'admin') {

    res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Institute admin session required.' })

    return null

  }

  return session

}



async function resolveOAuthUserId(state, cookies) {

  const userIdFromDb = await consumeOAuthPendingState(state)

  if (userIdFromDb) return userIdFromDb



  const expectedState = cookies[OAUTH_STATE_COOKIE] || ''

  const userIdFromCookie = cookies[OAUTH_USER_COOKIE] || ''

  if (expectedState && userIdFromCookie && state === expectedState) {

    return userIdFromCookie

  }

  return null

}



export function createGoogleAuthRouter(express, auth) {

  const router = express.Router()



  router.get('/google', async (req, res) => {

    try {

      const session = await requireAdmin(req, res, auth)

      if (!session) return

      logGoogleRedirectUriOnce()

      if (!isGoogleDriveConfigured()) {

        res.status(503).json({

          success: false,

          error: 'GOOGLE_NOT_CONFIGURED',

          message:

            'Google Drive OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (redirect URI is derived from BETTER_AUTH_URL or GOOGLE_REDIRECT_URI).',

        })

        return

      }

      const pool = getPgPool()

      await ensureBackupSchema(pool)



      const actor = actorFromSession(session)

      const state = crypto.randomBytes(24).toString('hex')

      await saveOAuthPendingState(state, actor.id)

      setCookie(res, OAUTH_STATE_COOKIE, state)

      setCookie(res, OAUTH_USER_COOKIE, actor.id)

      const url = getGoogleConsentUrl(state)

      res.redirect(url)

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/auth/google')

    }

  })



  router.get('/google/callback', async (req, res) => {

    try {

      logGoogleRedirectUriOnce()

      if (!isGoogleDriveConfigured()) {

        res.redirect(`${successRedirectUrl()}?google_drive=error&reason=not_configured`)

        return

      }



      const pool = getPgPool()

      await ensureBackupSchema(pool)



      const cookies = parseCookies(req)

      const state = String(req.query?.state || '')

      const code = String(req.query?.code || '')

      const oauthError = String(req.query?.error || '')



      clearCookie(res, OAUTH_STATE_COOKIE)

      clearCookie(res, OAUTH_USER_COOKIE)



      if (oauthError || !code) {

        res.redirect(`${successRedirectUrl()}?google_drive=error&reason=denied`)

        return

      }



      const userId = await resolveOAuthUserId(state, cookies)

      if (!userId) {

        res.redirect(`${successRedirectUrl()}?google_drive=error&reason=invalid_state`)

        return

      }



      const tokens = await exchangeCodeForTokens(code)

      let email = null

      try {

        const { google } = await import('googleapis')

        const oauth2 = new google.auth.OAuth2(

          process.env.GOOGLE_CLIENT_ID,

          process.env.GOOGLE_CLIENT_SECRET,

          resolveGoogleRedirectUri(),

        )

        oauth2.setCredentials(tokens)

        email = await fetchGoogleAccountEmail(oauth2)

      } catch {

        email = null

      }

      await saveTokensForUser(userId, tokens, email)



      await logBackupAudit(

        { id: userId, name: 'Administrator', email: email || '' },

        'google_drive_connected',

        {

          description: 'Google Drive connected for automatic backup uploads',

          details: { connectedEmail: email },

        },

      )



      res.redirect(`${successRedirectUrl()}?google_drive=connected`)

    } catch (e) {

      console.error('[google-auth] callback error:', e?.message || e)

      res.redirect(`${successRedirectUrl()}?google_drive=error&reason=exchange_failed`)

    }

  })



  router.get('/google/status', async (req, res) => {

    try {

      const session = await requireAdmin(req, res, auth)

      if (!session) return

      const actor = actorFromSession(session)

      const status = await getTokenStatusForUser(actor.id)

      res.json({

        connected: Boolean(status.connected) && !status.needsReconnect,

        email: status.email || null,

        configured: isGoogleDriveConfigured(),

        needsReconnect: Boolean(status.needsReconnect),

        grantedScopes: status.grantedScopes || null,

        missingScopes: getMissingDriveScopes(status.grantedScopes),

      })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/auth/google/status')

    }

  })



  router.get('/google/diagnostics', async (req, res) => {

    try {

      const session = await requireAdmin(req, res, auth)

      if (!session) return

      logGoogleRedirectUriOnce()

      const actor = actorFromSession(session)

      const status = await getTokenStatusForUser(actor.id)

      res.json({

        configured: isGoogleDriveConfigured(),

        redirectUri: resolveGoogleRedirectUri(),

        clientIdSuffix: getGoogleClientIdSuffix(),

        connected: Boolean(status.connected) && !status.needsReconnect,

        connectedEmail: status.email || null,

        betterAuthUrl: String(process.env.BETTER_AUTH_URL || '').trim() || null,

        needsReconnect: Boolean(status.needsReconnect),

        grantedScopes: status.grantedScopes || null,

        missingScopes: getMissingDriveScopes(status.grantedScopes),

      })

    } catch (e) {

      sendSafeServerError(res, e, 'GET /api/auth/google/diagnostics')

    }

  })



  router.delete('/google/disconnect', async (req, res) => {

    try {

      const session = await requireAdmin(req, res, auth)

      if (!session) return

      const actor = actorFromSession(session)

      const status = await getTokenStatusForUser(actor.id)

      await deleteTokensForUser(actor.id)

      await logBackupAudit(actor, 'google_drive_disconnected', {

        description: 'Google Drive disconnected',

        details: { previousEmail: status.email || null },

      })

      res.json({ ok: true, connected: false })

    } catch (e) {

      sendSafeServerError(res, e, 'DELETE /api/auth/google/disconnect')

    }

  })



  return router

}


