import fs from 'node:fs'
import { google } from 'googleapis'
import { getPgPool } from '../pgPool.js'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FULL_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const OAUTH_CALLBACK_PATH = '/api/auth/google/callback'

/** @type {Map<string, string>} userId → Drive folder id */
const folderIdCache = new Map()

let redirectUriLogged = false

export function resolveGoogleRedirectUri() {
  const explicit = String(process.env.GOOGLE_REDIRECT_URI || '').trim()
  if (explicit) return explicit
  const base = String(process.env.BETTER_AUTH_URL || 'http://localhost:5173').replace(/\/$/, '')
  return `${base}${OAUTH_CALLBACK_PATH}`
}

export function getGoogleOAuthScopes() {
  return [DRIVE_SCOPE, USERINFO_EMAIL_SCOPE]
}

export function tokenHasDriveFileScope(grantedScopes) {
  const raw = String(grantedScopes ?? '').trim()
  if (!raw) return false
  const parts = raw.split(/\s+/).map((s) => s.trim()).filter(Boolean)
  return parts.some((s) => s === DRIVE_SCOPE || s === FULL_DRIVE_SCOPE || s.endsWith('/auth/drive'))
}

export function getMissingDriveScopes(grantedScopes) {
  if (tokenHasDriveFileScope(grantedScopes)) return []
  return [DRIVE_SCOPE]
}

export function isInsufficientScopeError(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    (msg.includes('insufficient') && (msg.includes('scope') || msg.includes('permission'))) ||
    msg.includes('access_token_scope_insufficient')
  )
}

function googleConfigured() {
  return Boolean(
    String(process.env.GOOGLE_CLIENT_ID || '').trim() &&
      String(process.env.GOOGLE_CLIENT_SECRET || '').trim() &&
      resolveGoogleRedirectUri(),
  )
}

export function logGoogleRedirectUriOnce() {
  if (redirectUriLogged || !googleConfigured()) return
  redirectUriLogged = true
  console.log(`[google-drive] OAuth redirect URI: ${resolveGoogleRedirectUri()}`)
}

function folderName() {
  return String(process.env.GOOGLE_DRIVE_FOLDER_NAME || 'LenLearn Backups').trim() || 'LenLearn Backups'
}

export function isGoogleDriveConfigured() {
  return googleConfigured()
}

export function getGoogleClientIdSuffix() {
  const id = String(process.env.GOOGLE_CLIENT_ID || '').trim()
  if (!id) return null
  return id.length > 8 ? id.slice(-8) : id
}

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    resolveGoogleRedirectUri(),
  )
}

export function getGoogleConsentUrl(state) {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: getGoogleOAuthScopes(),
    state,
  })
}

export async function exchangeCodeForTokens(code) {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  return tokens
}

export async function saveOAuthPendingState(state, userId, ttlMinutes = 10) {
  const pool = getPgPool()
  const st = String(state || '').trim()
  const uid = String(userId || '').trim()
  if (!st || !uid) throw new Error('state and user_id required')
  await pool.query(`DELETE FROM public.google_oauth_pending WHERE expires_at < NOW()`)
  await pool.query(
    `
    INSERT INTO public.google_oauth_pending (state, user_id, expires_at)
    VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'))
    ON CONFLICT (state) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      expires_at = EXCLUDED.expires_at
    `,
    [st, uid, ttlMinutes],
  )
}

/** @returns {Promise<string|null>} user id if state is valid */
export async function consumeOAuthPendingState(state) {
  const pool = getPgPool()
  const st = String(state || '').trim()
  if (!st) return null
  const { rows } = await pool.query(
    `
    DELETE FROM public.google_oauth_pending
    WHERE state = $1 AND expires_at > NOW()
    RETURNING user_id
    `,
    [st],
  )
  return rows?.[0]?.user_id ? String(rows[0].user_id) : null
}

export async function persistGdriveFolderId(userId, folderId) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  const fid = String(folderId || '').trim()
  if (!uid || !fid) return
  await pool.query(
    `UPDATE public.google_oauth_tokens SET gdrive_folder_id = $2, updated_at = NOW() WHERE user_id = $1`,
    [uid, fid],
  )
  folderIdCache.set(uid, fid)
}

