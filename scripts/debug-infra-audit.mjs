import 'dotenv/config'
import pg from 'pg'

const apiKey = (process.env.BETTER_AUTH_API_KEY || '').trim()
if (!apiKey) {
  console.error('Missing BETTER_AUTH_API_KEY in .env')
  process.exit(1)
}

const apiUrl = (process.env.BETTER_AUTH_API_URL || '').trim() || 'https://dash.better-auth.com'
const kvUrl = (process.env.BETTER_AUTH_KV_URL || '').trim() || 'https://kv.better-auth.com'

const dbUrl = String(process.env.DATABASE_URL || '').trim()
if (!dbUrl) {
  console.error('Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: dbUrl, max: 1 })
let userId = ''
try {
  const { rows } = await pool.query('SELECT id, email, role FROM "user" ORDER BY id ASC LIMIT 1')
  console.log('Sample user:', rows[0])
  userId = rows[0]?.id ? String(rows[0].id) : ''
} catch (e) {
  console.error('Failed to read user id:', e?.message || e)
  await pool.end().catch(() => {})
  process.exit(1)
}
await pool.end().catch(() => {})

if (!userId) {
  console.error('No user id found in auth database.')
  process.exit(1)
}

const eventsUrl = new URL('/events/user', apiUrl)
eventsUrl.searchParams.set('userId', userId)
eventsUrl.searchParams.set('limit', '5')
eventsUrl.searchParams.set('offset', '0')

const r = await fetch(eventsUrl, {
  headers: {
    'x-api-key': apiKey,
    'user-agent': 'lenlearn-debug-infra-audit',
  },
})
const text = await r.text()
console.log(`Dash ${eventsUrl.pathname} HTTP ${r.status}`)
console.log(text.slice(0, 4000))

console.log('\nKV URL (reference):', kvUrl)
