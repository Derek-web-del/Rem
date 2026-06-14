/**
 * Verify portal MFA flags and per-login terms reset on sign-out.
 * Run: npm run live:portal-auth  (requires npm run dev)
 */
import pg from 'pg'

const API = `http://127.0.0.1:${process.env.AUTH_SERVER_PORT || 3001}`
const ORIGIN = process.env.BETTER_AUTH_URL || 'http://localhost:5173'
const ADMIN_USER = process.env.SECURITY_EVIDENCE_USERNAME || 'admin'
const ADMIN_PASS = process.env.SECURITY_EVIDENCE_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'Admin123@'

let passed = 0
let failed = 0

function pass(name, notes = '') {
  passed++
  console.log(`[PASS] ${name}${notes ? ` — ${notes}` : ''}`)
}

function fail(name, notes = '') {
  failed++
  console.log(`[FAIL] ${name}${notes ? ` — ${notes}` : ''}`)
}

function getSetCookie(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
  const v = res.headers.get('set-cookie')
  return v ? [v] : []
}

function cookieHeader(setCookies) {
  return setCookies.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ')
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* */
  }
  return { res, json, text, setCookie: getSetCookie(res) }
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Origin: ORIGIN, ...headers } })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* */
  }
  return { res, json, text }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[live:portal-auth] DATABASE_URL missing — use --env-file=.env')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

  const mfaRows = await pool.query(`
    SELECT username, role, "twoFactorEnabled"
    FROM "user"
    WHERE LOWER(role) IN ('admin', 'teacher', 'student', 'faculty')
    ORDER BY role, username
  `)

  const mfaOff = mfaRows.rows.filter((r) => r.twoFactorEnabled !== true)
  if (mfaOff.length === 0) {
    pass('MFA enabled on all portal users', `${mfaRows.rows.length} users`)
  } else {
    fail(
      'MFA enabled on all portal users',
      `${mfaOff.length} off: ${mfaOff.map((r) => r.username).join(', ')} — run npm run ensure:portal-mfa`,
    )
  }

  const signIn = await postJson(`${API}/api/auth/sign-in/username`, {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  })

  if (signIn.res.status === 429) {
    console.error('[live:portal-auth] Rate limited (429). Restart npm run dev and retry.')
    await pool.end()
    process.exit(1)
  }

  if (!signIn.res.ok && !signIn.json?.twoFactorRedirect) {
    fail('Admin sign-in', `${signIn.res.status} ${signIn.text?.slice(0, 120)}`)
    await pool.end()
    process.exit(1)
  }

  if (signIn.json?.twoFactorRedirect) {
    pass('Admin sign-in requires OTP (twoFactorRedirect)', '')
  } else {
    fail('Admin sign-in requires OTP', 'no twoFactorRedirect — run npm run ensure:portal-mfa')
  }

  let cookies = cookieHeader(signIn.setCookie)

  if (signIn.json?.twoFactorRedirect) {
    const send = await postJson(`${API}/api/auth/two-factor/send-otp`, {}, { Cookie: cookies })
    if (!send.res.ok) {
      fail('Admin OTP send', `status=${send.res.status}`)
      await pool.end()
      process.exit(1)
    }
    pass('Admin OTP send', `status=${send.res.status} (verify manually in inbox)`)
    console.log('[live:portal-auth] Skipping OTP verify + terms cycle (SMTP/manual). Testing terms reset via DB + sign-out if session exists.')
  }

  if (!signIn.json?.twoFactorRedirect && cookies) {
    await postJson(`${API}/api/v1/admin/accept-terms`, {}, { Cookie: cookies })
    const termsBefore = await getJson(`${API}/api/v1/admin/terms-status`, { Cookie: cookies })
    if (termsBefore.json?.accepted === true) {
      pass('Admin terms accepted in session', '')
    }

    await postJson(`${API}/api/auth/sign-out`, {}, { Cookie: cookies })

    const adminRow = await pool.query(
      `SELECT terms_accepted FROM "user" WHERE LOWER(username) = LOWER($1)`,
      [ADMIN_USER],
    )
    if (adminRow.rows[0]?.terms_accepted === false) {
      pass('Admin terms reset on sign-out', 'terms_accepted=false in DB')
    } else {
      fail('Admin terms reset on sign-out', `terms_accepted=${adminRow.rows[0]?.terms_accepted}`)
    }
  } else {
    const adminRow = await pool.query(
      `SELECT terms_accepted, "twoFactorEnabled" FROM "user" WHERE LOWER(username) = LOWER($1)`,
      [ADMIN_USER],
    )
    if (adminRow.rows[0]?.twoFactorEnabled === true) {
      pass('Admin twoFactorEnabled in DB', '')
    } else {
      fail('Admin twoFactorEnabled in DB', 'false')
    }
    console.log('[live:portal-auth] Full terms-on-logout cycle requires completed OTP session — covered by tests/portal-terms-reset.test.js')
  }

  await pool.end()
  console.log(`\n[live:portal-auth] ${passed}/${passed + failed} passed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[live:portal-auth]', e)
  process.exit(1)
})