async function loadStoredFolderId(userId) {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT gdrive_folder_id FROM public.google_oauth_tokens WHERE user_id = $1 LIMIT 1`,
    [String(userId).trim()],
  )
  const fid = String(rows?.[0]?.gdrive_folder_id ?? '').trim()
  return fid || null
}

export async function saveTokensForUser(userId, tokens, connectedEmail = null) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  if (!uid) throw new Error('user_id required')

  const expiry = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null
  const grantedScopes = String(tokens.scope || '').trim() || null

  await pool.query(
    `
    INSERT INTO public.google_oauth_tokens
      (user_id, access_token, refresh_token, token_expiry, connected_email, granted_scopes, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
      token_expiry = EXCLUDED.token_expiry,
      connected_email = COALESCE(EXCLUDED.connected_email, google_oauth_tokens.connected_email),
      granted_scopes = COALESCE(EXCLUDED.granted_scopes, google_oauth_tokens.granted_scopes),
      updated_at = NOW()
    `,
    [
      uid,
      String(tokens.access_token || ''),
      tokens.refresh_token ? String(tokens.refresh_token) : null,
      expiry,
      connectedEmail ? String(connectedEmail) : null,
      grantedScopes,
    ],
  )
}

export async function deleteTokensForUser(userId) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  if (!uid) return false
  const r = await pool.query(`DELETE FROM public.google_oauth_tokens WHERE user_id = $1`, [uid])
  folderIdCache.delete(uid)
  return Number(r?.rowCount ?? 0) > 0
}

export async function getTokenRowForUser(userId) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  if (!uid) return null
  const { rows } = await pool.query(
    `SELECT connected_email, refresh_token, access_token, granted_scopes, gdrive_folder_id
     FROM public.google_oauth_tokens WHERE user_id = $1 LIMIT 1`,
    [uid],
  )
  return rows?.[0] || null
}

export async function getTokenStatusForUser(userId) {
  const row = await getTokenRowForUser(userId)
  if (!row) return { connected: false, email: null, grantedScopes: null, needsReconnect: false }
  const hasToken = Boolean(String(row.access_token || '').trim() || String(row.refresh_token || '').trim())
  const grantedScopes = row.granted_scopes ? String(row.granted_scopes) : null
  return {
    connected: hasToken,
    email: row.connected_email ? String(row.connected_email) : null,
    grantedScopes,
    needsReconnect: hasToken && !tokenHasDriveFileScope(grantedScopes),
  }
}

export async function needsDriveReconnect(userId) {
  const status = await getTokenStatusForUser(userId)
  return Boolean(status.connected && status.needsReconnect)
}

export async function hasTokensForUser(userId) {
  const status = await getTokenStatusForUser(userId)
  return status.connected && !status.needsReconnect
}

/** @returns {Promise<{ id: string, email: string | null } | null>} */
export async function findConnectedDriveAdminActor() {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `
    SELECT user_id, connected_email, granted_scopes
    FROM public.google_oauth_tokens
    WHERE COALESCE(NULLIF(trim(access_token), ''), NULLIF(trim(refresh_token), '')) IS NOT NULL
    ORDER BY updated_at DESC NULLS LAST
    `,
  )
  for (const row of rows || []) {
    if (!row?.user_id) continue
    if (!tokenHasDriveFileScope(row.granted_scopes)) continue
    return {
      id: String(row.user_id),
      email: row.connected_email ? String(row.connected_email) : null,
    }
  }
  return null
}

async function loadTokensRow(userId) {
  const pool = getPgPool()
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expiry FROM public.google_oauth_tokens WHERE user_id = $1 LIMIT 1`,
    [String(userId).trim()],
  )
  return rows?.[0] || null
}

async function persistRefreshedTokens(userId, credentials) {
  const pool = getPgPool()
  const expiry = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : credentials.expires_in
      ? new Date(Date.now() + Number(credentials.expires_in) * 1000)
      : null
  const grantedScopes = String(credentials.scope || '').trim() || null
  await pool.query(
    `
    UPDATE public.google_oauth_tokens
    SET access_token = $2,
        refresh_token = COALESCE($3, refresh_token),
        token_expiry = $4,
        granted_scopes = COALESCE($5, granted_scopes),
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [
      String(userId).trim(),
      String(credentials.access_token || ''),
      credentials.refresh_token ? String(credentials.refresh_token) : null,
      expiry,
      grantedScopes,
    ],
  )
}

export async function getAuthenticatedClient(userId) {
  if (!googleConfigured()) return null
  const row = await loadTokensRow(userId)
  if (!row?.access_token && !row?.refresh_token) return null

  const client = createOAuthClient()
  client.setCredentials({
    access_token: row.access_token || undefined,
    refresh_token: row.refresh_token || undefined,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
  })

  const expiryMs = row.token_expiry ? new Date(row.token_expiry).getTime() : 0
  const needsRefresh = !row.access_token || (expiryMs > 0 && expiryMs <= Date.now() + 60_000)
  if (needsRefresh && row.refresh_token) {
    const { credentials } = await client.refreshAccessToken()
    client.setCredentials(credentials)
    await persistRefreshedTokens(userId, credentials)
  }

  return client
}

export async function fetchGoogleAccountEmail(oauth2Client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data } = await oauth2.userinfo.get()
  return data?.email ? String(data.email) : null
}

/** Create folder only (no files.list) — works with drive.file scope. */
export async function resolveBackupFolderId(drive, userId) {
  const uid = String(userId)
  const cached = folderIdCache.get(uid)
  if (cached) return cached

  const stored = await loadStoredFolderId(uid)
  if (stored) {
    folderIdCache.set(uid, stored)
    return stored
  }

  const name = folderName()
  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
    },
    fields: 'id',
  })

  const folderId = createRes?.data?.id
  if (!folderId) throw new Error('Could not create Google Drive backup folder')

  await persistGdriveFolderId(uid, folderId)
  return folderId
}

/** @returns {Promise<{ fileId: string, link: string } | null>} */
export async function uploadBackupToDrive({ userId, filePath, filename }) {
  if (!googleConfigured()) return null
  if (!userId || !filePath || !fs.existsSync(filePath)) return null

  if (await needsDriveReconnect(userId)) {
    throw new Error('GOOGLE_DRIVE_NEEDS_RECONNECT: Google Drive permissions are outdated. Disconnect and reconnect.')
  }

  const auth = await getAuthenticatedClient(userId)
  if (!auth) return null

  const drive = google.drive({ version: 'v3', auth })
  const folderId = await resolveBackupFolderId(drive, userId)
  const uploadName = String(filename || '').trim() || 'backup.lnbak'

  const createRes = await drive.files.create({
    requestBody: {
      name: uploadName,
      mimeType: 'application/octet-stream',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink, webContentLink',
  })

  const fileId = createRes?.data?.id
  if (!fileId) throw new Error('Google Drive upload returned no file id')

  const link =
    createRes?.data?.webViewLink ||
    createRes?.data?.webContentLink ||
    `https://drive.google.com/file/d/${fileId}/view`

  return { fileId: String(fileId), link: String(link) }
}
