/**
 * Reproduce auth.api.getAuditLogs → Infra GET /events/user and print the real failure.
 * Usage: node --env-file=.env scripts/debug-infra-audit-logs.mjs [userId]
 */
import { getPgPool } from '../server/pgPool.js'

const apiKey = String(process.env.BETTER_AUTH_API_KEY || '').trim()
const apiUrl = String(process.env.BETTER_AUTH_API_URL || 'https://dash.better-auth.com').trim()

async function resolveUserId() {
  const arg = process.argv[2]
  if (arg) return String(arg).trim()
  const pool = getPgPool()
  if (!pool) {
    console.error('No DATABASE_URL / pg pool — pass userId as argv[2]')
    process.exit(1)
  }
  const r = await pool.query(
    `SELECT id FROM "user" WHERE role = 'admin' ORDER BY "createdAt" DESC NULLS LAST LIMIT 1`,
  )
  return r.rows[0]?.id || null
}

async function main() {
  console.log('--- Infra getAuditLogs diagnostic ---')
  console.log('apiUrl:', apiUrl)
  console.log('apiKey set:', !!apiKey, apiKey ? `(len=${apiKey.length}, prefix=${apiKey.slice(0, 6)}…)` : '')
  console.log('BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL || '(unset)')
  console.log('DATABASE_URL set:', !!String(process.env.DATABASE_URL || '').trim())

  const pool = getPgPool()
  if (pool) {
    const t = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
      ) AS exists
    `)
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM public.audit_logs`).catch((e) => ({
      rows: [{ n: null, err: e.message }],
    }))
    console.log('public.audit_logs exists:', t.rows[0]?.exists)
    console.log(
      'public.audit_logs row count:',
      c.rows[0]?.n ?? `query failed: ${c.rows[0]?.err || 'unknown'}`,
    )
  }

  const userId = await resolveUserId()
  if (!userId) {
    console.error('No userId to test — pass one as argv[2]')
    process.exit(1)
  }
  console.log('test userId:', userId)

  if (!apiKey) {
    console.error('\nROOT CAUSE: BETTER_AUTH_API_KEY is missing.')
    console.error('getAuditLogs throws 500 "Events API is not configured" OR infra fetch fails.')
    console.error('Local ledger fallback: GET /api/monitoring/auth-audit-logs')
    process.exit(2)
  }

  const url = new URL('/events/user', apiUrl)
  url.searchParams.set('userId', userId)
  url.searchParams.set('limit', '5')
  url.searchParams.set('offset', '0')

  console.log('\nCalling:', url.toString())
  const r = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'user-agent': 'lenlearn-debug-infra-audit-logs',
    },
  })
  const text = await r.text()
  console.log('HTTP status:', r.status, r.statusText)
  console.log('Response body:\n', text.slice(0, 2000))

  if (!r.ok) {
    console.error('\nROOT CAUSE: Better Auth Infra /events/user returned', r.status)
    console.error('This is what dash getAuditLogs logs as "[Dash] Failed to fetch user audit logs:"')
    process.exit(3)
  }

  try {
    const json = JSON.parse(text)
    console.log('\nOK — events:', Array.isArray(json?.events) ? json.events.length : 'n/a', 'total:', json?.total)
  } catch {
    console.error('\nROOT CAUSE: Infra returned non-JSON')
    process.exit(4)
  }
}

main().catch((e) => {
  console.error('Script failed:', e)
  process.exit(1)
})
