import { getPgPool } from '../server/pgPool.js'
import { ensureBackupSchema } from '../server/lib/backupSchema.js'
import {
  isGoogleDriveConfigured,
  resolveGoogleRedirectUri,
  getGoogleClientIdSuffix,
} from '../server/lib/googleDriveUpload.js'

const pool = getPgPool()
if (!pool) {
  console.log('NO_DB — set DATABASE_URL in .env')
  process.exit(1)
}

await ensureBackupSchema(pool)

console.log('--- Google Drive backup diagnostics ---')
console.log('configured:', isGoogleDriveConfigured())
console.log('redirectUri:', resolveGoogleRedirectUri())
console.log('clientIdSuffix:', getGoogleClientIdSuffix() || '(not set)')
console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL || '(not set)')
console.log('GOOGLE_REDIRECT_URI (env):', process.env.GOOGLE_REDIRECT_URI || '(derived from BETTER_AUTH_URL)')

let pendingTable = false
let tokensTable = false
let tokenCount = 0
try {
  const { rows: tables } = await pool.query(
    `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('google_oauth_tokens', 'google_oauth_pending')
    `,
  )
  const names = new Set((tables || []).map((r) => r.table_name))
  tokensTable = names.has('google_oauth_tokens')
  pendingTable = names.has('google_oauth_pending')
  if (tokensTable) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM public.google_oauth_tokens`)
    tokenCount = rows?.[0]?.c ?? 0
  }
} catch (e) {
  console.warn('schema check failed:', e?.message || e)
}

console.log('google_oauth_tokens table:', tokensTable)
console.log('google_oauth_pending table:', pendingTable)
console.log('connected admin token rows:', tokenCount)

console.log('')
console.log('Add redirectUri to Google Cloud → Clients → Authorized redirect URIs')
console.log('Then: admin → Data Backup → Connect Google Drive')

process.exit(0)
